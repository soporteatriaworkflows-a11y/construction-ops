-- Migration: RLS — price_monitor_targets / price_monitor_runs / price_monitor_results
-- Agent: agent-db-rls (vía agent-orchestrator, Fase 4A)
-- Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §4.4-§4.5
--
-- Modelo:
--   * organization_id directo en las 3 tablas ⇒ filtro por app.current_org().
--   * ENABLE + FORCE: RLS aplica también al owner; solo BYPASSRLS la elude
--     (camino administrativo controlado del cron, ver contrato §4.5; las
--     observaciones pending del cron se insertan SIEMPRE RLS-bound con claims
--     del usuario que habilitó el target).
--   * SELECT: cualquier miembro de la organización (site/client = lectura).
--   * INSERT/UPDATE: solo roles admin/gerencia/presupuestos/compras
--     (ViewerRole management|internal en aplicación).
--   * DELETE: SIN política en las 3 tablas ⇒ denegado (pausar = enabled=false;
--     runs/results son registro auditable inmutable).
--
-- UP

-- ===========================================================================
-- price_monitor_targets
-- ===========================================================================
ALTER TABLE price_monitor_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_monitor_targets FORCE ROW LEVEL SECURITY;

CREATE POLICY pmt_select_own_org ON price_monitor_targets
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY pmt_insert_authorized ON price_monitor_targets
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND created_by = (SELECT app._auth_uid())
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos', 'compras')
    )
    -- El recurso debe pertenecer a la misma organización.
    AND EXISTS (
      SELECT 1 FROM resources r
      WHERE r.id = price_monitor_targets.resource_id
        AND r.organization_id = app.current_org()
    )
  );

CREATE POLICY pmt_update_authorized ON price_monitor_targets
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos', 'compras')
    )
  )
  WITH CHECK (organization_id = app.current_org());

-- DELETE: sin política ⇒ denegado (FORCE RLS).

-- ===========================================================================
-- price_monitor_runs
-- ===========================================================================
ALTER TABLE price_monitor_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_monitor_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY pmr_select_own_org ON price_monitor_runs
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY pmr_insert_authorized ON price_monitor_runs
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos', 'compras')
    )
  );

CREATE POLICY pmr_update_authorized ON price_monitor_runs
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos', 'compras')
    )
  )
  WITH CHECK (organization_id = app.current_org());

-- DELETE: sin política ⇒ denegado.

-- ===========================================================================
-- price_monitor_results
-- ===========================================================================
ALTER TABLE price_monitor_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_monitor_results FORCE ROW LEVEL SECURITY;

CREATE POLICY pms_select_own_org ON price_monitor_results
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY pms_insert_authorized ON price_monitor_results
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos', 'compras')
    )
    -- run y target deben ser de la misma organización.
    AND EXISTS (
      SELECT 1 FROM price_monitor_runs pr
      WHERE pr.id = price_monitor_results.run_id
        AND pr.organization_id = app.current_org()
    )
    AND EXISTS (
      SELECT 1 FROM price_monitor_targets pt
      WHERE pt.id = price_monitor_results.target_id
        AND pt.organization_id = app.current_org()
    )
  );

-- UPDATE/DELETE: sin política ⇒ denegados (resultados append-only).

-- DOWN
-- DROP POLICY IF EXISTS pms_insert_authorized ON price_monitor_results;
-- DROP POLICY IF EXISTS pms_select_own_org ON price_monitor_results;
-- ALTER TABLE price_monitor_results DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS pmr_update_authorized ON price_monitor_runs;
-- DROP POLICY IF EXISTS pmr_insert_authorized ON price_monitor_runs;
-- DROP POLICY IF EXISTS pmr_select_own_org ON price_monitor_runs;
-- ALTER TABLE price_monitor_runs DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS pmt_update_authorized ON price_monitor_targets;
-- DROP POLICY IF EXISTS pmt_insert_authorized ON price_monitor_targets;
-- DROP POLICY IF EXISTS pmt_select_own_org ON price_monitor_targets;
-- ALTER TABLE price_monitor_targets DISABLE ROW LEVEL SECURITY;
