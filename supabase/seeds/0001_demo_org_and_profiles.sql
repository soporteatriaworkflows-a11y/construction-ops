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

-- Perfiles: uno por cada rol del contrato. Emails de ejemplo @example.test.
INSERT INTO profiles (id, organization_id, full_name, email, role) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Admin Demo',        'admin@example.test',        'admin'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'Gerencia Demo',     'gerencia@example.test',     'gerencia'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'Presupuestos Demo', 'presupuestos@example.test', 'presupuestos'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', 'Obra Demo',         'obra@example.test',         'obra'),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a1', 'Compras Demo',      'compras@example.test',      'compras'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', 'Consulta Demo',     'consulta@example.test',     'consulta')
ON CONFLICT (id) DO NOTHING;
