-- Migration: RLS — quantity_workspace_groups, quantity_workspace_lines
--            (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1)
-- Agent: agent-db-rls (vía agent-orchestrator)
-- Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §1.4
--
-- Modelo:
--   * organization_id directo ⇒ filtro por app.current_org().
--   * ENABLE + FORCE: RLS aplica también al owner.
--   * SELECT: cualquier miembro de la org.
--   * INSERT/UPDATE/DELETE: roles de presupuesto (admin/gerencia/presupuestos).
--     A diferencia del takeoff importado (inmutable), el workspace es área de
--     trabajo editable: se permite UPDATE y DELETE org-scoped. Borrar workspace
--     NO afecta boq_items (FK ON DELETE SET NULL).
--   * Cross-org bloqueado por políticas + triggers same-org.
--
-- UP

-- ===========================================================================
-- quantity_workspace_groups
-- ===========================================================================

ALTER TABLE quantity_workspace_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_workspace_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY qwg_select_own_org ON quantity_workspace_groups
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY qwg_insert_authorized ON quantity_workspace_groups
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  );

CREATE POLICY qwg_update_authorized ON quantity_workspace_groups
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  );

CREATE POLICY qwg_delete_authorized ON quantity_workspace_groups
  FOR DELETE USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  );

-- ===========================================================================
-- quantity_workspace_lines
-- ===========================================================================

ALTER TABLE quantity_workspace_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_workspace_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY qwl_select_own_org ON quantity_workspace_lines
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY qwl_insert_authorized ON quantity_workspace_lines
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  );

CREATE POLICY qwl_update_authorized ON quantity_workspace_lines
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  );

CREATE POLICY qwl_delete_authorized ON quantity_workspace_lines
  FOR DELETE USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia', 'presupuestos')
    )
  );

-- DOWN
-- DROP POLICY IF EXISTS qwl_delete_authorized ON quantity_workspace_lines;
-- DROP POLICY IF EXISTS qwl_update_authorized ON quantity_workspace_lines;
-- DROP POLICY IF EXISTS qwl_insert_authorized ON quantity_workspace_lines;
-- DROP POLICY IF EXISTS qwl_select_own_org ON quantity_workspace_lines;
-- ALTER TABLE quantity_workspace_lines DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS qwg_delete_authorized ON quantity_workspace_groups;
-- DROP POLICY IF EXISTS qwg_update_authorized ON quantity_workspace_groups;
-- DROP POLICY IF EXISTS qwg_insert_authorized ON quantity_workspace_groups;
-- DROP POLICY IF EXISTS qwg_select_own_org ON quantity_workspace_groups;
-- ALTER TABLE quantity_workspace_groups DISABLE ROW LEVEL SECURITY;
