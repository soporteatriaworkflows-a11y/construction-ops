-- Migration: APU — apu_templates, apu_components
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- UP

CREATE TABLE apu_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  code                 text NOT NULL,
  name                 text NOT NULL,
  unit                 text NOT NULL,
  chapter_template_id  uuid,
  description          text,
  active               boolean NOT NULL DEFAULT true,
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apu_templates_version_min CHECK (version >= 1)
);

CREATE INDEX apu_templates_organization_id_idx ON apu_templates (organization_id);
CREATE UNIQUE INDEX apu_templates_org_code_version_uq
  ON apu_templates (organization_id, code, version);

CREATE TRIGGER apu_templates_set_updated_at
  BEFORE UPDATE ON apu_templates
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- apu_components: sin created_at/updated_at en el contrato (línea de detalle).
CREATE TABLE apu_components (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apu_template_id       uuid NOT NULL REFERENCES apu_templates (id) ON DELETE CASCADE,
  resource_id           uuid REFERENCES resources (id) ON DELETE RESTRICT,
  component_type        text NOT NULL,
  quantity              numeric(20,10) NOT NULL,
  waste_pct             numeric(20,10) NOT NULL DEFAULT 0,
  unit_price_source     text NOT NULL,
  unit_price_snapshot   numeric(20,10) NOT NULL,
  total_component_cost  numeric(20,10) NOT NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  notes                 text,
  CONSTRAINT apu_components_component_type_valid CHECK (
    component_type IN ('material','labor','equipment','tool','subcontract','other')
  ),
  CONSTRAINT apu_components_unit_price_source_valid CHECK (
    unit_price_source IN ('resource','labor_role','manual','supplier_product')
  ),
  CONSTRAINT apu_components_nonneg CHECK (
    quantity >= 0 AND waste_pct >= 0 AND unit_price_snapshot >= 0
  )
);

CREATE INDEX apu_components_template_sort_idx ON apu_components (apu_template_id, sort_order);
CREATE INDEX apu_components_resource_id_idx ON apu_components (resource_id);

-- DOWN
-- DROP TABLE IF EXISTS apu_components;
-- DROP TABLE IF EXISTS apu_templates;
