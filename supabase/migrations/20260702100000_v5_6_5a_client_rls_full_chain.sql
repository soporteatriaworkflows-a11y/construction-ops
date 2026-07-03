-- Migration: RLS — V5_6_5A_PROJECT_SCOPED_RLS_GAP_CLOSURE (parte 1/2: SELECT full chain)
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/design-references/V5_6_5_PROJECT_SCOPED_RLS_GAP_CLOSURE.md
-- Cierra la deuda V5_6_5_CLIENT_RLS_FULL_CHAIN (docs/OPEN_QUESTIONS.md).
--
-- Problema:
--   V5.6.4 parcho projects_select para que los roles cliente ('consulta' via
--   PostgREST y 'client' via claim user_role del read-model) solo vean
--   proyectos con grant. Las tablas cuya politica SELECT deriva por
--   EXISTS(... FROM projects ...) cascadan automaticamente. PERO las tablas
--   con organization_id DIRECTO (planning, quantity_workspace, takeoff,
--   import batches, quick_notes, catalogo/precios/APU) siguen org-scoped:
--   una consulta con JWT valido puede leerlas COMPLETAS por PostgREST,
--   incluyendo datos de proyectos NO asignados.
--
-- Solucion (esta migracion, solo SELECT; escrituras en parte 2/2):
--   1) Helper app.is_client_role(): true si el rol efectivo es 'consulta'
--      (PostgREST -> profiles.role) o 'client' (claim del read-model).
--      Con rol NULL devuelve false, pero toda politica exige ademas
--      organization_id = app.current_org(), que con NULL deniega
--      (deny-by-default intacto).
--   2) Tablas CON camino a proyecto: la politica SELECT exige, SOLO para
--      roles cliente, que el proyecto padre sea visible via EXISTS sobre
--      projects (o sobre una tabla intermedia ya project-scoped). La RLS de
--      projects (has_project_grant) aplica DENTRO del EXISTS => cascada
--      automatica de grants sin duplicar logica. Para roles internos el
--      predicado corto-circuita en NOT app.is_client_role() y el
--      comportamiento queda EXACTAMENTE igual que hoy.
--   3) Tablas SIN proposito para cliente externo (catalogo interno, precios,
--      descuentos, APU, procedencia de imports, notas internas): SELECT
--      denegado para roles cliente (regla global 4: descuentos internos
--      jamas a clientes; decision aprobada: consulta NO ve APU).
--
-- Anti-fuga de existencia: para el rol cliente, una fila de un proyecto no
-- asignado simplemente NO EXISTE (0 filas), igual que datos de otra org.
-- Anti-fail-open: sin grants => 0 filas en TODA la cadena.
--
-- Shadowing: toda referencia a columnas de la fila objetivo dentro de un
-- EXISTS va calificada con <tabla>.<columna> (leccion de 20260627093000).
--
-- UP

-- ===========================================================================
-- 1) Helper de rol cliente
-- ===========================================================================
CREATE OR REPLACE FUNCTION app.is_client_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(app.current_role(), '') IN ('consulta','client');
$$;

GRANT EXECUTE ON FUNCTION app.is_client_role() TO authenticated;

-- ===========================================================================
-- 2) Cadena project-scoped: planning
-- ===========================================================================

-- schedule_tasks: project_id directo -> EXISTS projects (RLS de projects
-- aplica dentro => grant-scoped para cliente; interno sin cambio).
DROP POLICY schedule_tasks_select ON schedule_tasks;
CREATE POLICY schedule_tasks_select ON schedule_tasks
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = schedule_tasks.project_id
          AND p.organization_id = app.current_org()
      )
    )
  );

-- planning_schedules: project_id directo.
DROP POLICY planning_schedules_select ON planning_schedules;
CREATE POLICY planning_schedules_select ON planning_schedules
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = planning_schedules.project_id
          AND p.organization_id = app.current_org()
      )
    )
  );

