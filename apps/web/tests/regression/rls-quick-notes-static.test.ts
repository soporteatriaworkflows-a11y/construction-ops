/**
 * rls-quick-notes-static.test.ts — Validación ESTÁTICA de la migración
 * 20260627090000_quick_notes.sql (ICONIC_OPS_V5_4_2A_QUICK_NOTES_MIGRATION_RLS).
 *
 * NO se conecta a base de datos: parsea el SQL (ignorando comentarios) y verifica
 * invariantes de schema, RLS (enable+force), policies por rol, privacidad (sin `client`,
 * sin `true` abierto, sin SELECT público), archive-only y ausencia de DELETE/DROP.
 * El comportamiento runtime (cross-org real) se cubre con el harness RLS antes del release.
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

const sql = readMigration('_quick_notes.sql');
const activeSql = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('quick_notes — schema y constraints', () => {
  it('crea tabla con FKs reales (organizations/projects/estimates/profiles)', () => {
    expect(activeSql).toMatch(/CREATE TABLE quick_notes/i);
    expect(activeSql).toMatch(/organization_id\s+uuid NOT NULL REFERENCES organizations \(id\) ON DELETE CASCADE/i);
    expect(activeSql).toMatch(/project_id\s+uuid REFERENCES projects \(id\)/i);
    expect(activeSql).toMatch(/estimate_id\s+uuid REFERENCES estimates \(id\)/i);
    expect(activeSql).toMatch(/created_by\s+uuid NOT NULL REFERENCES profiles \(id\) ON DELETE RESTRICT/i);
    expect(activeSql).toMatch(/archived_by\s+uuid REFERENCES profiles \(id\) ON DELETE SET NULL/i);
  });

  it('status acotado + body 1..1000 + consistencia de archivado', () => {
    expect(activeSql).toMatch(/status IN \('active', 'archived'\)/i);
    expect(activeSql).toMatch(/char_length\(btrim\(body\)\) BETWEEN 1 AND 1000/i);
    expect(activeSql).toMatch(/\(status = 'archived'\) = \(archived_at IS NOT NULL\)/i);
  });

  it('índice parcial para activas por org', () => {
    expect(activeSql).toMatch(/CREATE INDEX quick_notes_org_active_idx[\s\S]*?WHERE status = 'active'/i);
  });

  it('updated_at vía trigger del schema', () => {
    expect(activeSql).toMatch(/CREATE TRIGGER quick_notes_set_updated_at\s+BEFORE UPDATE[\s\S]*?app\.set_updated_at\(\)/i);
  });
});

describe('quick_notes — RLS enable + force', () => {
  it('ENABLE + FORCE ROW LEVEL SECURITY', () => {
    expect(activeSql).toMatch(/ALTER TABLE quick_notes ENABLE ROW LEVEL SECURITY/i);
    expect(activeSql).toMatch(/ALTER TABLE quick_notes FORCE ROW LEVEL SECURITY/i);
  });
});

describe('quick_notes — policies por rol', () => {
  it('SELECT org-scoped', () => {
    expect(activeSql).toMatch(/CREATE POLICY quick_notes_select_own_org[\s\S]*?FOR SELECT[\s\S]*?organization_id = app\.current_org\(\)/i);
  });

  it('INSERT: org + autoría + roles operativos (sin consulta)', () => {
    const insert = activeSql.match(/CREATE POLICY quick_notes_insert_authorized[\s\S]*?\);/i)?.[0] ?? '';
    expect(insert).toMatch(/organization_id = app\.current_org\(\)/i);
    expect(insert).toMatch(/created_by = \(SELECT app\._auth_uid\(\)\)/i);
    expect(insert).toMatch(/app\.current_role\(\) IN \('admin', 'gerencia', 'presupuestos', 'obra', 'compras'\)/i);
    // consulta NO puede crear
    expect(insert).not.toMatch(/'consulta'/);
    // project_id no-null debe pertenecer a la org
    expect(insert).toMatch(/project_id IS NULL[\s\S]*?p\.organization_id = app\.current_org\(\)/i);
  });

  it('UPDATE/archive: creador o admin/gerencia, org-scoped', () => {
    const upd = activeSql.match(/CREATE POLICY quick_notes_update_authorized[\s\S]*?WITH CHECK \(organization_id = app\.current_org\(\)\);/i)?.[0] ?? '';
    expect(upd).toMatch(/FOR UPDATE/i);
    expect(upd).toMatch(/created_by = \(SELECT app\._auth_uid\(\)\)/i);
    expect(upd).toMatch(/app\.current_role\(\) IN \('admin', 'gerencia'\)/i);
    expect(upd).toMatch(/WITH CHECK \(organization_id = app\.current_org\(\)\)/i);
  });

  it('DELETE denegado: sin policy de delete', () => {
    expect(activeSql).not.toMatch(/CREATE POLICY quick_notes_delete/i);
    expect(activeSql).not.toMatch(/FOR DELETE/i);
  });
});

describe('quick_notes — privacidad', () => {
  it('ninguna policy referencia el rol client (no es rol DB)', () => {
    expect(activeSql).not.toMatch(/'client'/);
  });

  it('sin USING/WITH CHECK abierto (true) ni SELECT público', () => {
    expect(activeSql).not.toMatch(/USING \(true\)/i);
    expect(activeSql).not.toMatch(/WITH CHECK \(true\)/i);
    expect(activeSql).not.toMatch(/TO anon/i);
    // toda policy ata a organización
    const policies = activeSql.match(/CREATE POLICY quick_notes_[\s\S]*?;/gi) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(3);
    for (const p of policies) expect(p).toMatch(/app\.current_org\(\)/i);
  });
});

describe('quick_notes — hardening pre-merge (archive-only + estimate org)', () => {
  it('trigger BEFORE UPDATE archive-only con guardas de identidad/scope', () => {
    expect(activeSql).toMatch(/FUNCTION app\.quick_notes_enforce_archive_only\(\)/i);
    expect(activeSql).toMatch(/CREATE TRIGGER quick_notes_archive_only\s+BEFORE UPDATE/i);
    // rechaza tocar nota archivada / update que no archive
    expect(activeSql).toMatch(/OLD\.status = 'archived'[\s\S]*?quick_notes_immutable_when_archived/i);
    expect(activeSql).toMatch(/NEW\.status IS DISTINCT FROM 'archived'[\s\S]*?quick_notes_update_archive_only/i);
    // campos de identidad/scope inmutables
    for (const f of ['organization_id', 'project_id', 'estimate_id', 'body', 'created_by', 'created_at']) {
      expect(activeSql).toMatch(new RegExp(`NEW\\.${f} IS DISTINCT FROM OLD\\.${f}`, 'i'));
    }
    expect(activeSql).toMatch(/archived_at IS NULL OR NEW\.archived_by IS NULL[\s\S]*?quick_notes_archive_requires/i);
  });

  it('estimate_id validado contra la org (gate + consistencia con project)', () => {
    expect(activeSql).toMatch(/FUNCTION app\.estimate_in_org\(p_estimate_id uuid\)/i);
    expect(activeSql).toMatch(/JOIN project_scopes ps[\s\S]*?JOIN projects p[\s\S]*?p\.organization_id = app\.current_org\(\)/i);
    const insert = activeSql.match(/CREATE POLICY quick_notes_insert_authorized[\s\S]*?\);/i)?.[0] ?? '';
    expect(insert).toMatch(/estimate_id IS NULL OR app\.estimate_in_org\(estimate_id\)/i);
    expect(insert).toMatch(/ps\.project_id = project_id/i);
  });

  it('archive-only no usa SECURITY DEFINER', () => {
    expect(activeSql).not.toMatch(/SECURITY DEFINER/i);
  });
});

describe('quick_notes — migración estrictamente aditiva', () => {
  it('sin DROP / DELETE / TRUNCATE; no toca price_monitor_targets ni otras tablas', () => {
    expect(activeSql).not.toMatch(/\bDROP TABLE\b/i);
    expect(activeSql).not.toMatch(/\bDELETE FROM\b/i);
    expect(activeSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(activeSql).not.toMatch(/ALTER TABLE price_monitor_targets/i);
    expect(activeSql).not.toMatch(/SECURITY DEFINER/i);
  });
});
