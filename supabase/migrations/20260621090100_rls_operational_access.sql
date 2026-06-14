-- Migration: RLS — OPERATIONAL_ACCESS_LAYER_V1
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §8.
--
-- ENABLE + FORCE en las tablas nuevas. Lectura tenant-scoped por
-- app.current_org(). Las ESCRITURAS pasan EXCLUSIVAMENTE por las RPCs
-- SECURITY DEFINER (create/resend/revoke/accept_invitation, change_member_role)
-- — NO se exponen políticas de escritura directa a roles de usuario.
-- Las RPCs validan org + actor + rol server-side y aplican anti-escalamiento.
--
-- profiles: se MANTIENE `profiles_self_select` (anti-recursión 4B.1). El listado
-- de miembros para la UI se sirve por el read-model (drizzle/fixture), igual que
-- el resto de listados; no se reintroduce un SELECT org-wide recursivo aquí.
--
-- UP

-- organization_invitations --------------------------------------------------
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations FORCE ROW LEVEL SECURITY;

-- SELECT: miembros de la organización ven sus invitaciones. (La UI lista vía
-- read-model; esta política habilita además lecturas RLS-bound puntuales.)
CREATE POLICY organization_invitations_select ON organization_invitations
  FOR SELECT
  USING (organization_id = app.current_org());
-- Sin INSERT/UPDATE/DELETE directos: las mutaciones van por RPC SECURITY DEFINER.

-- access_audit_log ----------------------------------------------------------
ALTER TABLE access_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_audit_log FORCE ROW LEVEL SECURITY;

-- SELECT: solo gestión (admin/gerencia) ve la bitácora de su organización.
CREATE POLICY access_audit_log_select ON access_audit_log
  FOR SELECT
  USING (
    organization_id = app.current_org()
    AND app.current_role() IN ('admin','gerencia')
  );
-- Sin INSERT/UPDATE/DELETE directos: append-only vía RPC SECURITY DEFINER.

-- DOWN
-- DROP POLICY IF EXISTS access_audit_log_select ON access_audit_log;
-- ALTER TABLE access_audit_log NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE access_audit_log DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS organization_invitations_select ON organization_invitations;
-- ALTER TABLE organization_invitations NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;
