-- Migration: PLANNING — schedule_tasks, task_dependencies, progress_entries,
--            resource_assignments (Oleada 3B).
-- Agent: agent-db-rls
-- Contrato congelado: docs/PLANNING_CONTRACT.md (v1).
--
-- Esquema de planificación de obra: cronograma (WBS jerárquico), dependencias
-- (FS/SS/FF/SF), avance físico (append-only) y asignación de recursos.
-- Reglas de tipo/integridad iguales al resto del esquema:
--   * UUID PK gen_random_uuid(); dinero/cantidades/duraciones NUMERIC; fechas
--     de calendario DATE; auditoría TIMESTAMPTZ; enums como TEXT + CHECK.
--   * organization_id DIRECTO en las 4 tablas (RLS se define en la migración
--     20260531100100_rls_policies_planning.sql). Se desnormaliza organization_id
--     porque el contrato de planning lo exige explícitamente (RLS simple y
--     directa, sin cadenas largas de JOIN por tarea/dependencia/avance).
--   * Trigger app.set_updated_at() solo donde hay updated_at (schedule_tasks).
--
-- UP

-- ===========================================================================
-- schedule_tasks — tareas del cronograma (WBS jerárquico).
-- ===========================================================================
CREATE TABLE schedule_tasks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id             uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  project_scope_id       uuid REFERENCES project_scopes (id) ON DELETE SET NULL,
  chapter_id             uuid REFERENCES chapters (id) ON DELETE SET NULL,
  parent_task_id         uuid REFERENCES schedule_tasks (id) ON DELETE CASCADE,
  wbs_code               text NOT NULL,
  name                   text NOT NULL,
  description            text,
  planned_start          date NOT NULL,
  planned_end            date NOT NULL,
  planned_duration_days  numeric(12,4) NOT NULL,
  progress_pct           numeric(7,4) NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'not_started',
  is_milestone           boolean NOT NULL DEFAULT false,
  sort_order             integer NOT NULL DEFAULT 0,
  external_reference     text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_tasks_dates_valid CHECK (planned_end >= planned_start),
  CONSTRAINT schedule_tasks_duration_nonneg CHECK (planned_duration_days >= 0),
  CONSTRAINT schedule_tasks_progress_range CHECK (progress_pct >= 0 AND progress_pct <= 100),
  CONSTRAINT schedule_tasks_status_valid
    CHECK (status IN ('not_started','in_progress','completed','blocked','cancelled')),
  -- Hito ⇒ duración 0 y fechas coincidentes (planned_start = planned_end).
  CONSTRAINT schedule_tasks_milestone_zero_duration
    CHECK (
      NOT is_milestone
      OR (planned_duration_days = 0 AND planned_start = planned_end)
    )
);

CREATE INDEX schedule_tasks_organization_id_idx ON schedule_tasks (organization_id);
CREATE INDEX schedule_tasks_project_id_idx ON schedule_tasks (project_id);
CREATE INDEX schedule_tasks_project_scope_id_idx ON schedule_tasks (project_scope_id);
CREATE INDEX schedule_tasks_chapter_id_idx ON schedule_tasks (chapter_id);
CREATE INDEX schedule_tasks_parent_task_id_idx ON schedule_tasks (parent_task_id);
-- Listado ordenado de un proyecto (Gantt): filtro por proyecto + secuencia.
CREATE INDEX schedule_tasks_project_sort_idx ON schedule_tasks (project_id, sort_order);
-- Filtros frecuentes por fechas de plan (ruta crítica / ventana temporal).
CREATE INDEX schedule_tasks_project_start_idx ON schedule_tasks (project_id, planned_start);
CREATE UNIQUE INDEX schedule_tasks_project_wbs_uq ON schedule_tasks (project_id, wbs_code);

