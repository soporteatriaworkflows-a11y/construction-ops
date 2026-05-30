-- Migration: CORE — organizations, profiles
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- UP

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- profiles.id = auth.users.id. La FK a auth.users solo existe en una base
-- Supabase real; se crea condicionalmente para permitir pruebas locales sin
-- el esquema auth.
CREATE TABLE profiles (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  full_name        text NOT NULL,
  email            text NOT NULL,
  role             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_role_valid
    CHECK (role IN ('admin','gerencia','presupuestos','obra','compras','consulta'))
);

CREATE INDEX profiles_organization_id_idx ON profiles (organization_id);
CREATE UNIQUE INDEX profiles_org_email_uq ON profiles (organization_id, email);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- FK opcional a auth.users (solo si el esquema auth existe, p. ej. Supabase).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_id_auth_users_fk
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

-- DOWN
-- DROP TABLE IF EXISTS profiles;
-- DROP TABLE IF EXISTS organizations;
