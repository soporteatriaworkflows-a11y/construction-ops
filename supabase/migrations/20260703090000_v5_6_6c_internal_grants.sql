-- Migration: V5_6_6C_INTERNAL_PROJECT_GRANTS (parte 1/2: RPCs + backfill)
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/design-references/V5_6_6C_INTERNAL_PROJECT_GRANTS.md
--           + matriz oficial docs/design-references/V5_6_6_ROLE_MATRIX.md.
--
-- Decisiones aprobadas (2026-07-03): obra y compras pasan a ser roles SCOPED
-- por proyecto (asignacion de admin/gerencia); presupuestos/admin/gerencia
-- siguen allow-all; consulta conserva el scoping V5.6.4/V5.6.5A; se REUTILIZA
-- project_access_grants (sin modelo paralelo).
--
-- Esta migracion SOLO generaliza las RPCs de gestion y hace el backfill de
-- continuidad operativa. El enforcement RLS va en la parte 2/2.
--
-- TODO ADITIVO/IDEMPOTENTE: CREATE OR REPLACE de las 2 funciones existentes
-- (mismo nombre/firma; unico cambio de negocio: el destinatario puede ser
-- consulta, obra o compras) + backfill INSERT ... ON CONFLICT DO NOTHING.
-- Sin DDL de tablas, sin DELETE, sin cambio de tipos, sin tocar RLS aqui.
-- Solo local/en rama (sin db push remoto; compuerta V5_6_6C_DB_APPLY_GATE).
--
-- Semantica (deny-by-default):
--   * Grants validos para roles SCOPED: consulta, obra, compras. Los roles
--     allow-all (admin, gerencia, presupuestos) NO usan esta tabla y la RPC
--     rechaza asignarles proyectos (grants_only_for_scoped_roles).
--   * obra/compras EXISTENTES reciben backfill a los proyectos actuales de su
--     organizacion (continuidad: no pierden visibilidad al activar la parte
--     2/2). granted_by NULL = sistema; auditado con metadata.backfill=true y
--     metadata.phase='v5_6_6c' (distinguible del backfill V5.6.4).
--   * obra/compras NUEVOS nacen con 0 grants (asignacion explicita).
--
-- UP

-- ===========================================================================
-- 1) grant_project_access — destino generalizado a roles scoped.
--    Identico a V5.6.4 salvo el check de rol destino y su errcode.
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
  -- V5.6.6C: los grants aplican a los roles SCOPED (consulta, obra, compras).
  -- admin/gerencia/presupuestos son allow-all: asignarles proyectos seria un
  -- no-op enganoso y se rechaza explicitamente.
  IF v_target.role NOT IN ('consulta','obra','compras') THEN
    RAISE EXCEPTION 'grants_only_for_scoped_roles' USING errcode = 'P0001';
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

-- revoke_project_access NO cambia (retirar un grant es valido para cualquier
-- fila existente; el gate admin/gerencia ya esta dentro). Se conserva la
-- definicion V5.6.4 tal cual.

-- ===========================================================================
-- 2) BACKFILL UNICO de continuidad — obra/compras existentes conservan la
--    visibilidad actual (todos los proyectos de su organizacion HOY). Nuevos
--    usuarios de esos roles nacen con 0 grants. En una base recien creada
--    (harness local: migraciones antes que seeds) este bloque es no-op.
-- ===========================================================================

INSERT INTO project_access_grants (organization_id, profile_id, project_id, granted_by)
SELECT p.organization_id, p.id, pr.id, NULL
FROM public.profiles p
JOIN public.projects pr ON pr.organization_id = p.organization_id
WHERE p.role IN ('obra','compras')
ON CONFLICT (profile_id, project_id) DO NOTHING;

-- Auditoria del backfill: SOLO las filas creadas por ESTE bloque (granted_by
-- NULL de perfiles obra/compras que aun no tienen entrada de auditoria).
INSERT INTO access_audit_log (organization_id, actor_user_id, action, target_user_id, metadata)
SELECT g.organization_id, NULL, 'project_grant_created', g.profile_id,
       jsonb_build_object('projectId', g.project_id, 'grantId', g.id,
                          'backfill', true, 'phase', 'v5_6_6c')
FROM project_access_grants g
JOIN public.profiles p ON p.id = g.profile_id
WHERE g.granted_by IS NULL
  AND p.role IN ('obra','compras')
  AND NOT EXISTS (
    SELECT 1 FROM access_audit_log a
    WHERE a.action = 'project_grant_created'
      AND a.target_user_id = g.profile_id
      AND a.metadata ->> 'grantId' = g.id::text
  );

-- DOWN
-- Restaurar grant_project_access con el check V5.6.4 (destino solo consulta,
-- errcode grants_only_for_consulta; ver 20260702090000). Borrar el backfill:
--   DELETE FROM project_access_grants g USING profiles p
--   WHERE p.id = g.profile_id AND g.granted_by IS NULL AND p.role IN ('obra','compras');
