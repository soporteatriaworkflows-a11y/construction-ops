-- Migration: RLS — quantity_import_batches, quantity_takeoff_groups,
--            quantity_takeoff_lines (QUANTITY_TAKEOFF_IMPORT_V1)
-- Agent: agent-db-rls (vía agent-orchestrator, FASE 4B.3)
-- Contrato: docs/QUANTITY_TAKEOFF_IMPORT_V1_CONTRACT.md §8
--
-- Modelo (paridad apu_import_batches):
--   * organization_id directo ⇒ filtro por app.current_org().
--   * ENABLE + FORCE: RLS aplica también al owner.
--   * Batches: SELECT org; INSERT solo admin/gerencia con imported_by =
--     identidad real; SIN UPDATE/DELETE ⇒ procedencia inmutable.
--   * Groups: SELECT org; INSERT/UPDATE admin/gerencia org-scoped (UPDATE
--     necesario para estampar import_batch_id al final de la RPC); SIN DELETE.
--   * Lines: SELECT org; INSERT admin/gerencia; SIN UPDATE/DELETE ⇒ memoria
--     de medición inmutable.
--   * Cross-org bloqueado por políticas + triggers same-org (migración
--     20260616090000).
--
-- UP

-- ===========================================================================
-- quantity_import_batches
-- ===========================================================================

ALTER TABLE quantity_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_import_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY qib_select_own_org ON quantity_import_batches
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY qib_insert_authorized ON quantity_import_batches
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND imported_by = (SELECT app._auth_uid())
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia')
    )
  );

-- UPDATE/DELETE: sin política ⇒ denegados (procedencia inmutable).

-- ===========================================================================
-- quantity_takeoff_groups
-- ===========================================================================

ALTER TABLE quantity_takeoff_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_takeoff_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY qtg_select_own_org ON quantity_takeoff_groups
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY qtg_insert_authorized ON quantity_takeoff_groups
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia')
    )
  );

-- UPDATE org-scoped (estampar batch en la RPC; revisión futura del vínculo).
CREATE POLICY qtg_update_authorized ON quantity_takeoff_groups
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
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia')
    )
  );

-- DELETE: sin política ⇒ denegado.

-- ===========================================================================
-- quantity_takeoff_lines
-- ===========================================================================

ALTER TABLE quantity_takeoff_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_takeoff_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY qtl_select_own_org ON quantity_takeoff_lines
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY qtl_insert_authorized ON quantity_takeoff_lines
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia')
    )
  );

-- UPDATE/DELETE: sin política ⇒ denegados (memoria de medición inmutable).

-- DOWN
-- DROP POLICY IF EXISTS qtl_insert_authorized ON quantity_takeoff_lines;
-- DROP POLICY IF EXISTS qtl_select_own_org ON quantity_takeoff_lines;
-- ALTER TABLE quantity_takeoff_lines DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS qtg_update_authorized ON quantity_takeoff_groups;
-- DROP POLICY IF EXISTS qtg_insert_authorized ON quantity_takeoff_groups;
-- DROP POLICY IF EXISTS qtg_select_own_org ON quantity_takeoff_groups;
-- ALTER TABLE quantity_takeoff_groups DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS qib_insert_authorized ON quantity_import_batches;
-- DROP POLICY IF EXISTS qib_select_own_org ON quantity_import_batches;
-- ALTER TABLE quantity_import_batches DISABLE ROW LEVEL SECURITY;
