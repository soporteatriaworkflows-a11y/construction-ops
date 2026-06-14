-- Migration: QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1 — workspace de cantidades
--            editable (creación manual) + RPC update_boq_item_quantity.
-- Agent: agent-db-rls (autorado por el orquestador).
-- Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §1, §4.
--
-- TODO ADITIVO: 2 tablas nuevas + triggers controlados + 1 RPC. Sin DROP, sin
-- DELETE, sin backfill, sin tocar quantity_takeoff_*/quantity_groups/quantity_
-- lines legacy ni boq_items (salvo lectura/escritura de quantity_snapshot vía
-- RPC con guards). Solo local en esta oleada (sin db push remoto).
--
-- UP

-- ===========================================================================
-- 1) quantity_workspace_groups — jerarquía piso/módulo/espacio/elemento.
-- ===========================================================================

CREATE TABLE quantity_workspace_groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_scope_id  uuid NOT NULL REFERENCES project_scopes (id) ON DELETE CASCADE,
  code              text NOT NULL,
  name              text NOT NULL,
  floor             text,
  module            text,
  space             text,
  element           text,
  description       text,
  result_unit       text NOT NULL,
  template_kind     text NOT NULL DEFAULT 'generic',
  total_net         numeric(20,10) NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qwg_template_kind_valid CHECK (template_kind IN ('generic', 'mixed_wall')),
  CONSTRAINT qwg_result_unit_nonempty CHECK (btrim(result_unit) <> ''),
  CONSTRAINT qwg_total_net_nonneg CHECK (total_net >= 0)
);

CREATE INDEX quantity_workspace_groups_org_idx ON quantity_workspace_groups (organization_id);
CREATE INDEX quantity_workspace_groups_scope_idx ON quantity_workspace_groups (project_scope_id);
CREATE UNIQUE INDEX quantity_workspace_groups_scope_code_uq
  ON quantity_workspace_groups (project_scope_id, code);

CREATE TRIGGER quantity_workspace_groups_set_updated_at
  BEFORE UPDATE ON quantity_workspace_groups
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ===========================================================================
-- 2) quantity_workspace_lines — líneas de cálculo (editables).
-- ===========================================================================

CREATE TABLE quantity_workspace_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  group_id           uuid NOT NULL REFERENCES quantity_workspace_groups (id) ON DELETE CASCADE,
  description        text,
  result_unit        text,
  formula_type       text NOT NULL,
  length             numeric(20,10),
  width              numeric(20,10),
  height             numeric(20,10),
  thickness          numeric(20,10),
  count              numeric(20,10),
  partial_height     numeric(20,10),
  waste_pct          numeric(20,10) NOT NULL DEFAULT 0,
  opening_deduction  numeric(20,10) NOT NULL DEFAULT 0,
  result_gross       numeric(20,10) NOT NULL DEFAULT 0,
  result_net         numeric(20,10) NOT NULL DEFAULT 0,
  apu_template_id    uuid REFERENCES apu_templates (id) ON DELETE SET NULL,
  boq_item_id        uuid REFERENCES boq_items (id) ON DELETE SET NULL,
  notes              text,
  sort_order         integer NOT NULL DEFAULT 0,
  CONSTRAINT qwl_formula_type_valid CHECK (
    formula_type IN (
      'direct','area_simple','area_floor','wall_with_opening','tile_by_height',
      'paint_remainder','linear_profile','count_unit','volume','manual_safe'
    )
  ),
  CONSTRAINT qwl_waste_range CHECK (waste_pct >= 0 AND waste_pct < 1),
  CONSTRAINT qwl_opening_nonneg CHECK (opening_deduction >= 0),
  CONSTRAINT qwl_results_nonneg CHECK (result_gross >= 0 AND result_net >= 0)
);

CREATE INDEX quantity_workspace_lines_org_idx ON quantity_workspace_lines (organization_id);
CREATE INDEX quantity_workspace_lines_group_sort_idx
  ON quantity_workspace_lines (group_id, sort_order);
CREATE INDEX quantity_workspace_lines_boq_item_idx
  ON quantity_workspace_lines (boq_item_id) WHERE boq_item_id IS NOT NULL;

-- ===========================================================================
-- 3) Invariantes same-org (las FK ignoran RLS). Triggers controlados, sin
--    SECURITY DEFINER, schema-qualified, search_path fijo.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.quantity_workspace_group_same_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM project_scopes ps JOIN projects p ON p.id = ps.project_id
   WHERE ps.id = NEW.project_scope_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'project_scope_id % no pertenece a la organización del grupo',
      NEW.project_scope_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quantity_workspace_groups_same_org
  BEFORE INSERT OR UPDATE ON public.quantity_workspace_groups
  FOR EACH ROW EXECUTE FUNCTION public.quantity_workspace_group_same_org();

