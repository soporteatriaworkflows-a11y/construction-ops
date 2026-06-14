-- Migration: OPERATIONAL_ACCESS_LAYER_V1 — invitaciones, auditoría de acceso,
--            listado de miembros no recursivo y RPCs de gestión de usuarios.
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §1-3,§7-9.
--
-- TODO ADITIVO: tablas nuevas + funciones nuevas. Sin DROP, sin DELETE, sin
-- TRUNCATE, sin cambio de tipos, sin backfill destructivo. NO toca profiles ni
-- usuarios productivos existentes. Retrocompatible. Solo local (sin db push remoto).
--
-- Habilita:
--   1) organization_invitations: invitar usuarios (token hasheado, expiración,
--      estado, autoría, revocación, aceptación).
--   2) access_audit_log: bitácora mínima de acceso (sin tokens ni contraseñas).
--   3) RPCs SECURITY DEFINER: crear / reenviar / revocar / aceptar invitación y
--      cambiar rol, con org + actor + rol SIEMPRE server-side y anti-escalamiento.
--      El LISTADO de miembros/invitaciones para la UI va por el read-model
--      (drizzle/fixture), igual que el resto de listados de la app — NO se
--      reintroduce el SELECT org-wide recursivo en profiles.
--
-- UP

-- ===========================================================================
-- 1) organization_invitations — invitaciones de la organización.
--    token_hash = SHA-256 del token (NUNCA el token plano).
-- ===========================================================================

CREATE TABLE organization_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  email            text NOT NULL,
  full_name        text,
  role             text NOT NULL,
  token_hash       text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending',
  message          text,
  invited_by       uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  expires_at       timestamptz NOT NULL,
  accepted_at      timestamptz,
  accepted_by      uuid,
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_invitations_email_not_empty CHECK (length(trim(email)) > 0),
  CONSTRAINT org_invitations_role_valid
    CHECK (role IN ('admin','gerencia','presupuestos','obra','compras','consulta')),
  CONSTRAINT org_invitations_status_valid
    CHECK (status IN ('pending','accepted','revoked','expired'))
);

CREATE INDEX org_invitations_org_idx
  ON organization_invitations (organization_id, status, created_at DESC);
-- Una sola invitación PENDIENTE por (org, email) — reenviar rota token/expiración.
CREATE UNIQUE INDEX org_invitations_pending_email_uq
  ON organization_invitations (organization_id, lower(email))
  WHERE status = 'pending';

CREATE TRIGGER organization_invitations_set_updated_at
  BEFORE UPDATE ON organization_invitations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ===========================================================================
-- 2) access_audit_log — bitácora mínima de acceso (append-only). NUNCA tokens
--    ni contraseñas. Inmutable: la RLS no concede UPDATE/DELETE.
-- ===========================================================================

CREATE TABLE access_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  actor_user_id    uuid,
  action           text NOT NULL,
  target_email     text,
  target_user_id   uuid,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_audit_action_valid CHECK (
    action IN ('invite_created','invite_resent','invite_revoked',
               'invite_accepted','role_changed')
  )
);

CREATE INDEX access_audit_log_org_created_idx
  ON access_audit_log (organization_id, created_at DESC);

