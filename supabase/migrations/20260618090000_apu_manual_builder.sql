-- Migration: APU_MANUAL_BUILDER_V1 + BOQ_ADD_FROM_APU_V1
-- Agent: agent-db-rls (autorado por el orquestador).
-- Contrato: docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md §5.
--
-- TODO ADITIVO: columnas NULL/DEFAULT + tabla nueva + RPC SECURITY INVOKER.
-- Sin DROP, sin DELETE, sin TRUNCATE, sin backfill destructivo, sin cambio de
-- tipos. Retrocompatible. Solo local (sin db push remoto).
--
-- Habilita:
--   1) Crear APU manual desde la UI (origen explícito + autoría).
--   2) Agregar una actividad APU existente a un presupuesto editable como ítem
--      BOQ vinculado, con snapshot inicial calculado server-side, idempotente y
--      auditado, respetando la inmutabilidad de versiones emitidas.
--
-- UP

-- ===========================================================================
-- 1) apu_templates — origen explícito y autoría (aditivo, retrocompatible).
--    Las filas históricas quedan 'workbook_import' (default no destructivo);
--    created_by NULL en históricas (no había actor registrado).
-- ===========================================================================

ALTER TABLE apu_templates
  ADD COLUMN origin_type text NOT NULL DEFAULT 'workbook_import',
  ADD COLUMN created_by  uuid REFERENCES profiles (id) ON DELETE SET NULL;

ALTER TABLE apu_templates
  ADD CONSTRAINT apu_templates_origin_type_valid
  CHECK (origin_type IN ('manual', 'workbook_import'));

CREATE INDEX apu_templates_origin_type_idx ON apu_templates (organization_id, origin_type);

-- ===========================================================================
-- 2) apu_manual_actions — auditoría durable + idempotencia de las acciones
--    manuales (crear APU / agregar APU al BOQ). Inmutable: la RLS no concede
--    UPDATE/DELETE.
-- ===========================================================================

CREATE TABLE apu_manual_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  action_type      text NOT NULL,
  apu_template_id  uuid REFERENCES apu_templates (id) ON DELETE SET NULL,
  boq_item_id      uuid REFERENCES boq_items (id) ON DELETE SET NULL,
  initiated_by     uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  idempotency_key  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT apu_manual_actions_type_valid CHECK (
    action_type IN ('create_manual_apu', 'add_apu_to_boq')
  )
);

CREATE INDEX apu_manual_actions_org_created_idx
  ON apu_manual_actions (organization_id, created_at DESC);
CREATE INDEX apu_manual_actions_template_idx
  ON apu_manual_actions (apu_template_id)
  WHERE apu_template_id IS NOT NULL;
CREATE UNIQUE INDEX apu_manual_actions_org_idempotency_uq
  ON apu_manual_actions (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ===========================================================================
-- 3) RLS — ENABLE + FORCE, tenant-scoped, auditoría inmutable (append-only).
-- ===========================================================================

ALTER TABLE apu_manual_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE apu_manual_actions FORCE ROW LEVEL SECURITY;

CREATE POLICY apu_manual_actions_select ON apu_manual_actions
  FOR SELECT
  USING (organization_id = app.current_org());

CREATE POLICY apu_manual_actions_insert ON apu_manual_actions
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND app.current_role() IN ('admin', 'gerencia', 'presupuestos')
    AND initiated_by = app._auth_uid()
  );
-- Sin UPDATE/DELETE ⇒ inmutable.