-- task_dependencies: sin project_id propio; deriva por la tarea sucesora
-- (schedule_tasks ya project-scoped arriba; su RLS aplica dentro del EXISTS).
DROP POLICY task_dependencies_select ON task_dependencies;
CREATE POLICY task_dependencies_select ON task_dependencies
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1 FROM schedule_tasks t
        WHERE t.id = task_dependencies.successor_task_id
      )
    )
  );

-- progress_entries: deriva por la tarea avanzada.
DROP POLICY progress_entries_select ON progress_entries;
CREATE POLICY progress_entries_select ON progress_entries
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1 FROM schedule_tasks t
        WHERE t.id = progress_entries.task_id
      )
    )
  );

-- resource_assignments: deriva por la tarea asignada.
DROP POLICY resource_assignments_select ON resource_assignments;
CREATE POLICY resource_assignments_select ON resource_assignments
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1 FROM schedule_tasks t
        WHERE t.id = resource_assignments.task_id
      )
    )
  );

-- ===========================================================================
-- 3) Cadena project-scoped: cantidades (workspace y takeoff)
-- ===========================================================================

-- quantity_workspace_groups: project_scope_id -> project_scopes -> projects.
DROP POLICY qwg_select_own_org ON quantity_workspace_groups;
CREATE POLICY qwg_select_own_org ON quantity_workspace_groups
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1
        FROM project_scopes ps
        JOIN projects p ON p.id = ps.project_id
        WHERE ps.id = quantity_workspace_groups.project_scope_id
          AND p.organization_id = app.current_org()
      )
    )
  );

-- quantity_workspace_lines: deriva por su grupo (ya project-scoped arriba).
DROP POLICY qwl_select_own_org ON quantity_workspace_lines;
CREATE POLICY qwl_select_own_org ON quantity_workspace_lines
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1 FROM quantity_workspace_groups g
        WHERE g.id = quantity_workspace_lines.group_id
      )
    )
  );

-- quantity_takeoff_groups: deriva por estimate_version_id (la RLS de
-- estimate_versions cascada desde projects). Grupo sin version vinculada
-- (estimate_version_id NULL) => invisible para cliente (fail-closed).
DROP POLICY qtg_select_own_org ON quantity_takeoff_groups;
CREATE POLICY qtg_select_own_org ON quantity_takeoff_groups
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR (
        quantity_takeoff_groups.estimate_version_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM estimate_versions ev
          WHERE ev.id = quantity_takeoff_groups.estimate_version_id
        )
      )
    )
  );

-- quantity_takeoff_lines: deriva por su grupo (ya project-scoped arriba).
DROP POLICY qtl_select_own_org ON quantity_takeoff_lines;
CREATE POLICY qtl_select_own_org ON quantity_takeoff_lines
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND (
      NOT app.is_client_role()
      OR EXISTS (
        SELECT 1 FROM quantity_takeoff_groups g
        WHERE g.id = quantity_takeoff_lines.group_id
      )
    )
  );

-- ===========================================================================
-- 4) Tablas internas: SELECT denegado a roles cliente
--    (sin camino a proyecto o sin proposito para cliente externo)
-- ===========================================================================

-- quantity_import_batches: procedencia de imports, sin vinculo a proyecto.
DROP POLICY qib_select_own_org ON quantity_import_batches;
CREATE POLICY qib_select_own_org ON quantity_import_batches
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- quick_notes: notas internas por contrato (V5.4.2a).
DROP POLICY quick_notes_select_own_org ON quick_notes;
CREATE POLICY quick_notes_select_own_org ON quick_notes
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- APU (decision aprobada: consulta como cliente externo NO ve APU).
DROP POLICY apu_templates_select ON apu_templates;
CREATE POLICY apu_templates_select ON apu_templates
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY aib_select_own_org ON apu_import_batches;
CREATE POLICY aib_select_own_org ON apu_import_batches
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY apu_component_resource_actions_select ON apu_component_resource_actions;
CREATE POLICY apu_component_resource_actions_select ON apu_component_resource_actions
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY apu_manual_actions_select ON apu_manual_actions;
CREATE POLICY apu_manual_actions_select ON apu_manual_actions
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- [V5.6.5A-SNAPSHOTS] deny client — pendiente verificacion read-model (ver doc).
-- Los snapshots contienen el desglose financiero del APU por item; la decision
-- "consulta NO ve APU" aplica tambien aqui. Si el read-model client-facing
-- resultara depender de esta tabla, retirar SOLO este bloque.
DROP POLICY apu_calc_snapshots_select ON apu_calculation_snapshots;
CREATE POLICY apu_calc_snapshots_select ON apu_calculation_snapshots
  FOR SELECT
  USING (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.is_client_role()
  );

