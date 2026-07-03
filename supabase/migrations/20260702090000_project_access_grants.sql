-- Migration: V5_6_4_CLIENT_PROJECT_SCOPE — asignación de proyectos a usuarios
--            `consulta` (ViewerRole client): tabla de grants, RPCs de gestión,
--            auditoría y backfill de consultas existentes.
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/design-references/V5_6_4_CLIENT_PROJECT_SCOPE.md §4-§6,§8.
--
-- TODO ADITIVO: tabla nueva + funciones nuevas + ampliación del CHECK de
-- acciones de auditoría (DROP+ADD del MISMO constraint, superconjunto estricto
-- de valores: ninguna fila existente queda inválida). Sin DROP de tablas, sin
-- DELETE, sin TRUNCATE, sin cambio de tipos. NO toca profiles ni projects.
-- Solo local/en rama (sin db push remoto; compuerta V5_6_4_DB_APPLY_GATE).
--
-- Semántica (deny-by-default):
--   * Los grants SOLO aplican a usuarios con rol `consulta` (ViewerRole
--     client). `consulta` sin filas aquí = 0 proyectos visibles.
--   * Roles internos NO usan esta tabla (acceso org-wide como hoy).
--   * Revocar = DELETE físico; la historia queda en access_audit_log
--     (append-only), patrón OPERATIONAL_ACCESS_LAYER_V1.
--   * Backfill ÚNICO al final: cada `consulta` existente recibe grants a los
--     proyectos actuales de su organización (no pierde visibilidad al activar
--     el enforcement). Consultas creadas después nacen con 0 grants.
--
-- UP

-- ===========================================================================
-- 1) project_access_grants — proyectos asignados a un usuario consulta.
-- ===========================================================================

CREATE TABLE project_access_grants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  profile_id       uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- NULL = otorgado por el sistema (backfill de migración), nunca por la app.
  granted_by       uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_access_grants_profile_project_uq UNIQUE (profile_id, project_id)
);

CREATE INDEX project_access_grants_org_idx ON project_access_grants (organization_id);
CREATE INDEX project_access_grants_profile_idx ON project_access_grants (profile_id);
CREATE INDEX project_access_grants_project_idx ON project_access_grants (project_id);

-- ===========================================================================
-- 2) Auditoría: ampliar el catálogo de acciones (superconjunto estricto).
-- ===========================================================================

ALTER TABLE access_audit_log DROP CONSTRAINT access_audit_action_valid;
ALTER TABLE access_audit_log ADD CONSTRAINT access_audit_action_valid CHECK (
  action IN ('invite_created','invite_resent','invite_revoked',
             'invite_accepted','role_changed',
             'project_grant_created','project_grant_revoked')
);

-- ===========================================================================
-- 3a) public.grant_project_access — asigna un proyecto a un usuario consulta.
--     org/actor/rol SIEMPRE server-side; solo admin/gerencia; el destinatario
--     DEBE tener rol `consulta` (decisión de negocio V5.6.4); proyecto y
--     usuario de la MISMA organización del actor. Idempotente por
--     (profile_id, project_id): repetir devuelve status=already_granted sin
--     duplicar auditoría.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.grant_project_access(
  p_target_user_id uuid,
  p_project_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid      uuid := app._auth_uid();
  v_org      uuid := app.current_org();
  v_role     text := app.current_role();
  v_target   record;
  v_project  record;
  v_grant_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  SELECT id, organization_id, role INTO v_target
  FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND OR v_target.organization_id <> v_org THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;
  -- Fase V5.6.4: los grants solo tienen sentido para consulta (ViewerRole
  -- client). Roles internos ya ven todos los proyectos de su organización.
  IF v_target.role <> 'consulta' THEN
    RAISE EXCEPTION 'grants_only_for_consulta' USING errcode = 'P0001';
  END IF;

  SELECT id, organization_id INTO v_project
  FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR v_project.organization_id <> v_org THEN
    RAISE EXCEPTION 'project_not_found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.project_access_grants (
    organization_id, profile_id, project_id, granted_by
  ) VALUES (v_org, p_target_user_id, p_project_id, v_uid)
  ON CONFLICT (profile_id, project_id) DO NOTHING
  RETURNING id INTO v_grant_id;

  IF v_grant_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_granted',
      'userId', p_target_user_id,
      'projectId', p_project_id
    );
  END IF;

  INSERT INTO public.access_audit_log (
    organization_id, actor_user_id, action, target_user_id, metadata
  ) VALUES (
    v_org, v_uid, 'project_grant_created', p_target_user_id,
    jsonb_build_object('projectId', p_project_id, 'grantId', v_grant_id)
  );

  RETURN jsonb_build_object(
    'status', 'granted',
    'grantId', v_grant_id,
    'userId', p_target_user_id,
    'projectId', p_project_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_project_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_project_access(uuid, uuid) TO authenticated;

-- ===========================================================================
-- 3b) public.revoke_project_access — retira un proyecto asignado.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.revoke_project_access(
  p_target_user_id uuid,
  p_project_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_uid      uuid := app._auth_uid();
  v_org      uuid := app.current_org();
  v_role     text := app.current_role();
  v_grant_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  DELETE FROM public.project_access_grants
  WHERE profile_id = p_target_user_id
    AND project_id = p_project_id
    AND organization_id = v_org
  RETURNING id INTO v_grant_id;

  IF v_grant_id IS NULL THEN
    RAISE EXCEPTION 'grant_not_found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.access_audit_log (
    organization_id, actor_user_id, action, target_user_id, metadata
  ) VALUES (
    v_org, v_uid, 'project_grant_revoked', p_target_user_id,
    jsonb_build_object('projectId', p_project_id, 'grantId', v_grant_id)
  );

  RETURN jsonb_build_object(
    'status', 'revoked',
    'userId', p_target_user_id,
    'projectId', p_project_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_project_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_project_access(uuid, uuid) TO authenticated;

-- ===========================================================================
-- 4) BACKFILL ÚNICO — consultas existentes conservan visibilidad: un grant
--    por (consulta, proyecto de su organización) al momento de la migración.
--    granted_by NULL = sistema. Auditado con metadata.backfill = true.
--    En una base recién creada (harness local: migraciones antes que seeds)
--    este bloque es no-op. NUNCA se re-ejecuta desde código de aplicación.
-- ===========================================================================

INSERT INTO project_access_grants (organization_id, profile_id, project_id, granted_by)
SELECT p.organization_id, p.id, pr.id, NULL
FROM public.profiles p
JOIN public.projects pr ON pr.organization_id = p.organization_id
WHERE p.role = 'consulta'
ON CONFLICT (profile_id, project_id) DO NOTHING;

INSERT INTO access_audit_log (organization_id, actor_user_id, action, target_user_id, metadata)
SELECT g.organization_id, NULL, 'project_grant_created', g.profile_id,
       jsonb_build_object('projectId', g.project_id, 'grantId', g.id, 'backfill', true)
FROM project_access_grants g
WHERE g.granted_by IS NULL;

-- DOWN
-- DELETE FROM access_audit_log WHERE action IN ('project_grant_created','project_grant_revoked');
-- DROP FUNCTION IF EXISTS public.revoke_project_access(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.grant_project_access(uuid, uuid);
-- ALTER TABLE access_audit_log DROP CONSTRAINT access_audit_action_valid;
-- ALTER TABLE access_audit_log ADD CONSTRAINT access_audit_action_valid CHECK (
--   action IN ('invite_created','invite_resent','invite_revoked','invite_accepted','role_changed'));
-- DROP TABLE IF EXISTS project_access_grants;