CREATE OR REPLACE FUNCTION public.quantity_workspace_line_same_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM quantity_workspace_groups WHERE id = NEW.group_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'group_id % no pertenece a la organización de la línea',
      NEW.group_id USING ERRCODE = '23514';
  END IF;

  IF NEW.apu_template_id IS NOT NULL THEN
    SELECT organization_id INTO v_org
      FROM apu_templates WHERE id = NEW.apu_template_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'apu_template_id % no pertenece a la organización de la línea',
        NEW.apu_template_id USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.boq_item_id IS NOT NULL THEN
    SELECT p.organization_id INTO v_org
      FROM boq_items bi
      JOIN estimate_versions ev ON ev.id = bi.estimate_version_id
      JOIN estimates e ON e.id = ev.estimate_id
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
     WHERE bi.id = NEW.boq_item_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'boq_item_id % no pertenece a la organización de la línea',
        NEW.boq_item_id USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER quantity_workspace_lines_same_org
  BEFORE INSERT OR UPDATE ON public.quantity_workspace_lines
  FOR EACH ROW EXECUTE FUNCTION public.quantity_workspace_line_same_org();

-- ===========================================================================
-- 3b) Extender el CHECK de action_type para auditar 'update_quantity'.
--     Superconjunto del previo (nunca menos permisivo).
-- ===========================================================================

ALTER TABLE apu_manual_actions
  DROP CONSTRAINT apu_manual_actions_type_valid;

ALTER TABLE apu_manual_actions
  ADD CONSTRAINT apu_manual_actions_type_valid CHECK (
    action_type IN (
      'create_manual_apu',
      'add_apu_to_boq',
      'archive_apu_template',
      'duplicate_apu_template',
      'update_quantity'
    )
  );

-- ===========================================================================
-- 4) RPC update_boq_item_quantity — actualizar la cantidad de un ítem BOQ
--    EDITABLE preservando el unit_price_snapshot (sync seguro desde workspace).
--    * SECURITY INVOKER: corre como `authenticated`; RLS aplica.
--    * Guards: sesión, membresía, rol, cantidad >= 0, versión editable.
--    * PRESERVA unit_price_snapshot; recalcula subtotal server-side (el trigger
--      set_boq_item_subtotal reafirma el invariante).
--    * NO toca APU, catálogo, precios ni AIU.
--    * Auditoría + idempotencia vía apu_manual_actions (action_type='update_quantity').
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.update_boq_item_quantity(
  p_boq_item_id     uuid,
  p_quantity        numeric,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_uid         uuid := app._auth_uid();
  v_org         uuid := app.current_org();
  v_existing    record;
  v_item        record;
  v_unit_price  numeric(20,10);
  v_subtotal    numeric(20,10);
  v_qty_before  numeric(20,10);
  v_result      jsonb;
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

  -- Ítem de la organización (RLS + join defensivo). Lee el snapshot de precio.
  SELECT bi.id, bi.estimate_version_id, bi.quantity_snapshot, bi.unit_price_snapshot
    INTO v_item
  FROM public.boq_items bi
  JOIN public.estimate_versions ev ON ev.id = bi.estimate_version_id
  JOIN public.estimates e ON e.id = ev.estimate_id
  JOIN public.project_scopes ps ON ps.id = e.project_scope_id
  JOIN public.projects p ON p.id = ps.project_id
  WHERE bi.id = p_boq_item_id AND p.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'boq_item_not_found' USING errcode = 'P0002';
  END IF;

  IF app.estimate_version_locked(v_item.estimate_version_id) THEN
    RAISE EXCEPTION 'version_locked' USING errcode = '42501';
  END IF;

  v_qty_before := v_item.quantity_snapshot;
  v_unit_price := v_item.unit_price_snapshot;            -- PRESERVADO
  v_subtotal   := round(p_quantity * v_unit_price, 10);

  UPDATE public.boq_items
    SET quantity_snapshot = p_quantity,
        subtotal = v_subtotal
  WHERE id = p_boq_item_id;

  v_result := jsonb_build_object(
    'boqItemId', p_boq_item_id,
    'quantityBefore', v_qty_before::text,
    'quantityAfter', p_quantity::text,
    'unitPrice', v_unit_price::text,
    'subtotal', v_subtotal::text,
    'status', 'updated'
  );

  INSERT INTO public.apu_manual_actions (
    organization_id, action_type, apu_template_id, boq_item_id,
    initiated_by, idempotency_key, metadata
  ) VALUES (
    v_org, 'update_quantity', NULL, p_boq_item_id,
    v_uid, p_idempotency_key,
    jsonb_build_object('result', v_result)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_boq_item_quantity(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_boq_item_quantity(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_boq_item_quantity(uuid, numeric, text) TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.update_boq_item_quantity(uuid, numeric, text);
-- DROP TRIGGER IF EXISTS quantity_workspace_lines_same_org ON public.quantity_workspace_lines;
-- DROP FUNCTION IF EXISTS public.quantity_workspace_line_same_org();
-- DROP TRIGGER IF EXISTS quantity_workspace_groups_same_org ON public.quantity_workspace_groups;
-- DROP FUNCTION IF EXISTS public.quantity_workspace_group_same_org();
-- DROP TRIGGER IF EXISTS quantity_workspace_groups_set_updated_at ON public.quantity_workspace_groups;
-- DROP TABLE IF EXISTS quantity_workspace_lines;
-- DROP TABLE IF EXISTS quantity_workspace_groups;
