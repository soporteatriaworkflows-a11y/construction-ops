-- Migration: CORE — projects, project_scopes
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- UP

CREATE TABLE projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  code                text NOT NULL,
  name                text NOT NULL,
  status              text NOT NULL DEFAULT 'active',
  client_reference    text,
  location            text,
  start_date          date,
  estimated_end_date  date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_status_valid CHECK (status IN ('active','archived','closed'))
);

CREATE INDEX projects_organization_id_idx ON projects (organization_id);
CREATE UNIQUE INDEX projects_org_code_uq ON projects (organization_id, code);

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE project_scopes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  parent_scope_id  uuid REFERENCES project_scopes (id) ON DELETE SET NULL,
  code             text NOT NULL,
  name             text NOT NULL,
  scope_type       text NOT NULL,
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_scopes_scope_type_valid
    CHECK (scope_type IN ('floor','tower','stage','package','unit','modification','other')),
  CONSTRAINT project_scopes_status_valid CHECK (status IN ('active','archived'))
);

CREATE INDEX project_scopes_project_id_idx ON project_scopes (project_id);
CREATE INDEX project_scopes_parent_scope_id_idx ON project_scopes (parent_scope_id);
CREATE UNIQUE INDEX project_scopes_project_code_uq ON project_scopes (project_id, code);

CREATE TRIGGER project_scopes_set_updated_at
  BEFORE UPDATE ON project_scopes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- DOWN
-- DROP TABLE IF EXISTS project_scopes;
-- DROP TABLE IF EXISTS projects;
