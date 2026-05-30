-- Migration: PRESUPUESTO — estimates, estimate_versions, chapters,
--            boq_items, indirect_cost_rules
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- Nota: boq_items.quantity_group_id referencia quantity_groups, que se crea
-- en la migración 090800. La FK correspondiente se añade allí (ALTER) para
-- respetar el orden recomendado de migraciones sin romper la integridad.
--
-- UP

CREATE TABLE estimates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_scope_id  uuid NOT NULL REFERENCES project_scopes (id) ON DELETE CASCADE,
  code              text NOT NULL,
  name              text NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimates_status_valid CHECK (status IN ('draft','active','archived'))
);

CREATE INDEX estimates_project_scope_id_idx ON estimates (project_scope_id);
CREATE UNIQUE INDEX estimates_scope_code_uq ON estimates (project_scope_id, code);

CREATE TRIGGER estimates_set_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- estimate_versions: sin updated_at (versión congelable; created_at + approved_at).
CREATE TABLE estimate_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id     uuid NOT NULL REFERENCES estimates (id) ON DELETE CASCADE,
  version_number  integer NOT NULL,
  status          text NOT NULL DEFAULT 'draft',
  created_by      uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz,
  notes           text,
  CONSTRAINT estimate_versions_status_valid CHECK (
    status IN ('draft','review','approved','issued','archived')
  ),
  CONSTRAINT estimate_versions_number_min CHECK (version_number >= 1)
);

CREATE UNIQUE INDEX estimate_versions_estimate_number_uq
  ON estimate_versions (estimate_id, version_number);
CREATE INDEX estimate_versions_status_idx ON estimate_versions (status);

CREATE TABLE chapters (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id  uuid NOT NULL REFERENCES estimate_versions (id) ON DELETE CASCADE,
  code                 text NOT NULL,
  name                 text NOT NULL,
  sort_order           integer NOT NULL DEFAULT 0
);

CREATE INDEX chapters_version_sort_idx ON chapters (estimate_version_id, sort_order);
CREATE UNIQUE INDEX chapters_version_code_uq ON chapters (estimate_version_id, code);

CREATE TABLE boq_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id    uuid NOT NULL REFERENCES estimate_versions (id) ON DELETE CASCADE,
  chapter_id             uuid NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
  apu_template_id        uuid REFERENCES apu_templates (id) ON DELETE SET NULL,
  quantity_group_id      uuid, -- FK añadida en 090800 (orden de migraciones)
  code                   text NOT NULL,
  description_snapshot   text NOT NULL,
  unit_snapshot          text NOT NULL,
  quantity_snapshot      numeric(20,10) NOT NULL,
  unit_price_snapshot    numeric(20,10) NOT NULL,
  subtotal               numeric(20,10) NOT NULL,
  sort_order             integer NOT NULL DEFAULT 0,
  notes                  text,
  CONSTRAINT boq_items_nonneg CHECK (
    quantity_snapshot >= 0 AND unit_price_snapshot >= 0 AND subtotal >= 0
  )
);

CREATE INDEX boq_items_version_idx ON boq_items (estimate_version_id);
CREATE INDEX boq_items_chapter_sort_idx ON boq_items (chapter_id, sort_order);
CREATE INDEX boq_items_apu_template_idx ON boq_items (apu_template_id);

CREATE TABLE indirect_cost_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id  uuid NOT NULL REFERENCES estimate_versions (id) ON DELETE CASCADE,
  code                 text NOT NULL,
  name                 text NOT NULL,
  percentage           numeric(20,10) NOT NULL,
  base_type            text NOT NULL,
  sort_order           integer NOT NULL DEFAULT 0,
  visible_to_client    boolean NOT NULL DEFAULT true,
  CONSTRAINT indirect_cost_rules_pct_nonneg CHECK (percentage >= 0),
  CONSTRAINT indirect_cost_rules_base_type_valid CHECK (
    base_type IN ('direct_cost','utility','custom')
  )
);

CREATE INDEX indirect_cost_rules_version_sort_idx
  ON indirect_cost_rules (estimate_version_id, sort_order);
CREATE UNIQUE INDEX indirect_cost_rules_version_code_uq
  ON indirect_cost_rules (estimate_version_id, code);

-- DOWN
-- DROP TABLE IF EXISTS indirect_cost_rules;
-- DROP TABLE IF EXISTS boq_items;
-- DROP TABLE IF EXISTS chapters;
-- DROP TABLE IF EXISTS estimate_versions;
-- DROP TABLE IF EXISTS estimates;
