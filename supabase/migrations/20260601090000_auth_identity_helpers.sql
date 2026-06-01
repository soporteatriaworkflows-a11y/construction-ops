-- Migration: helpers de IDENTIDAD REAL para RLS por auth.uid()
-- Agent: agent-db-rls — microfase 4A.1 (AUTH_CONTRACT v1, congelado).
--
-- Objetivo:
--   Hacer que app.current_org() y app.current_role() resuelvan la identidad
--   REAL (sesión de Supabase) desde auth.uid() -> profiles, MANTENIENDO la
--   compatibilidad con el harness demo basado en claims JWT custom
--   (organization_id / user_role). Patrón: COALESCE(claim_jwt, lookup_por_uid).
--
-- Deny-by-default:
--   * Si NO hay claim de organización NI auth.uid() con profile => NULL.
--     Toda política RLS compara `... = app.current_org()`; con NULL la
--     comparación es UNKNOWN y la fila NO se expone. Igual para el rol.
--   * Usuario sin sesión (sin request.jwt.claims y sin auth.uid()) => NULL.
--   * Usuario autenticado SIN membresía (auth.uid() sin fila en profiles) =>
--     NULL (no ve ni puede escribir nada).
--
-- Recursión RLS (importante):
--   current_org()/current_role() se invocan DENTRO de las políticas de
--   `profiles` (USING organization_id = app.current_org()). Si el lookup por
--   auth.uid() leyera `profiles` bajo RLS, dispararía de nuevo la política y
--   entraría en recursión infinita. Para evitarlo, el lookup se aísla en una
--   función SECURITY DEFINER, propiedad del rol migrador (postgres, BYPASSRLS),
--   con search_path fijado. Así puede leer la fila del propio usuario sin
--   evaluar RLS y sin abrir un hueco: SOLO devuelve datos de la fila cuyo
--   id = p_uid (el propio usuario), nunca de terceros.
--
-- auth.uid():
--   En el stack Supabase real existe la función auth.uid() (lee el claim 'sub').
--   En un Postgres puro (sin esquema auth) no existe; el wrapper detecta su
--   presencia y, si falta, cae al claim 'sub' del JWT (modo demo del harness).
--
-- UP

-- ---------------------------------------------------------------------------
-- app._jwt_claims(): claims del JWT como jsonb, o NULL de forma SEGURA.
--   request.jwt.claims puede estar ausente, vacío ('') o malformado (sin
--   sesión). El cast ::jsonb directo sobre '' lanza 22P02. Este helper lo
--   neutraliza: NULL en todos esos casos (deny-by-default). Devuelve jsonb solo
--   cuando hay un objeto JSON válido.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app._jwt_claims()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := NULLIF(current_setting('request.jwt.claims', true), '');
  IF v_raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_raw::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL; -- claims malformados => deny-by-default.
END;
$$;

-- ---------------------------------------------------------------------------
-- app._auth_uid(): id del usuario autenticado de forma segura.
--   * Prefiere auth.uid() (Supabase real) si el esquema auth existe.
--   * Si no, o si auth.uid() es NULL, cae al claim 'sub' del JWT (compat
--     harness / Postgres puro).
--   * NULL si no hay ninguno (deny-by-default).
-- STABLE + SECURITY INVOKER (por defecto): no necesita privilegios elevados.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app._auth_uid()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_uid uuid;
BEGIN
  -- Esquema auth presente (Supabase): usa la función oficial auth.uid().
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    BEGIN
      EXECUTE 'SELECT auth.uid()' INTO v_uid;
    EXCEPTION WHEN others THEN
      v_uid := NULL;
    END;
    IF v_uid IS NOT NULL THEN
      RETURN v_uid;
    END IF;
  END IF;

  -- Fallback: claim 'sub' del JWT (modo demo del harness / Postgres puro).
  BEGIN
    RETURN NULLIF(app._jwt_claims() ->> 'sub', '')::uuid;
  EXCEPTION WHEN others THEN
    -- 'sub' ausente o no-uuid => deny-by-default.
    RETURN NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- app._profile_org(p_uid): organización del profile del usuario dado.
-- SECURITY DEFINER (propiedad del migrador con BYPASSRLS) para leer profiles
-- SIN disparar RLS y evitar recursión. SOLO devuelve la fila id = p_uid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app._profile_org(p_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM public.profiles WHERE id = p_uid;
$$;

-- ---------------------------------------------------------------------------
-- app._profile_role(p_uid): rol (profiles.role) del usuario dado.
-- Mismo aislamiento SECURITY DEFINER que _profile_org.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app._profile_role(p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = p_uid;
$$;

-- ---------------------------------------------------------------------------
-- app.current_org(): organización efectiva del usuario.
--   COALESCE( claim_jwt.organization_id , profiles.organization_id por uid ).
--   * Modo demo/harness: el claim manda (compat 32/32 previos).
--   * Modo real: sin claim de org, resuelve por auth.uid() -> profiles.
--   * NULL si no hay claim ni membresía (deny-by-default).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_org()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(app._jwt_claims() ->> 'organization_id', '')::uuid,
    app._profile_org(app._auth_uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- app.current_role(): rol efectivo del usuario.
--   COALESCE( claim_jwt.user_role , profiles.role por uid ).
--   * NULL si no hay claim ni membresía (deny-by-default).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(app._jwt_claims() ->> 'user_role', ''),
    app._profile_role(app._auth_uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- app.current_org_user(): id del usuario autenticado (reutilizado por las
-- políticas de profiles). Se alinea con app._auth_uid() (auth.uid() o claim
-- 'sub'). Antes solo leía el claim 'sub'; ahora también resuelve auth.uid().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_org_user()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT app._auth_uid();
$$;

-- Permisos de ejecución: el rol authenticated debe poder llamar a los helpers.
-- (Las SECURITY DEFINER se ejecutan con privilegios del owner, no de quien
--  llama; GRANT EXECUTE solo habilita la invocación.)
GRANT EXECUTE ON FUNCTION app._jwt_claims() TO authenticated;
GRANT EXECUTE ON FUNCTION app._auth_uid() TO authenticated;
GRANT EXECUTE ON FUNCTION app._profile_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app._profile_role(uuid) TO authenticated;

-- DOWN
-- Revertir a la versión previa de los helpers (migraciones 090000 / 091000):
--   CREATE OR REPLACE FUNCTION app.current_org() ... (solo claim organization_id)
--   CREATE OR REPLACE FUNCTION app.current_role() ... (solo claim user_role)
--   CREATE OR REPLACE FUNCTION app.current_org_user() ... (solo claim 'sub')
--   DROP FUNCTION IF EXISTS app._profile_role(uuid);
--   DROP FUNCTION IF EXISTS app._profile_org(uuid);
--   DROP FUNCTION IF EXISTS app._auth_uid();
