-- Migration: PRECIOS — pricing_rules
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- UP

CREATE TABLE pricing_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name                 text NOT NULL,
  rule_type            text NOT NULL,
  percentage           numeric(20,10),
  scope_type           text NOT NULL DEFAULT 'global',
  scope_reference_id   uuid,
  active               boolean NOT NULL DEFAULT true,
  effective_from       timestamptz,
  effective_to         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_rules_rule_type_valid CHECK (
    rule_type IN ('preventive_variation','negotiated_discount','tax','commercial_markup','rounding','manual_adjustment')
  ),
  CONSTRAINT pricing_rules_scope_type_valid CHECK (
    scope_type IN ('global','project','scope','resource','supplier_product')
  ),
  CONSTRAINT pricing_rules_effective_range_valid CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX pricing_rules_org_rule_type_idx ON pricing_rules (organization_id, rule_type);
CREATE INDEX pricing_rules_org_active_idx ON pricing_rules (organization_id, active);

CREATE TRIGGER pricing_rules_set_updated_at
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- DOWN
-- DROP TABLE IF EXISTS pricing_rules;