CREATE TRIGGER schedule_tasks_set_updated_at
  BEFORE UPDATE ON schedule_tasks
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ===========================================================================
-- task_dependencies — dependencias entre tareas (FS/SS/FF/SF + lag).
-- ===========================================================================
CREATE TABLE task_dependencies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  predecessor_task_id  uuid NOT NULL REFERENCES schedule_tasks (id) ON DELETE CASCADE,
  successor_task_id    uuid NOT NULL REFERENCES schedule_tasks (id) ON DELETE CASCADE,
  dependency_type      text NOT NULL DEFAULT 'FS',
  lag_days             numeric(12,4) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_dependencies_no_self CHECK (predecessor_task_id <> successor_task_id),
  CONSTRAINT task_dependencies_type_valid
    CHECK (dependency_type IN ('FS','SS','FF','SF'))
);

CREATE INDEX task_dependencies_organization_id_idx ON task_dependencies (organization_id);
CREATE INDEX task_dependencies_project_id_idx ON task_dependencies (project_id);
CREATE INDEX task_dependencies_predecessor_idx ON task_dependencies (predecessor_task_id);
CREATE INDEX task_dependencies_successor_idx ON task_dependencies (successor_task_id);
-- Sin dependencias duplicadas predecesora→sucesora. Los ciclos se detectan en
-- el dominio (modules/planning), no por constraint.
CREATE UNIQUE INDEX task_dependencies_pred_succ_uq
  ON task_dependencies (predecessor_task_id, successor_task_id);

-- ===========================================================================
-- progress_entries — histórico de avance físico (APPEND-ONLY).
-- ===========================================================================
-- Igual que price_observations: sin UPDATE ni DELETE por política RLS. El
-- histórico de avance nunca se reescribe.
CREATE TABLE progress_entries (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id                  uuid NOT NULL REFERENCES schedule_tasks (id) ON DELETE CASCADE,
  recorded_at              timestamptz NOT NULL,
  physical_progress_pct    numeric(7,4) NOT NULL,
  financial_progress_pct   numeric(7,4),
  notes                    text,
  created_by               uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT progress_entries_physical_range
    CHECK (physical_progress_pct >= 0 AND physical_progress_pct <= 100),
  CONSTRAINT progress_entries_financial_range
    CHECK (
      financial_progress_pct IS NULL
      OR (financial_progress_pct >= 0 AND financial_progress_pct <= 100)
    )
);

CREATE INDEX progress_entries_organization_id_idx ON progress_entries (organization_id);
CREATE INDEX progress_entries_project_id_idx ON progress_entries (project_id);
-- Último avance por tarea (recorded_at DESC): índice del contrato.
CREATE INDEX progress_entries_task_recorded_idx
  ON progress_entries (task_id, recorded_at DESC);

-- ===========================================================================
-- resource_assignments — asignación de recursos / mano de obra a tareas.
-- ===========================================================================
CREATE TABLE resource_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id          uuid NOT NULL REFERENCES schedule_tasks (id) ON DELETE CASCADE,
  resource_id      uuid REFERENCES resources (id) ON DELETE SET NULL,
  labor_role_id    uuid REFERENCES labor_roles (id) ON DELETE SET NULL,
  quantity         numeric(20,10),
  unit             text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_assignments_quantity_nonneg
    CHECK (quantity IS NULL OR quantity >= 0)
);

CREATE INDEX resource_assignments_organization_id_idx ON resource_assignments (organization_id);
CREATE INDEX resource_assignments_project_id_idx ON resource_assignments (project_id);
CREATE INDEX resource_assignments_task_id_idx ON resource_assignments (task_id);
CREATE INDEX resource_assignments_resource_id_idx ON resource_assignments (resource_id);
CREATE INDEX resource_assignments_labor_role_id_idx ON resource_assignments (labor_role_id);

-- DOWN
-- DROP TABLE IF EXISTS resource_assignments;
-- DROP TABLE IF EXISTS progress_entries;
-- DROP TABLE IF EXISTS task_dependencies;
-- DROP TABLE IF EXISTS schedule_tasks;
