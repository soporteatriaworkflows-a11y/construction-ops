-- Migration: RLS — planning_schedules (SCHEDULE_FROM_BOQ_V1).
-- Agent: agent-orchestrator
-- Contrato congelado: docs/SCHEDULE_FROM_BOQ_V1_CONTRACT.md (v1).
--
-- Aislamiento tenant-scoped igual al resto del esquema de planning (3B):
--   * organization_id DIRECTO ⇒ filtro simple por app.current_org().
--   * ENABLE + FORCE ROW LEVEL SECURITY (aplica también al owner; solo
--     BYPASSRLS/service_role la elude).
--   * WITH CHECK cruzado en INSERT/UPDATE: el project_id y el estimate_version_id
--     deben pertenecer a la MISMA organización (no se puede "colgar" un
--     cronograma de una org sobre proyectos/versiones de otra).
--   * Las columnas nuevas de schedule_tasks heredan la RLS ya existente de
--     schedule_tasks (FORCE activo desde 20260531100100); no requieren política
--     nueva. Se confía en la FK schedule_id + RLS de schedule_tasks para el
--     aislamiento de tareas por cronograma.
--
-- UP

ALTER TABLE planning_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY planning_schedules_select ON planning_schedules
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY planning_schedules_insert ON planning_schedules
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = planning_schedules.project_id
        AND p.organization_id = app.current_org()
    )
    -- La versión de presupuesto debe pertenecer a la misma organización
    -- (vía estimate -> project_scope -> project).
    AND EXISTS (
      SELECT 1
      FROM estimate_versions ev
      JOIN estimates e          ON e.id = ev.estimate_id
      JOIN project_scopes ps    ON ps.id = e.project_scope_id
      JOIN projects p2          ON p2.id = ps.project_id
      WHERE ev.id = planning_schedules.estimate_version_id
        AND p2.organization_id = app.current_org()
    )
  );

CREATE POLICY planning_schedules_update ON planning_schedules
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (
    organization_id = app.current_org()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = planning_schedules.project_id
        AND p.organization_id = app.current_org()
    )
  );

-- Sin política DELETE: el cronograma se ARCHIVA (status='archived'), no se borra
-- físicamente desde la app. RLS sin política DELETE => DELETE denegado.

-- DOWN
-- DROP POLICY IF EXISTS planning_schedules_update ON planning_schedules;
-- DROP POLICY IF EXISTS planning_schedules_insert ON planning_schedules;
-- DROP POLICY IF EXISTS planning_schedules_select ON planning_schedules;
-- ALTER TABLE planning_schedules DISABLE ROW LEVEL SECURITY;