-- ===========================================================================
-- 3a) public.create_invitation — crea una invitación pendiente.
--     org/actor/rol SIEMPRE server-side. gerencia NO puede invitar como admin.
--     Rechaza si el email ya es miembro activo o ya tiene invitación pendiente.
--     Recibe el HASH del token (el plano se genera y se envía en la app).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_email       text,
  p_role        text,
  p_token_hash  text,
  p_full_name   text DEFAULT NULL,
  p_message     text DEFAULT NULL,
  p_ttl_hours   integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app._auth_uid();
  v_org     uuid := app.current_org();
  v_role    text := app.current_role();
  v_email   text := lower(trim(p_email));
  v_inv_id  uuid;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF v_email IS NULL OR length(v_email) = 0 THEN
    RAISE EXCEPTION 'invalid_email' USING errcode = 'P0001';
  END IF;
  IF p_role NOT IN ('admin','gerencia','presupuestos','obra','compras','consulta') THEN
    RAISE EXCEPTION 'invalid_role' USING errcode = 'P0001';
  END IF;
  -- Anti-escalamiento: solo un admin puede crear/asignar admin.
  IF p_role = 'admin' AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'cannot_grant_admin' USING errcode = '42501';
  END IF;
  IF p_token_hash IS NULL OR length(p_token_hash) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING errcode = 'P0001';
  END IF;

  -- ¿Ya es miembro activo?
  PERFORM 1 FROM public.profiles
  WHERE organization_id = v_org AND lower(email) = v_email;
  IF FOUND THEN
    RAISE EXCEPTION 'already_member' USING errcode = 'P0001';
  END IF;

  -- ¿Ya hay invitación pendiente? (el índice parcial también lo garantiza)
  PERFORM 1 FROM public.organization_invitations
  WHERE organization_id = v_org AND lower(email) = v_email AND status = 'pending';
  IF FOUND THEN
    RAISE EXCEPTION 'already_invited' USING errcode = 'P0001';
  END IF;

  v_expires := now() + make_interval(hours => GREATEST(COALESCE(p_ttl_hours, 168), 1));

  INSERT INTO public.organization_invitations (
    organization_id, email, full_name, role, token_hash, status,
    message, invited_by, expires_at
  ) VALUES (
    v_org, v_email, NULLIF(trim(p_full_name), ''), p_role, p_token_hash, 'pending',
    NULLIF(trim(p_message), ''), v_uid, v_expires
  )
  RETURNING id INTO v_inv_id;

  INSERT INTO public.access_audit_log (
    organization_id, actor_user_id, action, target_email, metadata
  ) VALUES (
    v_org, v_uid, 'invite_created', v_email,
    jsonb_build_object('invitationId', v_inv_id, 'role', p_role)
  );

  RETURN jsonb_build_object(
    'invitationId', v_inv_id,
    'email', v_email,
    'role', p_role,
    'expiresAt', v_expires,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invitation(text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(text, text, text, text, text, integer) TO authenticated;

-- ===========================================================================
-- 3b) public.resend_invitation — rota token + expiración de una invitación
--     pendiente (o reactiva una vencida). Mismo guard de gestión.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.resend_invitation(
  p_invitation_id uuid,
  p_token_hash    text,
  p_ttl_hours     integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid     uuid := app._auth_uid();
  v_org     uuid := app.current_org();
  v_role    text := app.current_role();
  v_inv     record;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF p_token_hash IS NULL OR length(p_token_hash) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_inv FROM public.organization_invitations
  WHERE id = p_invitation_id AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING errcode = 'P0002';
  END IF;
  IF v_inv.status NOT IN ('pending','expired') THEN
    RAISE EXCEPTION 'invitation_not_resendable' USING errcode = 'P0001';
  END IF;
  IF v_inv.role = 'admin' AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'cannot_grant_admin' USING errcode = '42501';
  END IF;

  v_expires := now() + make_interval(hours => GREATEST(COALESCE(p_ttl_hours, 168), 1));

  UPDATE public.organization_invitations
  SET token_hash = p_token_hash,
      status     = 'pending',
      expires_at = v_expires,
      revoked_at = NULL,
      revoked_by = NULL
  WHERE id = p_invitation_id;

  INSERT INTO public.access_audit_log (
    organization_id, actor_user_id, action, target_email, metadata
  ) VALUES (
    v_org, v_uid, 'invite_resent', v_inv.email,
    jsonb_build_object('invitationId', p_invitation_id)
  );

  RETURN jsonb_build_object(
    'invitationId', p_invitation_id,
    'email', v_inv.email,
    'expiresAt', v_expires,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resend_invitation(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_invitation(uuid, text, integer) TO authenticated;

-- ===========================================================================
-- 3c) public.revoke_invitation — revoca una invitación pendiente.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.revoke_invitation(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid  uuid := app._auth_uid();
  v_org  uuid := app.current_org();
  v_role text := app.current_role();
  v_inv  record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.organization_invitations
  WHERE id = p_invitation_id AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING errcode = 'P0002';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation_not_pending' USING errcode = 'P0001';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'revoked', revoked_at = now(), revoked_by = v_uid
  WHERE id = p_invitation_id;

  INSERT INTO public.access_audit_log (
    organization_id, actor_user_id, action, target_email, metadata
  ) VALUES (
    v_org, v_uid, 'invite_revoked', v_inv.email,
    jsonb_build_object('invitationId', p_invitation_id)
  );

  RETURN jsonb_build_object('invitationId', p_invitation_id, 'status', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;

-- ===========================================================================
-- 3d) public.peek_invitation — lee una invitación por HASH de token (lado del
--     invitado, que aún NO tiene organización). SECURITY DEFINER, solo devuelve
--     metadatos NO sensibles (NUNCA el token), y solo si está vigente.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.peek_invitation(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_inv  record;
  v_org_name text;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) < 16 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_inv FROM public.organization_invitations
  WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF v_inv.status = 'revoked' THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;
  IF v_inv.status = 'accepted' THEN
    RETURN jsonb_build_object('status', 'accepted');
  END IF;
  IF v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_inv.organization_id;

  RETURN jsonb_build_object(
    'status', 'pending',
    'email', v_inv.email,
    'fullName', v_inv.full_name,
    'role', v_inv.role,
    'organizationName', v_org_name,
    'expiresAt', v_inv.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.peek_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_invitation(text) TO anon, authenticated;

-- ===========================================================================
-- 3e) public.accept_invitation — el invitado (ya autenticado: auth.uid presente)
--     acepta. Verifica token vigente + email coincidente, crea su profile y
--     marca la invitación aceptada (un solo uso). SECURITY DEFINER porque el
--     invitado aún no tiene organización (RLS lo bloquearía).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token_hash text,
  p_email      text,
  p_full_name  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid    uuid := app._auth_uid();
  v_email  text := lower(trim(p_email));
  v_inv    record;
  v_name   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_session' USING errcode = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.organization_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_invalid' USING errcode = 'P0002';
  END IF;
  IF v_inv.status = 'revoked' THEN
    RAISE EXCEPTION 'invitation_revoked' USING errcode = 'P0001';
  END IF;
  IF v_inv.status = 'accepted' THEN
    RAISE EXCEPTION 'invitation_used' USING errcode = 'P0001';
  END IF;
  IF v_inv.status <> 'pending' OR v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired' USING errcode = 'P0001';
  END IF;
  -- Email del invitado debe coincidir con el de la invitación.
  IF v_email IS NULL OR v_email <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'email_mismatch' USING errcode = '42501';
  END IF;

  -- ¿Ya tiene profile? (no se duplica membresía)
  PERFORM 1 FROM public.profiles WHERE id = v_uid;
  IF FOUND THEN
    RAISE EXCEPTION 'already_member' USING errcode = 'P0001';
  END IF;

  v_name := COALESCE(NULLIF(trim(p_full_name), ''), v_inv.full_name, split_part(v_inv.email, '@', 1));

  INSERT INTO public.profiles (id, organization_id, full_name, email, role)
  VALUES (v_uid, v_inv.organization_id, v_name, v_inv.email, v_inv.role);

  UPDATE public.organization_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = v_uid
  WHERE id = v_inv.id;

  INSERT INTO public.access_audit_log (
    organization_id, actor_user_id, action, target_email, target_user_id, metadata
  ) VALUES (
    v_inv.organization_id, v_uid, 'invite_accepted', v_inv.email, v_uid,
    jsonb_build_object('invitationId', v_inv.id, 'role', v_inv.role)
  );

  RETURN jsonb_build_object(
    'organizationId', v_inv.organization_id,
    'role', v_inv.role,
    'status', 'accepted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, text, text) TO authenticated;

-- ===========================================================================
-- 3f) public.change_member_role — cambia el rol de OTRO miembro de la org.
--     Anti-escalamiento: nadie cambia su propio rol; gerencia no asigna 'admin'
--     ni modifica a un admin; solo admin gestiona admins.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.change_member_role(
  p_target_user_id uuid,
  p_new_role       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid       uuid := app._auth_uid();
  v_org       uuid := app.current_org();
  v_role      text := app.current_role();
  v_target    record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF p_new_role NOT IN ('admin','gerencia','presupuestos','obra','compras','consulta') THEN
    RAISE EXCEPTION 'invalid_role' USING errcode = 'P0001';
  END IF;
  -- Nadie cambia su propio rol (no auto-escalamiento ni auto-degradación).
  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_change_self' USING errcode = '42501';
  END IF;

  SELECT id, organization_id, role INTO v_target
  FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND OR v_target.organization_id <> v_org THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;

  -- gerencia no puede asignar admin ni tocar a un admin existente.
  IF v_role = 'gerencia' AND (p_new_role = 'admin' OR v_target.role = 'admin') THEN
    RAISE EXCEPTION 'cannot_manage_admin' USING errcode = '42501';
  END IF;

  UPDATE public.profiles SET role = p_new_role WHERE id = p_target_user_id;

  INSERT INTO public.access_audit_log (
    organization_id, actor_user_id, action, target_user_id, metadata
  ) VALUES (
    v_org, v_uid, 'role_changed', p_target_user_id,
    jsonb_build_object('from', v_target.role, 'to', p_new_role)
  );

  RETURN jsonb_build_object(
    'userId', p_target_user_id,
    'role', p_new_role,
    'status', 'updated'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, text) TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.change_member_role(uuid, text);
-- DROP FUNCTION IF EXISTS public.accept_invitation(text, text, text);
-- DROP FUNCTION IF EXISTS public.peek_invitation(text);
-- DROP FUNCTION IF EXISTS public.revoke_invitation(uuid);
-- DROP FUNCTION IF EXISTS public.resend_invitation(uuid, text, integer);
-- DROP FUNCTION IF EXISTS public.create_invitation(text, text, text, text, text, integer);
-- DROP TABLE IF EXISTS access_audit_log;
-- DROP TABLE IF EXISTS organization_invitations;
