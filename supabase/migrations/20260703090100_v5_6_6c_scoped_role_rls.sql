-- Migration: V5_6_6C_INTERNAL_PROJECT_GRANTS (parte 2/2: RLS scoped roles)
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/design-references/V5_6_6C_INTERNAL_PROJECT_GRANTS.md.
--
-- Generaliza el scoping por proyecto de V5.6.4/V5.6.5A a los roles internos
-- SCOPED (obra, compras) sin tocar a los allow-all (admin, gerencia,
-- presupuestos) ni debilitar NADA de lo existente:
--
--   1) Helper app.is_scoped_role(): rol efectivo que queda limitado a
--      proyectos con grant. Cubre:
--        - 'consulta' (PostgREST -> profiles.role) y 'client' (claim del
--          read-model): identico a V5.6.5A;
--        - 'obra' (PostgREST) y 'site' (claim ViewerRole de obra);
--        - 'compras' (PostgREST).
--      NOTA claim de compras: el read-model envia ViewerRole y compras
--      colapsa en 'internal' (igual que admin/presupuestos), asi que la via
--      Drizzle de compras NO es distinguible aqui; su corte en la app lo hace
--      el choke point de grants del read-model (projectGrants en el viewer,
--      V5.6.6C app-layer). La via PostgREST directa (la superficie de riesgo
--      real) SI queda scoped porque alli current_role()=profiles.role.
--   2) projects_select: scoped => solo proyectos con grant (cascada
--      automatica a scopes/estimates/versions/chapters/boq/quantities via los
--      EXISTS existentes, igual que V5.6.4).
--   3) Las 9 politicas SELECT project-chain de V5.6.5A (planning + cantidades
--      workspace/takeoff) cambian su corto-circuito de is_client_role() a
--      is_scoped_role(): mismo predicado, conjunto de roles ampliado. Para
--      admin/gerencia/presupuestos el comportamiento es EXACTAMENTE el actual.
--   4) Los deny totales de V5.6.5A (APU/precios/notas/imports con
--      is_client_role) NO cambian: obra/compras conservan las lecturas de su
--      dominio (compras necesita suppliers/precios; obra su operacion).
--
-- Anti-fuga y anti-fail-open: para un rol scoped sin grants, proyectos y toda
-- la cadena = 0 filas; un proyecto no asignado NO EXISTE (mismo shape que
-- inexistente). Sin grants nuevos nadie ve mas que antes de esta migracion.
--
-- UP

-- ===========================================================================
-- 1) Helper de rol scoped
-- ===========================================================================
CREATE OR REPLACE FUNCTION app.is_scoped_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(app.current_role(), '') IN
         ('consulta','client','obra','site','compras');
$$;

GRANT EXECUTE ON FUNCTION app.is_scoped_role() TO authenticated;

-- ===========================================================================
-- 2) projects: SELECT scoped por grant para los roles scoped
-- ===========================================================================
DROP POLICY projects_select ON projects;
CREATE POLICY projects_select ON projects
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR app.has_project_grant(projects.id)
    )
  );

-- ===========================================================================
-- 3) Cadena project-scoped (V5.6.5A): is_client_role -> is_scoped_role.
--    Cuerpos identicos a 20260702100000 salvo el helper del corto-circuito.
-- ===========================================================================

DROP POLICY schedule_tasks_select ON schedule_tasks;
CREATE POLICY schedule_tasks_select ON schedule_tasks
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = schedule_tasks.project_id
          AND p.organization_id = app.current_org()
      )
    )
  );

DROP POLICY planning_schedules_select ON planning_schedules;
CREATE POLICY planning_schedules_select ON planning_schedules
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = planning_schedules.project_id
          AND p.organization_id = app.current_org()
      )
    )
  );

DROP POLICY task_dependencies_select ON task_dependencies;
CREATE POLICY task_dependencies_select ON task_dependencies
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM schedule_tasks t
        WHERE t.id = task_dependencies.successor_task_id
      )
    )
  );

DROP POLICY progress_entries_select ON progress_entries;
CREATE POLICY progress_entries_select ON progress_entries
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM schedule_tasks t
        WHERE t.id = progress_entries.task_id
      )
    )
  );

DROP POLICY resource_assignments_select ON resource_assignments;
CREATE POLICY resource_assignments_select ON resource_assignments
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM schedule_tasks t
        WHERE t.id = resource_assignments.task_id
      )
    )
  );

DROP POLICY qwg_select_own_org ON quantity_workspace_groups;
CREATE POLICY qwg_select_own_org ON quantity_workspace_groups
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM project_scopes ps
        JOIN projects p ON p.id = ps.project_id
        WHERE ps.id = quantity_workspace_groups.project_scope_id
          AND p.organization_id = app.current_org()
      )
    )
  );

DROP POLICY qwl_select_own_org ON quantity_workspace_lines;
CREATE POLICY qwl_select_own_org ON quantity_workspace_lines
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM quantity_workspace_groups g
        WHERE g.id = quantity_workspace_lines.group_id
      )
    )
  );

DROP POLICY qtg_select_own_org ON quantity_takeoff_groups;
CREATE POLICY qtg_select_own_org ON quantity_takeoff_groups
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR (
        quantity_takeoff_groups.estimate_version_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM estimate_versions ev
          WHERE ev.id = quantity_takeoff_groups.estimate_version_id
        )
      )
    )
  );

DROP POLICY qtl_select_own_org ON quantity_takeoff_lines;
CREATE POLICY qtl_select_own_org ON quantity_takeoff_lines
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_scoped_role()
      OR EXISTS (
        SELECT 1 FROM quantity_takeoff_groups g
        WHERE g.id = quantity_takeoff_lines.group_id
      )
    )
  );

-- DOWN
-- Restaurar las 10 politicas con NOT app.is_client_role() (ver
-- 20260702100000_v5_6_5a_client_rls_full_chain.sql y
-- 20260702090100_rls_project_access_grants.sql para projects_select) y
-- DROP FUNCTION IF EXISTS app.is_scoped_role();
