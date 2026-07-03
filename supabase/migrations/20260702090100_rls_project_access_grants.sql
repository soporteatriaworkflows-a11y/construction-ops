-- Migration: RLS — V5_6_4_CLIENT_PROJECT_SCOPE
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/design-references/V5_6_4_CLIENT_PROJECT_SCOPE.md §4,§7,§10.
--
-- 1) ENABLE + FORCE en project_access_grants. SELECT: la propia fila (el
--    usuario ve SUS asignaciones) o gestión (admin/gerencia) dentro de la
--    organización. Escrituras EXCLUSIVAMENTE por RPC SECURITY DEFINER
--    (grant/revoke_project_access) — sin políticas de escritura directa.
-- 2) Helper app.has_project_grant(project_id): SECURITY DEFINER (evita
--    recursión RLS al usarse DENTRO de la política de projects). Solo
--    responde por el usuario autenticado actual (app._auth_uid()), nunca
--    por terceros.
-- 3) PATCH de `projects_select` (única política SELECT de projects,
--    verificado): los roles `consulta` (JWT real vía PostgREST → profiles) y
--    `client` (claim user_role de las lecturas RLS-scoped del read-model)
--    solo ven proyectos con grant. El resto de roles conserva el alcance por
--    organización EXACTAMENTE como hoy.
--
--    CASCADA AUTOMÁTICA: project_scopes, estimates, estimate_versions,
--    chapters, boq_items, indirect_cost_rules, quantity_groups/lines derivan
--    su política vía EXISTS(... FROM projects ...); al ocultarse el proyecto
--    se ocultan sus hijos sin tocar sus políticas.
--    NO CASCADA (deuda V5_6_5_CLIENT_RLS_FULL_CHAIN, ver OPEN_QUESTIONS):
--    planning (schedule_tasks, task_dependencies, progress_entries,
--    resource_assignments, planning_schedules) y cantidades nuevas
--    (quantity_workspace_*, quantity_takeoff_*, quantity_import_batches)
--    usan organization_id directo y siguen org-scoped vía PostgREST.
--
-- Anti-fuga de existencia: para consulta, un proyecto no asignado simplemente
-- NO EXISTE (0 filas), igual que un id de otra organización.
--
-- UP

-- project_access_grants -------------------------------------------------------
ALTER TABLE project_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_access_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY project_access_grants_select ON project_access_grants
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      profile_id = app._auth_uid()
      OR app.current_role() IN ('admin','gerencia')
    )
  );
-- Sin INSERT/UPDATE/DELETE directos: mutaciones solo vía RPC SECURITY DEFINER.

-- Helper para la política de projects --------------------------------------
CREATE OR REPLACE FUNCTION app.has_project_grant(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_access_grants g
    WHERE g.project_id = p_project_id
      AND g.profile_id = app._auth_uid()
  );
$$;

GRANT EXECUTE ON FUNCTION app.has_project_grant(uuid) TO authenticated;

-- projects: SELECT project-scoped para consulta/client ----------------------
DROP POLICY projects_select ON projects;
CREATE POLICY projects_select ON projects
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      COALESCE(app.current_role(), '') NOT IN ('consulta','client')
      OR app.has_project_grant(projects.id)
    )
  );

-- DOWN
-- DROP POLICY IF EXISTS projects_select ON projects;
-- CREATE POLICY projects_select ON projects
--   FOR SELECT USING (organization_id = app.current_org());
-- DROP FUNCTION IF EXISTS app.has_project_grant(uuid);
-- DROP POLICY IF EXISTS project_access_grants_select ON project_access_grants;
-- ALTER TABLE project_access_grants NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE project_access_grants DISABLE ROW LEVEL SECURITY;
