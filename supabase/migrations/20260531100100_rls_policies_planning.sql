-- Migration: RLS — políticas de planning por organización (Oleada 3B).
-- Agent: agent-db-rls
-- Contrato congelado: docs/PLANNING_CONTRACT.md (v1).
--
-- Modelo de aislamiento de las 4 tablas de planning:
--   * organization_id DIRECTO en las 4 tablas ⇒ filtro simple por
--     app.current_org() (helper de la migración 20260530090000).
--   * FORCE ROW LEVEL SECURITY: RLS aplica también al owner; solo BYPASSRLS
--     (service_role) la elude.
--   * Defensa adicional en INSERT/UPDATE (WITH CHECK): además de exigir que la
--     propia fila pertenezca a la organización actual, se verifica que el
--     project_id (y, donde aplica, el task_id padre) pertenezcan a la MISMA
--     organización. Así no se pueden "colgar" filas de planning de una org sobre
--     proyectos/tareas de otra, aun con organization_id propio correcto.
--   * progress_entries es APPEND-ONLY (como price_observations): SELECT + INSERT;
--     sin política UPDATE ni DELETE ⇒ ambas denegadas por RLS.
--
-- Política separada por acción donde hay reglas distintas; FOR ALL cuando el
-- mismo predicado cubre las cuatro.
--
-- UP

-- ===========================================================================
-- schedule_tasks — organization_id directo. CRUD dentro de la organización.
-- ===========================================================================
ALTER TABLE schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY schedule_tasks_select ON schedule_tasks
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY schedule_tasks_insert ON schedule_tasks
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    -- El proyecto debe ser de la misma organización.
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = schedule_tasks.project_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY schedule_tasks_update ON schedule_tasks
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (
    organization_id = app.current_org()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = schedule_tasks.project_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY schedule_tasks_delete ON schedule_tasks
  FOR DELETE USING (organization_id = app.current_org());

-- ===========================================================================
-- task_dependencies — organization_id directo + coherencia de tareas.
-- ===========================================================================
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies FORCE ROW LEVEL SECURITY;

CREATE POLICY task_dependencies_select ON task_dependencies
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY task_dependencies_insert ON task_dependencies
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    -- Ambas tareas (predecesora y sucesora) deben ser de la misma organización.
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.predecessor_task_id
        AND t.organization_id = app.current_org()
    )
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.successor_task_id
        AND t.organization_id = app.current_org()
    )
  );
CREATE POLICY task_dependencies_update ON task_dependencies
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (
    organization_id = app.current_org()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.predecessor_task_id
        AND t.organization_id = app.current_org()
    )
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.successor_task_id
        AND t.organization_id = app.current_org()
    )
  );
CREATE POLICY task_dependencies_delete ON task_dependencies
  FOR DELETE USING (organization_id = app.current_org());

-- ===========================================================================
-- progress_entries — APPEND-ONLY (SELECT + INSERT). Sin UPDATE/DELETE.
-- ===========================================================================
ALTER TABLE progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY progress_entries_select ON progress_entries
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY progress_entries_insert ON progress_entries
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    -- La tarea avanzada debe ser de la misma organización.
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = progress_entries.task_id
        AND t.organization_id = app.current_org()
    )
  );
-- Sin política UPDATE ni DELETE: el histórico de avance es inmutable
-- (append-only). RLS sin política para una acción => acción denegada.

-- ===========================================================================
-- resource_assignments — organization_id directo + coherencia de tarea.
-- ===========================================================================
ALTER TABLE resource_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY resource_assignments_select ON resource_assignments
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY resource_assignments_insert ON resource_assignments
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = resource_assignments.task_id
        AND t.organization_id = app.current_org()
    )
  );
CREATE POLICY resource_assignments_update ON resource_assignments
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (
    organization_id = app.current_org()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = resource_assignments.task_id
        AND t.organization_id = app.current_org()
    )
  );
CREATE POLICY resource_assignments_delete ON resource_assignments
  FOR DELETE USING (organization_id = app.current_org());

-- DOWN
-- DROP POLICY IF EXISTS resource_assignments_delete ON resource_assignments;
-- DROP POLICY IF EXISTS resource_assignments_update ON resource_assignments;
-- DROP POLICY IF EXISTS resource_assignments_insert ON resource_assignments;
-- DROP POLICY IF EXISTS resource_assignments_select ON resource_assignments;
-- DROP POLICY IF EXISTS progress_entries_insert ON progress_entries;
-- DROP POLICY IF EXISTS progress_entries_select ON progress_entries;
-- DROP POLICY IF EXISTS task_dependencies_delete ON task_dependencies;
-- DROP POLICY IF EXISTS task_dependencies_update ON task_dependencies;
-- DROP POLICY IF EXISTS task_dependencies_insert ON task_dependencies;
-- DROP POLICY IF EXISTS task_dependencies_select ON task_dependencies;
-- DROP POLICY IF EXISTS schedule_tasks_delete ON schedule_tasks;
-- DROP POLICY IF EXISTS schedule_tasks_update ON schedule_tasks;
-- DROP POLICY IF EXISTS schedule_tasks_insert ON schedule_tasks;
-- DROP POLICY IF EXISTS schedule_tasks_select ON schedule_tasks;
-- ALTER TABLE resource_assignments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE progress_entries DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE task_dependencies DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE schedule_tasks DISABLE ROW LEVEL SECURITY;