-- ===========================================================================
-- 4) RPC pública: agregar un APU al BOQ de una versión editable.
--    * Calcula el costo unitario server-side a partir de los componentes
--      persistidos (NO acepta precio del cliente): reproduce
--      calculateApuUnitCostFull = Σ total_component_cost
--                                 + default_tool_pct × Σ total_component_cost(labor).
--      Un test de regresión fija la igualdad con getApuDetail().unitCostTotal.
--    * Bloquea versiones emitidas (estimate_version_locked) + check de estado.
--    * Valida capítulo ∈ versión y APU ∈ organización.
--    * Idempotente por (org, idempotency_key); replay devuelve el resultado
--      previo sin crear un segundo ítem.
--    * Append: nuevo sort_order; nunca sobrescribe ítems existentes.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.add_apu_to_boq(
  p_estimate_version_id uuid,
  p_chapter_id          uuid,
  p_apu_template_id     uuid,
  p_quantity            numeric,
  p_idempotency_key     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_uid        uuid := app._auth_uid();
  v_org        uuid := app.current_org();
  v_existing   record;
  v_version    record;
  v_tool_pct   numeric(20,10);
  v_code       text;
  v_name       text;
  v_unit       text;
  v_total_all  numeric(20,10);
  v_total_lab  numeric(20,10);
  v_unit_price numeric(20,10);
  v_subtotal   numeric(20,10);
  v_sort       integer;
  v_item_id    uuid;
  v_result     jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF app.current_role() NOT IN ('admin', 'gerencia', 'presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'invalid_quantity' USING errcode = 'P0001';
  END IF;

  -- Idempotencia por (org, key): devuelve el resultado previo sin reejecutar.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT metadata INTO v_existing
    FROM public.apu_manual_actions
    WHERE organization_id = v_org AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN (v_existing.metadata -> 'result');
    END IF;
  END IF;

  -- Versión: debe ser de la organización y EDITABLE (no emitida).
  SELECT ev.id, ev.status INTO v_version
  FROM public.estimate_versions ev
  JOIN public.estimates e ON e.id = ev.estimate_id
  JOIN public.project_scopes ps ON ps.id = e.project_scope_id
  JOIN public.projects p ON p.id = ps.project_id
  WHERE ev.id = p_estimate_version_id AND p.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_not_found' USING errcode = 'P0002';
  END IF;
  IF app.estimate_version_locked(p_estimate_version_id) THEN
    RAISE EXCEPTION 'version_locked' USING errcode = '42501';
  END IF;

  -- Capítulo: debe pertenecer a esa versión.
  PERFORM 1 FROM public.chapters
  WHERE id = p_chapter_id AND estimate_version_id = p_estimate_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chapter_not_in_version' USING errcode = 'P0002';
  END IF;

  -- APU: misma organización. Encabezado + tool pct.
  SELECT t.code, t.name, t.unit, t.default_tool_pct
    INTO v_code, v_name, v_unit, v_tool_pct
  FROM public.apu_templates t
  WHERE t.id = p_apu_template_id AND t.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apu_not_found' USING errcode = 'P0002';
  END IF;

  -- Costo unitario server-side desde componentes persistidos (defensa en
  -- profundidad; no se puede falsificar vía parámetro del cliente).
  SELECT
    COALESCE(SUM(total_component_cost), 0),
    COALESCE(SUM(total_component_cost) FILTER (WHERE component_type = 'labor'), 0)
    INTO v_total_all, v_total_lab
  FROM public.apu_components
  WHERE apu_template_id = p_apu_template_id;

  v_unit_price := round(v_total_all + v_tool_pct * v_total_lab, 10);
  v_subtotal   := round(p_quantity * v_unit_price, 10);

  -- Append: siguiente sort_order del capítulo.
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_sort
  FROM public.boq_items WHERE chapter_id = p_chapter_id;

  -- Crear ítem BOQ vinculado (el trigger set_boq_item_subtotal reafirma subtotal).
  INSERT INTO public.boq_items (
    estimate_version_id, chapter_id, apu_template_id, code,
    description_snapshot, unit_snapshot, quantity_snapshot,
    unit_price_snapshot, subtotal, sort_order
  ) VALUES (
    p_estimate_version_id, p_chapter_id, p_apu_template_id, v_code,
    v_name, v_unit, p_quantity,
    v_unit_price, v_subtotal, v_sort
  )
  RETURNING id INTO v_item_id;

  v_result := jsonb_build_object(
    'boqItemId', v_item_id,
    'apuTemplateId', p_apu_template_id,
    'chapterId', p_chapter_id,
    'quantity', p_quantity::text,
    'unitPrice', v_unit_price::text,
    'subtotal', v_subtotal::text,
    'status', 'created'
  );

  INSERT INTO public.apu_manual_actions (
    organization_id, action_type, apu_template_id, boq_item_id,
    initiated_by, idempotency_key, metadata
  ) VALUES (
    v_org, 'add_apu_to_boq', p_apu_template_id, v_item_id,
    v_uid, p_idempotency_key,
    jsonb_build_object('result', v_result)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.add_apu_to_boq(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_apu_to_boq(uuid, uuid, uuid, numeric, text) TO authenticated;

-- ===========================================================================
-- 5) RPC pública: crear un APU manual (encabezado + componentes) en UNA
--    transacción atómica, auditada.
--    * organization_id / created_by SIEMPRE server-side (jamás del payload).
--    * MATERIAL: el precio se re-resuelve en SQL desde la última observación
--      APROBADA del recurso (igual que la reconciliación); a prueba de
--      manipulación del cliente. Sin precio aprobado ⇒ error claro.
--    * LABOR: el snapshot (costo diario integral) lo calcula el dominio
--      canónico server-side (calculateLaborCost) y se pasa en el payload, igual
--      que import_apu_batch. La fórmula laboral NO se duplica en SQL.
--    * total_component_cost se recalcula en SQL (qty × (1+waste) × snapshot):
--      guard idéntico a apu_component_recompute_total y a la reconciliación.
--    * El trigger labor_role_same_org valida la pertenencia del rol.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.create_manual_apu(
  p_header          jsonb,
  p_components      jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_uid       uuid := app._auth_uid();
  v_org       uuid := app.current_org();
  v_existing  record;
  v_template  uuid;
  v_code      text := NULLIF(p_header->>'code', '');
  v_name      text := NULLIF(p_header->>'name', '');
  v_unit      text := NULLIF(p_header->>'unit', '');
  v_tool_pct  numeric(20,10) := COALESCE((p_header->>'defaultToolPct')::numeric, 0);
  v_comp      jsonb;
  v_type      text;
  v_res       uuid;
  v_role      uuid;
  v_qty       numeric(20,10);
  v_waste     numeric(20,10);
  v_price     numeric(20,10);
  v_total     numeric(20,10);
  v_sort      integer := 0;
  v_recon     text;
  v_source    text;
  v_result    jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF app.current_role() NOT IN ('admin', 'gerencia', 'presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF v_code IS NULL OR v_name IS NULL OR v_unit IS NULL THEN
    RAISE EXCEPTION 'invalid_header' USING errcode = 'P0001';
  END IF;
  IF v_tool_pct < 0 OR v_tool_pct > 1 THEN
    RAISE EXCEPTION 'invalid_tool_pct' USING errcode = 'P0001';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT metadata INTO v_existing
    FROM public.apu_manual_actions
    WHERE organization_id = v_org AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN (v_existing.metadata -> 'result');
    END IF;
  END IF;

  INSERT INTO public.apu_templates (
    organization_id, code, name, unit, description,
    default_tool_pct, origin_type, created_by, active
  ) VALUES (
    v_org, v_code, v_name, v_unit, NULLIF(p_header->>'description', ''),
    v_tool_pct, 'manual', v_uid, true
  )
  RETURNING id INTO v_template;

  FOR v_comp IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_components, '[]'::jsonb)) AS c(value)
  LOOP
    v_type  := v_comp->>'componentType';
    v_qty   := COALESCE((v_comp->>'quantity')::numeric, 0);
    v_waste := COALESCE((v_comp->>'wastePct')::numeric, 0);
    IF v_qty < 0 OR v_waste < 0 THEN
      RAISE EXCEPTION 'invalid_component_amounts' USING errcode = 'P0001';
    END IF;
    v_res  := NULLIF(v_comp->>'resourceId', '')::uuid;
    v_role := NULLIF(v_comp->>'laborRoleId', '')::uuid;

    IF v_type = 'material' THEN
      IF v_res IS NULL THEN
        RAISE EXCEPTION 'material_requires_resource' USING errcode = 'P0001';
      END IF;
      -- Recurso de la organización + último precio APROBADO (spoof-proof).
      SELECT o.observed_price INTO v_price
      FROM public.resource_price_observations o
      JOIN public.resources r ON r.id = o.resource_id
      WHERE o.resource_id = v_res
        AND r.organization_id = v_org
        AND o.organization_id = v_org
        AND o.status = 'approved'
      ORDER BY o.approved_at DESC NULLS LAST, o.created_at DESC
      LIMIT 1;
      IF v_price IS NULL THEN
        RAISE EXCEPTION 'resource_no_approved_price:%', v_res USING errcode = 'P0001';
      END IF;
      v_source := 'resource';
      v_recon  := 'associated';
    ELSIF v_type = 'labor' THEN
      IF v_role IS NULL THEN
        RAISE EXCEPTION 'labor_requires_role' USING errcode = 'P0001';
      END IF;
      v_price := COALESCE((v_comp->>'unitPriceSnapshot')::numeric, 0);
      v_waste := 0;
      v_source := 'labor_role';
      v_recon  := 'associated';
    ELSE
      RAISE EXCEPTION 'unsupported_component_type:%', v_type USING errcode = 'P0001';
    END IF;

    IF v_price < 0 THEN
      RAISE EXCEPTION 'invalid_price' USING errcode = 'P0001';
    END IF;
    v_total := round(v_qty * (1 + v_waste) * v_price, 10);

    INSERT INTO public.apu_components (
      apu_template_id, resource_id, labor_role_id, component_type,
      quantity, waste_pct, unit_price_source, unit_price_snapshot,
      total_component_cost, sort_order, notes, reconciliation_state, reconciled_by
    ) VALUES (
      v_template, v_res, v_role, v_type,
      v_qty, v_waste, v_source, v_price,
      v_total, v_sort, NULLIF(v_comp->>'notes', ''), v_recon, v_uid
    );
    v_sort := v_sort + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'apuTemplateId', v_template,
    'code', v_code,
    'componentCount', v_sort,
    'status', 'created'
  );

  INSERT INTO public.apu_manual_actions (
    organization_id, action_type, apu_template_id, boq_item_id,
    initiated_by, idempotency_key, metadata
  ) VALUES (
    v_org, 'create_manual_apu', v_template, NULL,
    v_uid, p_idempotency_key, jsonb_build_object('result', v_result)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_apu(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_apu(jsonb, jsonb, text) TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.create_manual_apu(jsonb, jsonb, text);
-- DROP FUNCTION IF EXISTS public.add_apu_to_boq(uuid, uuid, uuid, numeric, text);
-- DROP TABLE IF EXISTS apu_manual_actions;
-- DROP INDEX IF EXISTS apu_templates_origin_type_idx;
-- ALTER TABLE apu_templates DROP CONSTRAINT IF EXISTS apu_templates_origin_type_valid;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS origin_type;
