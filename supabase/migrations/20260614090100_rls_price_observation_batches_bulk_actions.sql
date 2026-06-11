-- Migration: RLS — price_observation_batches / price_observation_bulk_actions
-- Agent: agent-db-rls (vía agent-orchestrator)
-- Contrato: docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md §5
--
-- Modelo:
--   * organization_id directo en ambas tablas ⇒ filtro por app.current_org().
--   * ENABLE + FORCE: RLS aplica también al owner.
--   * batches: SELECT miembros de la org; INSERT roles importadores
--     (admin/gerencia/presupuestos/compras) con imported_by = identidad real.
--     SIN UPDATE ni DELETE ⇒ procedencia inmutable.
--   * bulk_actions: SELECT miembros de la org; INSERT/UPDATE SOLO
--     admin/gerencia (los únicos que pueden aprobar/rechazar observaciones,
--     paridad con rpo_update_review_only). UPDATE solo completa contadores;
--     organization_id/initiated_by/action_type/idempotency_key inmutables.
--     SIN DELETE ⇒ auditoría inmutable.
--
-- UP

-- ===========================================================================
-- price_observation_batches
-- ===========================================================================
ALTER TABLE price_observation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_observation_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY pob_select_own_org ON price_observation_batches
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY pob_insert_authorized ON price_observation_batches
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND imported_by = (SELECT app._auth_uid())
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos', 'compras')
    )
  );

-- UPDATE/DELETE: sin política ⇒ denegados (procedencia inmutable).

-- ===========================================================================
-- price_observation_bulk_actions
-- ===========================================================================
ALTER TABLE price_observation_bulk_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_observation_bulk_actions FORCE ROW LEVEL SECURITY;

CREATE POLICY poba_select_own_org ON price_observation_bulk_actions
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY poba_insert_reviewers ON price_observation_bulk_actions
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND initiated_by = (SELECT app._auth_uid())
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia')
    )
    -- El lote referenciado (si existe) debe ser de la misma organización.
    AND (
      import_batch_id IS NULL
      OR EXISTS (
        SELECT 1 FROM price_observation_batches b
        WHERE b.id = price_observation_bulk_actions.import_batch_id
          AND b.organization_id = app.current_org()
      )
    )
  );

CREATE POLICY poba_update_reviewers ON price_observation_bulk_actions
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia')
    )
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND initiated_by = (SELECT app._auth_uid())
  );

-- DELETE: sin política ⇒ denegado (auditoría inmutable).

-- DOWN
-- DROP POLICY IF EXISTS poba_update_reviewers ON price_observation_bulk_actions;
-- DROP POLICY IF EXISTS poba_insert_reviewers ON price_observation_bulk_actions;
-- DROP POLICY IF EXISTS poba_select_own_org ON price_observation_bulk_actions;
-- ALTER TABLE price_observation_bulk_actions DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS pob_insert_authorized ON price_observation_batches;
-- DROP POLICY IF EXISTS pob_select_own_org ON price_observation_batches;
-- ALTER TABLE price_observation_batches DISABLE ROW LEVEL SECURITY;
