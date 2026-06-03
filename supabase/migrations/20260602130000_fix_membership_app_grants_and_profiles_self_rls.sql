-- Migration: FIX membresía en modo db remoto (Oleada 4B.1)
-- Agent: agent-orchestrator (hotfix; a revisar/avalar por agent-db-rls).
-- Contrato: docs/PROJECTS_CRUD_CONTRACT.md / docs/AUTH_RUNTIME_CONTRACT.md.
--
-- Causa raíz (demostrada localmente, ver scripts/rls-runtime/run.ts):
--   (1) GRANTS FALTANTES: las migraciones nunca otorgaron al rol `authenticated`
--       USAGE sobre el esquema `app` ni EXECUTE sobre sus funciones. En el stack
--       local el harness los concedía en runtime (enmascarando el hueco); en
--       Supabase remoto el esquema `app` no es accesible por defecto, así que la
--       primera política RLS que invoca app.current_org() falla con
--       "permission denied for schema app". resolveAuthenticatedViewer() lee
--       `profiles` como primera consulta => el error se reporta como
--       "El usuario no tiene membresía.".
--   (2) RECURSIÓN RLS en `profiles`: la política de SELECT
--       (organization_id = app.current_org()) obliga a current_org() a leer
--       `profiles`, que vuelve a evaluar la misma política. Con un migrador SIN
--       BYPASSRLS (postgres de Supabase remoto), la función SECURITY DEFINER de
--       lookup NO se salta RLS => recursión infinita ("stack depth limit
--       exceeded"). En local el migrador es superusuario y la enmascara.
--
-- Fix:
--   (1) Conceder USAGE/EXECUTE de `app` a `authenticated` (idempotente; cubre
--       funciones presentes y futuras vía DEFAULT PRIVILEGES).
--   (2) Reemplazar la política recursiva por una self-based que NO llama
--       current_org(): el usuario lee SOLO su propia fila por auth.uid(). Así
--       current_org()/current_role() resuelven leyendo esa fila propia sin
--       recursión, y el aislamiento por organización se mantiene (deny-by-default;
--       un usuario no ve perfiles de terceros). El listado de miembros de la
--       organización (no requerido en 4B.1) se reintroducirá con un mecanismo
--       no recursivo en una oleada posterior.
--
-- Seguridad: NO se debilita el aislamiento. La política se vuelve MÁS estricta
-- (self-only). RLS sigue FORCE en profiles. Sin service_role en el flujo de app.
--
-- UP

-- (1) Grants de esquema/funciones de identidad al rol authenticated.
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated;
-- Funciones futuras del esquema app creadas por el migrador: execute a authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- (2) Romper la recursión: política self-based en profiles.
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_self_select ON profiles
  FOR SELECT
  USING (id = (SELECT app._auth_uid()));

-- DOWN
-- DROP POLICY IF EXISTS profiles_self_select ON profiles;
-- CREATE POLICY profiles_select ON profiles
--   FOR SELECT USING (organization_id = app.current_org());
-- ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
-- REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM authenticated;
-- REVOKE USAGE ON SCHEMA app FROM authenticated;
