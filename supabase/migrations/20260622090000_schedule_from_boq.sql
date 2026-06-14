-- Migration: SCHEDULE_FROM_BOQ_V1 — planning_schedules (contenedor de cronograma)
--            + columnas aditivas en schedule_tasks (vínculo BOQ/APU/cuadrilla).
-- Agent: agent-orchestrator
-- Contrato congelado: docs/SCHEDULE_FROM_BOQ_V1_CONTRACT.md (v1).
--
-- Decisión aprobada (2026-06-14): EXTENDER la fundación de planning de Oleada 3B
-- (schedule_tasks/task_dependencies + dominio CPM/Gantt) en lugar de crear tablas
-- paralelas. Migración 100% ADITIVA: tabla nueva + columnas NULLABLE. No altera
-- ninguna columna/constraint existente. No toca presupuestos, BOQ, APU ni
-- quantities. RLS de la nueva tabla en 20260622090100_rls_schedule_from_boq.sql.
--
-- UP

-- ===========================================================================
-- planning_schedules — contenedor de cronograma derivado de un presupuesto.
-- ===========================================================================
CREATE TABLE planning_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- Origen del cronograma. NUNCA se modifica el presupuesto desde aquí (lectura).
  estimate_version_id  uuid NOT NULL REFERENCES estimate_versions (id) ON DELETE CASCADE,
  name                 text NOT NULL,
  status               text NOT NULL DEFAULT 'draft',
  start_date           date NOT NULL,
  end_date             date,
  created_by           uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz,
  CONSTRAINT planning_schedules_status_valid
    CHECK (status IN ('draft','baseline','active','archived')),
  CONSTRAINT planning_schedules_dates_valid
    CHECK (end_date IS NULL OR end_date >= start_date),
  -- Coherencia: archivado ⇔ tiene archived_at.
  CONSTRAINT planning_schedules_archived_coherent
    CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

CREATE INDEX planning_schedules_organization_id_idx ON planning_schedules (organization_id);
CREATE INDEX planning_schedules_project_id_idx ON planning_schedules (project_id);
CREATE INDEX planning_schedules_version_id_idx ON planning_schedules (estimate_version_id);
-- Listado por proyecto, recientes primero.
CREATE INDEX planning_schedules_project_created_idx
  ON planning_schedules (project_id, created_at DESC);

CREATE TRIGGER planning_schedules_set_updated_at
  BEFORE UPDATE ON planning_schedules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ===========================================================================
-- schedule_tasks — columnas ADITIVAS (todas NULLABLE). Vínculo BOQ/APU,
-- snapshot de cantidad/unidad, trazabilidad de duración y cuadrilla/responsable.
-- ===========================================================================
ALTER TABLE schedule_tasks
  ADD COLUMN schedule_id         uuid REFERENCES planning_schedules (id) ON DELETE CASCADE,
  ADD COLUMN boq_item_id         uuid REFERENCES boq_items (id) ON DELETE SET NULL,
  ADD COLUMN apu_template_id     uuid REFERENCES apu_templates (id) ON DELETE SET NULL,
  ADD COLUMN task_type           text,
  ADD COLUMN unit_snapshot       text,
  ADD COLUMN quantity_snapshot   numeric(20,10),
  ADD COLUMN productivity_source text,
  ADD COLUMN crew_label          text,
  ADD COLUMN crew_size           numeric(12,4),
  ADD COLUMN responsible         text;

-- notes: ya existe `description`; se añade `notes` independiente para anotaciones
-- de planificación (separado de la descripción técnica heredada del BOQ).
ALTER TABLE schedule_tasks ADD COLUMN notes text;

-- Constraints de los nuevos enums/valores. NOT VALID no es necesario: la tabla
-- 3B está vacía en este punto (sin caminos de escritura previos), así que validan
-- de inmediato sin riesgo. Permiten NULL (tareas 3B legacy sin estos campos).
ALTER TABLE schedule_tasks
  ADD CONSTRAINT schedule_tasks_task_type_valid
    CHECK (task_type IS NULL OR task_type IN ('chapter','activity','milestone'));
ALTER TABLE schedule_tasks
  ADD CONSTRAINT schedule_tasks_productivity_source_valid
    CHECK (productivity_source IS NULL OR productivity_source IN ('apu','manual','unknown'));
ALTER TABLE schedule_tasks
  ADD CONSTRAINT schedule_tasks_crew_size_nonneg
    CHECK (crew_size IS NULL OR crew_size >= 0);

CREATE INDEX schedule_tasks_schedule_id_idx ON schedule_tasks (schedule_id);
CREATE INDEX schedule_tasks_boq_item_id_idx ON schedule_tasks (boq_item_id);
CREATE INDEX schedule_tasks_apu_template_id_idx ON schedule_tasks (apu_template_id);
-- Listado ordenado de un cronograma (detalle tipo MS Project).
CREATE INDEX schedule_tasks_schedule_sort_idx ON schedule_tasks (schedule_id, sort_order);

-- DOWN
-- DROP INDEX IF EXISTS schedule_tasks_schedule_sort_idx;
-- DROP INDEX IF EXISTS schedule_tasks_apu_template_id_idx;
-- DROP INDEX IF EXISTS schedule_tasks_boq_item_id_idx;
-- DROP INDEX IF EXISTS schedule_tasks_schedule_id_idx;
-- ALTER TABLE schedule_tasks
--   DROP CONSTRAINT IF EXISTS schedule_tasks_crew_size_nonneg,
--   DROP CONSTRAINT IF EXISTS schedule_tasks_productivity_source_valid,
--   DROP CONSTRAINT IF EXISTS schedule_tasks_task_type_valid;
-- ALTER TABLE schedule_tasks
--   DROP COLUMN IF EXISTS notes,
--   DROP COLUMN IF EXISTS responsible,
--   DROP COLUMN IF EXISTS crew_size,
--   DROP COLUMN IF EXISTS crew_label,
--   DROP COLUMN IF EXISTS productivity_source,
--   DROP COLUMN IF EXISTS quantity_snapshot,
--   DROP COLUMN IF EXISTS unit_snapshot,
--   DROP COLUMN IF EXISTS task_type,
--   DROP COLUMN IF EXISTS apu_template_id,
--   DROP COLUMN IF EXISTS boq_item_id,
--   DROP COLUMN IF EXISTS schedule_id;
-- DROP TABLE IF EXISTS planning_schedules;
