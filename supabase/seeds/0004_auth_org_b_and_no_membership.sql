-- Seed: organización B y usuario SIN membresía (DESARROLLO/TESTING — auth 4A.1)
-- Agent: agent-db-rls
--
-- Propósito (AUTH_CONTRACT v1, microfase 4A.1):
--   * Dos organizaciones (A en 0001/0002, B aquí) para probar aislamiento real
--     por auth.uid() además del modo claims-demo.
--   * Roles variados en B (admin/gerencia/obra/consulta) cubriendo los cuatro
--     ViewerRole del mapeo (management/internal/site/client).
--   * Un usuario AUTENTICADO SIN PROFILE (auth.users sin fila en profiles) para
--     probar deny-by-default por falta de membresía.
--
-- 100% sanitizado: SIN nombres reales, SIN credenciales, SIN PII, SIN datos del
-- Excel privado. UUIDs fijos para reproducibilidad. Idempotente (ON CONFLICT).
--
-- IDs (alineados con scripts/rls-runtime/run.ts para que su setupOrgB sea no-op):
--   org B            : 00000000-0000-0000-0000-0000000000a2
--   admin B          : 00000000-0000-0000-0000-0000000000b7  (management)
--   gerencia B       : 00000000-0000-0000-0000-0000000000b8  (management)
--   obra B           : 00000000-0000-0000-0000-0000000000b9  (site)
--   consulta B       : 00000000-0000-0000-0000-0000000000ba  (client)
--   proyecto B       : 00000000-0000-0000-0000-0000000000c2
--   usuario sin org  : 00000000-0000-0000-0000-0000000000bf  (auth.users SIN profile)
--
-- NOTA RLS: se ejecuta como migrador (BYPASSRLS); inserta sin pasar por
-- app.current_org().

-- Organización B -----------------------------------------------------------
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000a2', 'Constructora Demo B')
ON CONFLICT (id) DO NOTHING;

-- Usuarios de autenticación de B + el usuario sin membresía (solo si existe el
-- esquema auth, igual que el seed 0001). Las filas de auth.users deben existir
-- ANTES que profiles por el FK condicional profiles_id_auth_users_fk.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES
      ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@example.test'),
      ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerencia-b@example.test'),
      ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'obra-b@example.test'),
      ('00000000-0000-0000-0000-0000000000ba', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'consulta-b@example.test'),
      -- Usuario autenticado SIN membresía: existe en auth.users pero NO en profiles.
      ('00000000-0000-0000-0000-0000000000bf', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sin-membresia@example.test')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Perfiles de B: roles variados (cubren los 4 ViewerRole del mapeo congelado).
INSERT INTO profiles (id, organization_id, full_name, email, role) VALUES
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000a2', 'Admin B',    'admin-b@example.test',    'admin'),
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000a2', 'Gerencia B', 'gerencia-b@example.test', 'gerencia'),
  ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000a2', 'Obra B',     'obra-b@example.test',     'obra'),
  ('00000000-0000-0000-0000-0000000000ba', '00000000-0000-0000-0000-0000000000a2', 'Consulta B', 'consulta-b@example.test', 'consulta')
ON CONFLICT (id) DO NOTHING;
-- IMPORTANTE: el usuario ...bf NO recibe profile (caso deny-by-default).

-- Proyecto de B (para pruebas de aislamiento de lectura/escritura entre orgs).
INSERT INTO projects (id, organization_id, code, name, status, location) VALUES
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2',
   'PROY-B', 'Proyecto B', 'active', 'Demo B')
ON CONFLICT (id) DO NOTHING;
