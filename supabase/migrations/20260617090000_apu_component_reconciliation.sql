-- Migration: APU_COMPONENT_RESOURCE_RECONCILIATION_V1 — reconciliación segura de
--            componentes APU con recursos del catálogo (post-import).
-- Agent: agent-db-rls (autorado por el orquestador).
-- Contrato: docs/APU_COMPONENT_RESOURCE_RECONCILIATION_AND_LIBRARY_UX_V1_CONTRACT.md §6.
--
-- TODO ADITIVO: columnas NULL/DEFAULT + tabla nueva + triggers controlados +
-- RPCs SECURITY INVOKER. Sin DROP, sin DELETE, sin TRUNCATE, sin backfill
-- destructivo, sin cambio de tipos. Solo local (sin db push remoto).
--
-- Cierra:
--   R-01 (UPDATE directo de apu_components sin recálculo de total_component_cost),
--   R-03 (sin audit trail: updated_at + reconciled_by + action log),
--   G-02/G-03/G-06 del Discovery.
--
-- UP

-- ===========================================================================
-- 1) Columnas aditivas en apu_components (NULL/DEFAULT — retrocompatibles).
-- ===========================================================================

ALTER TABLE apu_components
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN reconciliation_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN reconciled_by uuid REFERENCES profiles (id) ON DELETE SET NULL;

ALTER TABLE apu_components
  ADD CONSTRAINT apu_components_reconciliation_state_valid
  CHECK (reconciliation_state IN ('pending', 'associated', 'intentionally_unresolved'));

-- Audit timestamp en cada UPDATE (reutiliza el helper existente, igual que
-- apu_templates). Aditivo: no afecta INSERT ni filas históricas.
CREATE TRIGGER apu_components_set_updated_at
  BEFORE UPDATE ON public.apu_components
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ===========================================================================
-- 2) Trigger de recálculo financiero (cierra R-01).
--    Solo BEFORE UPDATE: el INSERT ya produce el total correcto vía la RPC
--    import_apu_batch / seed (misma fórmula), por lo que NO se toca el INSERT
--    para minimizar la superficie de regresión. Garantiza la invariante
--    independientemente del camino (RPC reconcile, PostgREST directo, etc.).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.apu_component_recompute_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total_component_cost :=
    round(NEW.quantity * (1 + NEW.waste_pct) * NEW.unit_price_snapshot, 10);
  RETURN NEW;
END;
$$;

CREATE TRIGGER apu_components_recompute_total
  BEFORE UPDATE ON public.apu_components
  FOR EACH ROW EXECUTE FUNCTION public.apu_component_recompute_total();

-- Índice parcial: componentes sin recurso ni rol (objetivos de reconciliación).
CREATE INDEX apu_components_unresolved_idx
  ON apu_components (apu_template_id)
  WHERE resource_id IS NULL AND labor_role_id IS NULL;

-- ===========================================================================
-- 3) apu_component_resource_actions — auditoría durable + idempotencia.
--    Inmutable: la RLS no concede UPDATE/DELETE.
-- ===========================================================================

CREATE TABLE apu_component_resource_actions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  action_type          text NOT NULL,
  apu_component_id     uuid REFERENCES apu_components (id) ON DELETE SET NULL,
  resource_id          uuid REFERENCES resources (id) ON DELETE SET NULL,
  previous_resource_id uuid,
  initiated_by         uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),
  idempotency_key      text,
  selected_count       integer,
  succeeded_count      integer,
  skipped_count        integer,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT apu_component_resource_actions_type_valid CHECK (
    action_type IN ('associate', 'reject', 'clear', 'leave_pending', 'bulk_associate')
  ),
  CONSTRAINT apu_component_resource_actions_counts_nonneg CHECK (
    (selected_count IS NULL OR selected_count >= 0)
    AND (succeeded_count IS NULL OR succeeded_count >= 0)
    AND (skipped_count IS NULL OR skipped_count >= 0)
  )
);

CREATE INDEX apu_component_resource_actions_org_created_idx
  ON apu_component_resource_actions (organization_id, created_at DESC);
CREATE INDEX apu_component_resource_actions_component_idx
  ON apu_component_resource_actions (apu_component_id)
  WHERE apu_component_id IS NOT NULL;
