-- Seed: organización demo y perfiles por rol (DESARROLLO/TESTING)
-- Agent: agent-db-rls
--
-- 100% sanitizado: SIN nombres reales de clientes, SIN credenciales, SIN
-- descuentos contractuales, SIN datos del Excel privado. UUIDs fijos para
-- reproducibilidad de tests.
--
-- Idempotente: usa ON CONFLICT para poder re-ejecutarse.
--
-- NOTA RLS: este seed se ejecuta como owner/migrador (BYPASSRLS o service_role).
-- Inserta directamente sin pasar por app.current_org().

-- Organización demo --------------------------------------------------------
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Constructora Demo')
ON CONFLICT (id) DO NOTHING;

-- Usuarios de autenticación demo (solo si el esquema auth existe, p. ej. en el
-- stack local de Supabase). profiles.id = auth.users.id; cuando la migración
-- 0001 detecta auth.users crea el FK profiles_id_auth_users_fk, por lo que las
-- filas de auth.users deben existir ANTES de insertar profiles. Espejo exacto
-- de la condición de la migración => el seed sigue funcionando en un Postgres
-- puro sin esquema auth. Sin contraseñas/login reales: solo el id (que es lo
-- único que exige el FK). Sanitizado: emails @example.test.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES
      ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test'),
      ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerencia@example.test'),
      ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'presupuestos@example.test'),
      ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'obra@example.test'),
      ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'compras@example.test'),
      ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'consulta@example.test')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Perfiles: uno por cada rol del contrato. Emails de ejemplo @example.test.
INSERT INTO profiles (id, organization_id, full_name, email, role) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Admin Demo',        'admin@example.test',        'admin'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'Gerencia Demo',     'gerencia@example.test',     'gerencia'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'Presupuestos Demo', 'presupuestos@example.test', 'presupuestos'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', 'Obra Demo',         'obra@example.test',         'obra'),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a1', 'Compras Demo',      'compras@example.test',      'compras'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', 'Consulta Demo',     'consulta@example.test',     'consulta')
ON CONFLICT (id) DO NOTHING;
