-- Migration: CANTIDADES — quantity_groups, quantity_lines
--            + FK boq_items.quantity_group_id (creada aquí por orden)
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- UP

-- quantity_groups: created_at sin updated_at (según contrato).
CREATE TABLE quantity_groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_scope_id  uuid NOT NULL REFERENCES project_scopes (id) ON DELETE CASCADE,
  code              text NOT NULL,
  name              text NOT NULL,
  unit              text NOT NULL,
  calculation_mode  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quantity_groups_calculation_mode_valid CHECK (
    calculation_mode IN ('direct','length','area','volume','custom')
  )
);

CREATE INDEX quantity_groups_project_scope_id_idx ON quantity_groups (project_scope_id);
CREATE UNIQUE INDEX quantity_groups_scope_code_uq ON quantity_groups (project_scope_id, code);

CREATE TABLE quantity_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quantity_group_id     uuid NOT NULL REFERENCES quantity_groups (id) ON DELETE CASCADE,
  description           text,
  length                numeric(20,10),
  width                 numeric(20,10),
  height                numeric(20,10),
  multiplier            numeric(20,10) NOT NULL DEFAULT 1,
  direct_quantity       numeric(20,10),
  formula_type          text NOT NULL,
  calculated_quantity   numeric(20,10) NOT NULL,
  notes                 text,
  sort_order            integer NOT NULL DEFAULT 0,
  CONSTRAINT quantity_lines_formula_type_valid CHECK (
    formula_type IN ('direct','length','area','volume','custom')
  ),
  CONSTRAINT quantity_lines_multiplier_nonneg CHECK (multiplier >= 0)
);

CREATE INDEX quantity_lines_group_sort_idx ON quantity_lines (quantity_group_id, sort_order);

-- FK diferida: boq_items.quantity_group_id → quantity_groups (ON DELETE SET NULL).
ALTER TABLE boq_items
  ADD CONSTRAINT boq_items_quantity_group_id_fk
  FOREIGN KEY (quantity_group_id) REFERENCES quantity_groups (id) ON DELETE SET NULL;

CREATE INDEX boq_items_quantity_group_idx ON boq_items (quantity_group_id);

-- DOWN
-- ALTER TABLE boq_items DROP CONSTRAINT IF EXISTS boq_items_quantity_group_id_fk;
-- DROP TABLE IF EXISTS quantity_lines;
-- DROP TABLE IF EXISTS quantity_groups;