-- Idempotencia por organización (clave opcional).
CREATE UNIQUE INDEX apu_component_resource_actions_org_idempotency_uq
  ON apu_component_resource_actions (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ===========================================================================
-- 4) RLS — ENABLE + FORCE, tenant-scoped, auditoría inmutable.
-- ===========================================================================

ALTER TABLE apu_component_resource_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE apu_component_resource_actions FORCE ROW LEVEL SECURITY;

CREATE POLICY apu_component_resource_actions_select ON apu_component_resource_actions
  FOR SELECT
  USING (organization_id = app.current_org());

-- INSERT: solo roles autorizados (paridad con reconciliación), org server-side,
-- actor = usuario autenticado. Sin UPDATE/DELETE ⇒ append-only inmutable.
CREATE POLICY apu_component_resource_actions_insert ON apu_component_resource_actions
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND app.current_role() IN ('admin', 'gerencia', 'presupuestos')
    AND initiated_by = app._auth_uid()
  );

-- ===========================================================================
-- 5) Helper interno: reconciliar UN componente (asociar/confirmar).
--    Reusado por la RPC individual y por la bulk. No es RPC pública.
--    * Verifica componente no-labor de la org (RLS además filtra).
--    * Verifica recurso same-org (cierra R-05 a nivel de dominio).
--    * Recalcula total server-side; nunca el valor del cliente.
--    * Devuelve jsonb con el resultado por componente.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public._reconcile_apu_component_row(
  p_component_id  uuid,
  p_resource_id   uuid,
  p_keep_snapshot boolean,
  p_org           uuid,
  p_uid           uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, app
AS $$
DECLARE
  v_comp        record;
  v_res         record;
  v_price       numeric(20,10);
  v_total       numeric(20,10);
  v_prev_res    uuid;
BEGIN
  -- Componente visible por RLS (org via template). Bloqueo de fila.
  SELECT c.id, c.resource_id, c.labor_role_id, c.quantity, c.waste_pct,
         c.unit_price_snapshot, c.unit_price_source
    INTO v_comp
  FROM public.apu_components c
  JOIN public.apu_templates t ON t.id = c.apu_template_id
  WHERE c.id = p_component_id AND t.organization_id = p_org
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('componentId', p_component_id, 'status', 'not_found');
  END IF;

  -- Nunca reconciliar mano de obra.
  IF v_comp.labor_role_id IS NOT NULL OR v_comp.unit_price_source = 'labor_role' THEN
    RETURN jsonb_build_object('componentId', p_component_id, 'status', 'labor_component');
  END IF;

  -- Recurso de la MISMA organización (defensa de dominio además de RLS).
  SELECT r.id, r.unit INTO v_res
  FROM public.resources r
  WHERE r.id = p_resource_id AND r.organization_id = p_org;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('componentId', p_component_id, 'status', 'resource_not_found');
  END IF;

  v_prev_res := v_comp.resource_id;

  -- Idempotencia: mismo recurso ya asociado ⇒ no-op informativo.
  IF v_prev_res IS NOT NULL AND v_prev_res = p_resource_id THEN
    RETURN jsonb_build_object(
      'componentId', p_component_id, 'resourceId', p_resource_id,
      'status', 'already_reconciled', 'previousResourceId', v_prev_res
    );
  END IF;

  -- Política de precio: conservar snapshot del Excel (default) o usar baseline
  -- aprobado más reciente (si existe). Nunca aprueba precios.
  v_price := v_comp.unit_price_snapshot;
  IF p_keep_snapshot = false THEN
    SELECT o.observed_price INTO v_price
    FROM public.resource_price_observations o
    WHERE o.organization_id = p_org
      AND o.resource_id = p_resource_id
      AND o.status = 'approved'
    ORDER BY o.approved_at DESC NULLS LAST, o.created_at DESC
    LIMIT 1;
    IF v_price IS NULL THEN
      v_price := v_comp.unit_price_snapshot; -- sin baseline aprobado ⇒ conserva snapshot.
    END IF;
  END IF;

  v_total := round(v_comp.quantity * (1 + v_comp.waste_pct) * v_price, 10);

  UPDATE public.apu_components
    SET resource_id          = p_resource_id,
        unit_price_source    = 'resource',
        unit_price_snapshot  = v_price,
        total_component_cost = v_total,  -- el trigger lo reafirma; explícito por claridad.
        reconciliation_state = 'associated',
        reconciled_by        = p_uid
  WHERE id = p_component_id;

  RETURN jsonb_build_object(
    'componentId', p_component_id,
    'resourceId', p_resource_id,
    'previousResourceId', v_prev_res,
    'newTotal', v_total::text,
    'status', CASE WHEN v_prev_res IS NULL THEN 'reconciled' ELSE 'replaced' END
  );
END;
$$;

-- ===========================================================================
-- 6) RPC pública: reconciliación individual.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.reconcile_apu_component(
  p_component_id   uuid,
  p_resource_id    uuid,
  p_keep_snapshot  boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_uid uuid := app._auth_uid();
  v_org uuid := app.current_org();
  v_existing record;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF app.current_role() NOT IN ('admin', 'gerencia', 'presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  -- Idempotencia por (org, key): devuelve el resultado previo sin reejecutar.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT metadata INTO v_existing
    FROM public.apu_component_resource_actions
    WHERE organization_id = v_org AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN (v_existing.metadata -> 'result');
    END IF;
  END IF;

  v_result := public._reconcile_apu_component_row(
    p_component_id, p_resource_id, p_keep_snapshot, v_org, v_uid
  );

  INSERT INTO public.apu_component_resource_actions (
    organization_id, action_type, apu_component_id, resource_id,
    previous_resource_id, initiated_by, idempotency_key,
    selected_count, succeeded_count, skipped_count, metadata
  ) VALUES (
    v_org, 'associate', p_component_id, p_resource_id,
    NULLIF(v_result->>'previousResourceId','')::uuid, v_uid, p_idempotency_key,
    1,
    CASE WHEN v_result->>'status' IN ('reconciled','replaced','already_reconciled') THEN 1 ELSE 0 END,
    CASE WHEN v_result->>'status' IN ('reconciled','replaced','already_reconciled') THEN 0 ELSE 1 END,
    jsonb_build_object('keepSnapshot', p_keep_snapshot, 'result', v_result)
  );

  RETURN v_result;
END;
$$;

-- ===========================================================================
-- 7) RPC pública: reconciliación masiva (máx 50 pares).
--    Selección explícita server-side; salta asociaciones existentes/labor/
--    not-found; reporta conteos; idempotente por (org, key).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.reconcile_apu_components_bulk(
  p_pairs          jsonb,
  p_keep_snapshot  boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_uid uuid := app._auth_uid();
  v_org uuid := app.current_org();
  v_existing record;
  v_pair jsonb;
  v_count int := 0;
  v_succeeded int := 0;
  v_skipped int := 0;
  v_row jsonb;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF app.current_role() NOT IN ('admin', 'gerencia', 'presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  v_count := jsonb_array_length(COALESCE(p_pairs, '[]'::jsonb));
  IF v_count > 50 THEN
    RAISE EXCEPTION 'bulk_limit_exceeded' USING errcode = 'P0001';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT metadata INTO v_existing
    FROM public.apu_component_resource_actions
    WHERE organization_id = v_org AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN (v_existing.metadata -> 'result');
    END IF;
  END IF;

  FOR v_pair IN SELECT value FROM jsonb_array_elements(COALESCE(p_pairs, '[]'::jsonb)) AS p(value) LOOP
    v_row := public._reconcile_apu_component_row(
      NULLIF(v_pair->>'componentId','')::uuid,
      NULLIF(v_pair->>'resourceId','')::uuid,
      p_keep_snapshot, v_org, v_uid
    );
    IF v_row->>'status' IN ('reconciled', 'replaced', 'already_reconciled') THEN
      v_succeeded := v_succeeded + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
    v_results := v_results || v_row;
  END LOOP;

  v_row := jsonb_build_object(
    'selected', v_count,
    'succeeded', v_succeeded,
    'skipped', v_skipped,
    'rows', v_results
  );

  INSERT INTO public.apu_component_resource_actions (
    organization_id, action_type, initiated_by, idempotency_key,
    selected_count, succeeded_count, skipped_count, metadata
  ) VALUES (
    v_org, 'bulk_associate', v_uid, p_idempotency_key,
    v_count, v_succeeded, v_skipped,
    jsonb_build_object('keepSnapshot', p_keep_snapshot, 'result', v_row)
  );

  RETURN v_row;
END;
$$;

-- ===========================================================================
-- 8) RPC pública: estados no-asociativos (reject / leave_pending / clear).
--    * reject / leave_pending ⇒ reconciliation_state='intentionally_unresolved'.
--    * clear ⇒ desasocia (resource_id NULL, source='manual'), conserva snapshot,
--      reconciliation_state='pending'. Recálculo vía trigger.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.update_apu_component_reconciliation(
  p_component_id   uuid,
  p_action         text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_uid uuid := app._auth_uid();
  v_org uuid := app.current_org();
  v_existing record;
  v_comp record;
  v_prev_res uuid;
  v_new_state text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF app.current_role() NOT IN ('admin', 'gerencia', 'presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF p_action NOT IN ('reject', 'leave_pending', 'clear') THEN
    RAISE EXCEPTION 'invalid_action' USING errcode = 'P0001';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT metadata INTO v_existing
    FROM public.apu_component_resource_actions
    WHERE organization_id = v_org AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN (v_existing.metadata -> 'result');
    END IF;
  END IF;

  SELECT c.id, c.resource_id, c.labor_role_id, c.unit_price_source
    INTO v_comp
  FROM public.apu_components c
  JOIN public.apu_templates t ON t.id = c.apu_template_id
  WHERE c.id = p_component_id AND t.organization_id = v_org
  FOR UPDATE OF c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'component_not_found' USING errcode = 'P0002';
  END IF;
  IF v_comp.labor_role_id IS NOT NULL OR v_comp.unit_price_source = 'labor_role' THEN
    RAISE EXCEPTION 'labor_component' USING errcode = 'P0001';
  END IF;

  v_prev_res := v_comp.resource_id;

  IF p_action = 'clear' THEN
    UPDATE public.apu_components
      SET resource_id = NULL,
          unit_price_source = 'manual',
          reconciliation_state = 'pending',
          reconciled_by = v_uid
    WHERE id = p_component_id;
    v_new_state := 'pending';
  ELSE
    UPDATE public.apu_components
      SET reconciliation_state = 'intentionally_unresolved',
          reconciled_by = v_uid
    WHERE id = p_component_id;
    v_new_state := 'intentionally_unresolved';
  END IF;

  v_result := jsonb_build_object(
    'componentId', p_component_id, 'action', p_action,
    'newState', v_new_state, 'previousResourceId', v_prev_res
  );

  INSERT INTO public.apu_component_resource_actions (
    organization_id, action_type, apu_component_id, resource_id,
    previous_resource_id, initiated_by, idempotency_key,
    selected_count, succeeded_count, skipped_count, metadata
  ) VALUES (
    v_org,
    CASE p_action WHEN 'clear' THEN 'clear' WHEN 'reject' THEN 'reject' ELSE 'leave_pending' END,
    p_component_id, NULL, v_prev_res, v_uid, p_idempotency_key,
    1, 1, 0, jsonb_build_object('result', v_result)
  );

  RETURN v_result;
END;
$$;

-- Permisos: solo authenticated puede ejecutar; anon revocado.
REVOKE ALL ON FUNCTION public._reconcile_apu_component_row(uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_apu_component(uuid, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_apu_components_bulk(jsonb, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_apu_component_reconciliation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_apu_component(uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_apu_components_bulk(jsonb, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_apu_component_reconciliation(uuid, text, text) TO authenticated;
-- _reconcile_apu_component_row se invoca solo desde las RPCs (mismo INVOKER);
-- no se concede a authenticated directamente.

-- DOWN
-- DROP FUNCTION IF EXISTS public.update_apu_component_reconciliation(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.reconcile_apu_components_bulk(jsonb, boolean, text);
-- DROP FUNCTION IF EXISTS public.reconcile_apu_component(uuid, uuid, boolean, text);
-- DROP FUNCTION IF EXISTS public._reconcile_apu_component_row(uuid, uuid, boolean, uuid, uuid);
-- DROP TABLE IF EXISTS apu_component_resource_actions;
-- DROP INDEX IF EXISTS apu_components_unresolved_idx;
-- DROP TRIGGER IF EXISTS apu_components_recompute_total ON public.apu_components;
-- DROP FUNCTION IF EXISTS public.apu_component_recompute_total();
-- DROP TRIGGER IF EXISTS apu_components_set_updated_at ON public.apu_components;
-- ALTER TABLE apu_components DROP CONSTRAINT IF EXISTS apu_components_reconciliation_state_valid;
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS reconciled_by;
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS reconciliation_state;
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS updated_at;
