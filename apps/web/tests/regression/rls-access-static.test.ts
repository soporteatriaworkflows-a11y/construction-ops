/**
 * rls-access-static.test.ts — Validación ESTÁTICA de OPERATIONAL_ACCESS_LAYER_V1.
 *
 * No se conecta a base de datos: parsea las migraciones 20260621090000 y
 * 20260621090100 para verificar invariantes de schema, RLS (ENABLE+FORCE,
 * sin escrituras directas), RPCs SECURITY DEFINER con guards de org/rol y
 * anti-escalamiento, token hasheado (no plano) y ausencia de DROP/DELETE.
 * El comportamiento runtime se valida con el harness RLS local (cubierto
 * manualmente en esta entrega; ver QA_REPORT). FASE 9: 2,3,9,10,13.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

function readMigration(suffix: string): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith(suffix));
  if (!file) throw new Error(`No se encontró la migración *${suffix}`);
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

const baseSql = readMigration('090000_operational_access.sql');
const rlsSql = readMigration('_rls_operational_access.sql');
const activeBase = baseSql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('schema de invitaciones (13: token hasheado)', () => {
  it('organization_invitations guarda token_hash (no el token plano)', () => {
    expect(activeBase).toMatch(/CREATE TABLE organization_invitations/i);
    expect(activeBase).toMatch(/token_hash\s+text NOT NULL UNIQUE/i);
    // No existe una columna de token en claro.
    expect(activeBase).not.toMatch(/\btoken\s+text\b/i);
  });
  it('CHECK de rol y estado acotados', () => {
    expect(activeBase).toMatch(/org_invitations_role_valid/i);
    expect(activeBase).toMatch(/org_invitations_status_valid/i);
    expect(activeBase).toMatch(/'pending','accepted','revoked','expired'/);
  });
  it('índice parcial: una invitación pendiente por (org,email)', () => {
    expect(activeBase).toMatch(/UNIQUE INDEX org_invitations_pending_email_uq[\s\S]*WHERE status = 'pending'/i);
  });
});

describe('auditoría append-only (sin tokens)', () => {
  it('access_audit_log con CHECK de acciones', () => {
    expect(activeBase).toMatch(/CREATE TABLE access_audit_log/i);
    expect(activeBase).toMatch(/access_audit_action_valid/i);
    expect(activeBase).toMatch(/'invite_created','invite_resent','invite_revoked'/);
  });
});

describe('RPCs SECURITY DEFINER + guards (2,3,7)', () => {
  const fns = [
    'create_invitation',
    'resend_invitation',
    'revoke_invitation',
    'peek_invitation',
    'accept_invitation',
    'change_member_role',
  ];
  it('todas las RPCs existen como SECURITY DEFINER', () => {
    for (const fn of fns) {
      expect(activeBase).toMatch(new RegExp(`FUNCTION public\\.${fn}`, 'i'));
    }
    expect((activeBase.match(/SECURITY DEFINER/gi) ?? []).length).toBeGreaterThanOrEqual(fns.length);
  });
  it('guards de org/rol server-side (no_session/no_membership/insufficient_role)', () => {
    expect(activeBase).toMatch(/no_session/);
    expect(activeBase).toMatch(/no_membership/);
    expect(activeBase).toMatch(/insufficient_role/);
    expect(activeBase).toMatch(/app\.current_org\(\)/);
    expect(activeBase).toMatch(/app\.current_role\(\)/);
  });
  it('anti-escalamiento presente', () => {
    expect(activeBase).toMatch(/cannot_grant_admin/);
    expect(activeBase).toMatch(/cannot_change_self/);
    expect(activeBase).toMatch(/cannot_manage_admin/);
  });
  it('accept valida vencimiento, uso y email (9,10)', () => {
    expect(activeBase).toMatch(/invitation_expired/);
    expect(activeBase).toMatch(/invitation_used/);
    expect(activeBase).toMatch(/email_mismatch/);
  });
  it('REVOKE de PUBLIC/anon en RPCs de gestión; peek abierto a anon', () => {
    expect(activeBase).toMatch(/REVOKE ALL ON FUNCTION public\.create_invitation[\s\S]*FROM PUBLIC, anon/i);
    expect(activeBase).toMatch(/GRANT EXECUTE ON FUNCTION public\.peek_invitation\(text\) TO anon, authenticated/i);
  });
});

describe('RLS ENABLE+FORCE, sin escrituras directas (2,3)', () => {
  it('ambas tablas con ENABLE + FORCE', () => {
    expect(rlsSql).toMatch(/ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY/i);
    expect(rlsSql).toMatch(/ALTER TABLE organization_invitations FORCE ROW LEVEL SECURITY/i);
    expect(rlsSql).toMatch(/ALTER TABLE access_audit_log ENABLE ROW LEVEL SECURITY/i);
    expect(rlsSql).toMatch(/ALTER TABLE access_audit_log FORCE ROW LEVEL SECURITY/i);
  });
  it('SELECT acotado por organización; sin INSERT/UPDATE/DELETE directos', () => {
    expect(rlsSql).toMatch(/organization_invitations_select[\s\S]*organization_id = app\.current_org\(\)/i);
    expect(rlsSql).not.toMatch(/CREATE POLICY[^\n]*FOR INSERT/i);
    expect(rlsSql).not.toMatch(/CREATE POLICY[^\n]*FOR UPDATE/i);
    expect(rlsSql).not.toMatch(/CREATE POLICY[^\n]*FOR DELETE/i);
  });
  it('bitácora visible solo para gestión', () => {
    expect(rlsSql).toMatch(/access_audit_log_select[\s\S]*current_role\(\) IN \('admin','gerencia'\)/i);
  });
});

describe('migración aditiva (sin DROP/DELETE/TRUNCATE en la sección activa)', () => {
  it('no contiene DROP/DELETE/TRUNCATE fuera de comentarios', () => {
    expect(activeBase).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(activeBase).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(activeBase).not.toMatch(/\bTRUNCATE\b/i);
  });
});
