-- Migration: estimates authorship + creación atómica estimate+V01 (Oleada 4B.3)
-- Agent: agent-db-rls (autorado por el orquestador, integración 4B.3).
-- Contrato: docs/ESTIMATES_CRUD_CONTRACT.md §2,§6.
--
-- Parte 1 (aditiva, reversible): `estimates` += description + created_by (FK profiles).
-- Parte 2: función RPC que crea estimate + versión inicial V01 de forma ATÓMICA.
--
-- SEGURIDAD (ajuste obligatorio):
--   * La RPC NO acepta `p_created_by`. El autor se DERIVA internamente del helper
--     canónico de identidad `app._auth_uid()` (= auth.uid() ⇒ profiles.id por el FK
--     profiles_id_auth_users_fk). Imposible suplantar autor desde el cliente.
--   * SECURITY INVOKER: corre como `authenticated`; las RLS `WITH CHECK` de
--     `estimates` y `estimate_versions` (aislamiento por organización vía
--     scope→project) aplican a AMBOS INSERT. Un scope cross-org ⇒ INSERT rechazado
--     ⇒ toda la transacción se revierte.
--   * Deny-by-default explícito: sin sesión (`_auth_uid()` NULL) o sin membresía
--     (`current_org()` NULL) ⇒ excepción antes de escribir.
--   * Hardening: `SET search_path = public`; referencias calificadas
--     `public.*`/`app.*`; `REVOKE ALL ... FROM PUBLIC`; `GRANT EXECUTE ... TO
--     authenticated` (NO a `anon`); sin service-role; sin SECURITY DEFINER.
--   * Anti-colisión de `code`: el INSERT de estimate puede lanzar 23505 sobre
--     (project_scope_id, code) ⇒ la transacción se revierte y la app reintenta con
--     el siguiente candidato.
--
-- UP

ALTER TABLE public.estimates
  ADD COLUMN description text,
  ADD COLUMN created_by  uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX estimates_created_by_idx ON public.estimates (created_by);

CREATE OR REPLACE FUNCTION public.create_estimate_with_initial_version(
  p_scope_id   uuid,
  p_code       text,
  p_name       text,
  p_description text
)
RETURNS public.estimates
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := app._auth_uid();
  v_org      uuid := app.current_org();
  v_estimate public.estimates;
BEGIN
  -- Deny-by-default: sesión + membresía obligatorias.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_session' USING errcode = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no_membership' USING errcode = '42501';
  END IF;

  -- INSERT 1: estimate (created_by DERIVADO, status de trabajo 'active').
  -- RLS estimates_all (WITH CHECK) exige que el scope pertenezca a current_org().
  INSERT INTO public.estimates
    (project_scope_id, code, name, status, description, created_by)
  VALUES
    (p_scope_id, p_code, p_name, 'active', p_description, v_uid)
  RETURNING * INTO v_estimate;

  -- INSERT 2: versión inicial V01 (mismo created_by derivado).
  INSERT INTO public.estimate_versions
    (estimate_id, version_number, status, created_by)
  VALUES
    (v_estimate.id, 1, 'draft', v_uid);

  RETURN v_estimate;
END;
$$;

-- Endurecimiento de permisos: Supabase concede EXECUTE por DEFAULT PRIVILEGES en
-- `public` a anon/authenticated/service_role. REVOKE FROM PUBLIC NO elimina esos
-- grants por-rol, así que se revoca explícitamente de PUBLIC y de `anon`, y se
-- concede SOLO a `authenticated`. (No se toca `service_role`: rol de plataforma
-- nunca expuesto al navegador; la app jamás usa la service-role key.)
REVOKE ALL ON FUNCTION
  public.create_estimate_with_initial_version(uuid, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.create_estimate_with_initial_version(uuid, text, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION
  public.create_estimate_with_initial_version(uuid, text, text, text)
  TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.create_estimate_with_initial_version(uuid, text, text, text);
-- DROP INDEX IF EXISTS estimates_created_by_idx;
-- ALTER TABLE public.estimates DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE public.estimates DROP COLUMN IF EXISTS description;
