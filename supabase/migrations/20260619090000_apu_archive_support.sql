-- Migration: APU_MANUAL_BUILDER_VALIDATION_AND_ARCHIVE_HOTFIX_V1
-- Agent: agent-db-rls (autorado por el orquestador).
-- Contrato: hotfix sobre 20260618090000_apu_manual_builder.sql.
--
-- TODO ADITIVO: columnas NULL/DEFAULT + índice parcial + extensión de CHECK
-- (DROP del CHECK previo + ADD de uno más permisivo, nunca menos) + 1 RPC nueva
-- (archive_apu_template) + CREATE OR REPLACE de 2 RPCs existentes con guards
-- adicionales. Sin DROP de tablas/columnas, sin DELETE, sin TRUNCATE, sin
-- cambio de tipos, sin backfill destructivo. Retrocompatible. Solo local
-- (sin db push remoto).
--
-- FORCE count: PERMANECE EN 36. Esta migración NO crea tablas nuevas con FORCE
-- ROW LEVEL SECURITY. apu_manual_actions ya tenía ENABLE+FORCE desde la
-- migración 20260618090000. Las columnas nuevas en apu_templates no añaden
-- FORCE. Solo se añade la RPC archive_apu_template. ⇒ 36 (sin cambio).
--
-- Habilita:
--   1) Archivar (soft) un APU manual sin BOQ vinculado, con razón obligatoria,
--      autoría y auditoría idempotente; respeta tipo (solo 'manual') y bloquea
--      doble archivo.
--   2) Bloquear add_apu_to_boq cuando el APU está archivado (apu_archived).
--   3) Endurecer create_manual_apu: rechaza componentes con cantidad <= 0
--      (antes solo < 0; cantidad 0 era un BUG que pasaba).
--
-- UP

-- ===========================================================================
-- 1) apu_templates — soporte de archivo (soft archive), aditivo y
--    retrocompatible. Filas históricas: archived_at NULL ⇒ activas.
-- ===========================================================================

ALTER TABLE apu_templates
  ADD COLUMN archived_at    timestamptz NULL DEFAULT NULL,
  ADD COLUMN archived_by    uuid NULL DEFAULT NULL REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN archive_reason text NULL DEFAULT NULL;

-- Índice parcial: listados de APUs activos (no archivados) por organización.
CREATE INDEX apu_templates_not_archived_idx
  ON apu_templates (organization_id, active)
  WHERE archived_at IS NULL;

-- ===========================================================================
-- 2) apu_manual_actions — extender el CHECK de action_type para auditar las
--    nuevas acciones (archive / duplicate). DROP + ADD aditivo: el nuevo
--    conjunto es un superconjunto del previo (nunca menos permisivo).
-- ===========================================================================

ALTER TABLE apu_manual_actions
  DROP CONSTRAINT apu_manual_actions_type_valid;

ALTER TABLE apu_manual_actions
  ADD CONSTRAINT apu_manual_actions_type_valid CHECK (
    action_type IN (
      'create_manual_apu',
      'add_apu_to_boq',
      'archive_apu_template',
      'duplicate_apu_template'
    )
  );

