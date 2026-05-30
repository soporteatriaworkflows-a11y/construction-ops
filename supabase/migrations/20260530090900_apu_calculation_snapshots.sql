-- Migration: SNAPSHOTS — apu_calculation_snapshots
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- Tabla totalmente inmutable: una fila ES un snapshot del costo unitario de
-- un APU para una versión de presupuesto. RLS bloquea UPDATE y DELETE
-- (migración de políticas). Se crea aquí, tras estimate_versions y
-- apu_templates (FK).
--
-- UP

CREATE TABLE apu_calculation_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apu_template_id       uuid NOT NULL REFERENCES apu_templates (id) ON DELETE RESTRICT,
  estimate_version_id   uuid NOT NULL REFERENCES estimate_versions (id) ON DELETE CASCADE,
  calculated_unit_cost  numeric(20,10) NOT NULL,
  components_json       jsonb NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apu_calc_snapshots_unit_cost_nonneg CHECK (calculated_unit_cost >= 0)
);

CREATE UNIQUE INDEX apu_calc_snapshots_template_version_uq
  ON apu_calculation_snapshots (apu_template_id, estimate_version_id);

-- DOWN
-- DROP TABLE IF EXISTS apu_calculation_snapshots;