-- Catalogo/costos internos (regla global 4: descuentos internos jamas se
-- exponen a clientes; el catalogo de recursos/mano de obra es interno).
DROP POLICY resources_select ON resources;
CREATE POLICY resources_select ON resources
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY labor_roles_select ON labor_roles;
CREATE POLICY labor_roles_select ON labor_roles
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY suppliers_select ON suppliers;
CREATE POLICY suppliers_select ON suppliers
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY pricing_rules_select ON pricing_rules;
CREATE POLICY pricing_rules_select ON pricing_rules
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- Inteligencia de precios (observaciones, monitoreo, lotes, acciones).
DROP POLICY price_observations_select ON price_observations;
CREATE POLICY price_observations_select ON price_observations
  FOR SELECT
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM supplier_products sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.id = price_observations.supplier_product_id
        AND s.organization_id = app.current_org()
    )
  );

DROP POLICY rpo_select_own_org ON resource_price_observations;
CREATE POLICY rpo_select_own_org ON resource_price_observations
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY pmt_select_own_org ON price_monitor_targets;
CREATE POLICY pmt_select_own_org ON price_monitor_targets
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY pmr_select_own_org ON price_monitor_runs;
CREATE POLICY pmr_select_own_org ON price_monitor_runs
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY pms_select_own_org ON price_monitor_results;
CREATE POLICY pms_select_own_org ON price_monitor_results
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY pob_select_own_org ON price_observation_batches;
CREATE POLICY pob_select_own_org ON price_observation_batches
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

DROP POLICY poba_select_own_org ON price_observation_bulk_actions;
CREATE POLICY poba_select_own_org ON price_observation_bulk_actions
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- NOTA: supplier_products y apu_components usan politicas FOR ALL; se dividen
-- y endurecen en la parte 2/2 (20260702100100).

-- DOWN
-- DROP POLICY IF EXISTS <politica> ON <tabla>; y recrear las versiones previas:
--   * schedule_tasks_select / planning_schedules_select / task_dependencies_select /
--     progress_entries_select / resource_assignments_select:
--       USING (organization_id = app.current_org())
--   * qwg_select_own_org / qwl_select_own_org / qtg_select_own_org /
--     qtl_select_own_org / qib_select_own_org / quick_notes_select_own_org /
--     apu_templates_select / aib_select_own_org /
--     apu_component_resource_actions_select / apu_manual_actions_select /
--     resources_select / labor_roles_select / suppliers_select /
--     pricing_rules_select / rpo_select_own_org / pmt_select_own_org /
--     pmr_select_own_org / pms_select_own_org / pob_select_own_org /
--     poba_select_own_org:
--       USING (organization_id = app.current_org())
--   * apu_calc_snapshots_select:
--       USING (app.estimate_version_in_org(estimate_version_id))
--   * price_observations_select:
--       USING (EXISTS (SELECT 1 FROM supplier_products sp JOIN suppliers s
--              ON s.id = sp.supplier_id WHERE sp.id =
--              price_observations.supplier_product_id
--              AND s.organization_id = app.current_org()))
-- DROP FUNCTION IF EXISTS app.is_client_role();