-- ===========================================================================
-- 3) RPC pública: archivar (soft) un APU manual.
--    * Solo APUs de la organización del actor (tenant-scoped).
--    * Solo origin_type = 'manual' (los importados no se archivan por aquí).
--    * Razón obligatoria (no vacía tras trim).
--    * Bloquea doble archivo (idempotencia de estado).
--    * Bloquea si el APU tiene ítems BOQ vinculados (integridad referencial
--      blanda: un APU usado en presupuestos no se archiva).
--    * Auditoría idempotente por (org, idempotency_key='archive_apu:'||id):
--      replay no crea una segunda fila de auditoría (ON CONFLICT DO NOTHING).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.archive_apu_template(
  p_apu_template_id uuid,
  p_reason          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_uid       uuid := app._auth_uid();
  v_org       uuid := app.current_org();
  v_tpl       record;
  v_result    jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF app.current_role() NOT IN ('admin', 'gerencia', 'presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'archive_reason_required' USING errcode = 'P0001';
  END IF;

  -- APU de la organización. Encabezado mínimo para validar tipo y estado.
  SELECT t.id, t.origin_type, t.archived_at
    INTO v_tpl
  FROM public.apu_templates t
  WHERE t.id = p_apu_template_id AND t.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apu_not_found' USING errcode = 'P0002';
  END IF;
  IF v_tpl.origin_type <> 'manual' THEN
    RAISE EXCEPTION 'apu_not_archivable_type' USING errcode = 'P0001';
  END IF;
  IF v_tpl.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'apu_already_archived' USING errcode = 'P0001';
  END IF;

  -- No archivar APUs usados en presupuestos (ítems BOQ vinculados).
  PERFORM 1 FROM public.boq_items WHERE apu_template_id = p_apu_template_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'apu_has_boq_items' USING errcode = 'P0001';
  END IF;

  UPDATE public.apu_templates
     SET archived_at    = now(),
         archived_by    = v_uid,
         archive_reason = trim(p_reason)
   WHERE id = p_apu_template_id;

  v_result := jsonb_build_object(
    'apuTemplateId', p_apu_template_id,
    'archivedAt', now()::text,
    'status', 'archived'
  );

  -- Auditoría idempotente por estado: un solo registro de archivo por APU.
  INSERT INTO public.apu_manual_actions (
    organization_id, action_type, apu_template_id, boq_item_id,
    initiated_by, idempotency_key, metadata
  ) VALUES (
    v_org, 'archive_apu_template', p_apu_template_id, NULL,
    v_uid, 'archive_apu:' || p_apu_template_id::text,
    jsonb_build_object('result', v_result)
  )
  ON CONFLICT DO NOTHING;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_apu_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_apu_template(uuid, text) TO authenticated;

-- ===========================================================================
-- 4) RPC add_apu_to_boq — CREATE OR REPLACE: idéntica a la versión de
--    20260618090000, con un guard adicional ANTES de insertar en boq_items:
--    si el APU está archivado (archived_at IS NOT NULL) ⇒ apu_archived.
--    Misma firma, mismo SECURITY INVOKER.
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
  v_archived   timestamptz;
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

  -- Guard de archivo: un APU archivado no puede agregarse a un BOQ.
  SELECT archived_at INTO v_archived
  FROM public.apu_templates
  WHERE id = p_apu_template_id AND organization_id = v_org;
  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION 'apu_archived' USING errcode = 'P0001';
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
-- 5) RPC create_manual_apu — CREATE OR REPLACE: idéntica a la versión de
--    20260618090000, con UN solo cambio: el guard de cantidad de componente
--    pasa de (v_qty < 0) a (v_qty <= 0). Rechaza cantidad = 0 (BUG previo).
--    Misma firma, mismo SECURITY INVOKER.
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
    -- Endurecido: cantidad debe ser estrictamente positiva (rechaza 0).
    IF v_qty <= 0 OR v_waste < 0 THEN
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
-- DROP FUNCTION IF EXISTS public.archive_apu_template(uuid, text);
-- DROP INDEX IF EXISTS apu_templates_not_archived_idx;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS archive_reason;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS archived_by;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS archived_at;
-- Nota: CREATE OR REPLACE de add_apu_to_boq y create_manual_apu no tienen DOWN
--   directo; son idempotentes (re-aplicar 20260618090000 restaura las versiones
--   previas sin el guard de archivo / sin el endurecido de cantidad 0).
-- El CHECK apu_manual_actions_type_valid debe restaurarse manualmente si es
--   necesario (volver al conjunto {'create_manual_apu','add_apu_to_boq'}), pero
--   solo si no existen filas con los nuevos action_type.
