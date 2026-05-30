-- Migration: CATÁLOGO — resources, labor_roles
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- UP

CREATE TABLE resources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  code                text NOT NULL,
  name                text NOT NULL,
  resource_type       text NOT NULL,
  unit                text NOT NULL,
  default_waste_pct   numeric(20,10) NOT NULL DEFAULT 0,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resources_resource_type_valid
    CHECK (resource_type IN ('material','labor','equipment','tool','subcontract','other')),
  CONSTRAINT resources_default_waste_pct_nonneg CHECK (default_waste_pct >= 0)
);

CREATE INDEX resources_organization_id_idx ON resources (organization_id);
CREATE UNIQUE INDEX resources_org_code_uq ON resources (organization_id, code);
CREATE INDEX resources_org_type_idx ON resources (organization_id, resource_type);

CREATE TRIGGER resources_set_updated_at
  BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE labor_roles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  code                    text NOT NULL,
  name                    text NOT NULL,
  base_salary             numeric(20,10) NOT NULL,
  transport_subsidy       numeric(20,10) NOT NULL DEFAULT 0,
  benefits_pct            numeric(20,10) NOT NULL DEFAULT 0,
  social_security_pct     numeric(20,10) NOT NULL DEFAULT 0,
  payroll_tax_pct         numeric(20,10) NOT NULL DEFAULT 0,
  uniform_cost            numeric(20,10) NOT NULL DEFAULT 0,
  uniform_period_months   numeric(20,10) NOT NULL DEFAULT 12,
  working_days_month      numeric(20,10) NOT NULL,
  working_hours_day       numeric(20,10) NOT NULL,
  active                  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_roles_pcts_nonneg CHECK (
    benefits_pct >= 0 AND social_security_pct >= 0 AND payroll_tax_pct >= 0
    AND transport_subsidy >= 0 AND uniform_cost >= 0
  ),
  CONSTRAINT labor_roles_working_days_pos CHECK (working_days_month > 0),
  CONSTRAINT labor_roles_working_hours_pos CHECK (working_hours_day > 0)
);

CREATE UNIQUE INDEX labor_roles_org_code_uq ON labor_roles (organization_id, code);

CREATE TRIGGER labor_roles_set_updated_at
  BEFORE UPDATE ON labor_roles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- DOWN
-- DROP TABLE IF EXISTS labor_roles;
-- DROP TABLE IF EXISTS resources;
