/**
 * rls-apu-import.test.ts — Validación ESTÁTICA de la migración RLS de
 * ENTRE_PATIOS_APU_IMPORT_V1 (mandato 4B.2, pruebas 43–47).
 *
 * No se conecta a ninguna base de datos: parsea el SQL de las migraciones
 * 20260615090000/20260615090100 y verifica tenant-scope, FORCE RLS, roles
 * autorizados, inmutabilidad y guardas de la RPC. El comportamiento runtime
 * lo cubre la sección 21 de scripts/rls-runtime/run.ts (Postgres local).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', '..', '..', '..', 'supabase', 'migrations');

function readMigration(suffix: string): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith(suffix));
  if (!file) throw new Error(`No se encontró la migración *${suffix}`);
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

const tableSql = readMigration('_apu_import_batches.sql');
const rlsSql = readMigration('_rls_apu_import_batches.sql');

describe('RLS apu_import_batches (43–47)', () => {
  // (43) batch tenant-scoped.
  it('43. apu_import_batches es tenant-scoped (organization_id + current_org)', () => {
    expect(tableSql).toMatch(/organization_id\s+uuid NOT NULL REFERENCES organizations/i);
    expect(rlsSql).toMatch(
      /CREATE POLICY aib_select_own_org[\s\S]*?organization_id = app\.current_org\(\)/i,
    );
    expect(rlsSql).toMatch(
      /CREATE POLICY aib_insert_authorized[\s\S]*?organization_id = app\.current_org\(\)/i,
    );
  });

  // (44) cross-org bloqueado (trigger same-org del batch en templates).
  it('44. cross-org bloqueado: trigger same-org para apu_templates.import_batch_id', () => {
    expect(tableSql).toMatch(/FUNCTION public\.apu_template_import_batch_same_org/i);
    expect(tableSql).toMatch(
      /CREATE TRIGGER apu_templates_import_batch_same_org[\s\S]*?ON public\.apu_templates/i,
    );
    expect(tableSql).toMatch(/IS DISTINCT FROM NEW\.organization_id/i);
    // Sin SECURITY DEFINER (el trigger corre con RLS del invocador) — se
    // evalúa el SQL ACTIVO (los comentarios pueden mencionar el término).
    const activeSql = tableSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(activeSql).not.toMatch(/SECURITY DEFINER/i);
  });

  // (45) FORCE RLS.
  it('45. ENABLE + FORCE ROW LEVEL SECURITY en apu_import_batches', () => {
    expect(rlsSql).toMatch(/ALTER TABLE apu_import_batches\s+ENABLE ROW LEVEL SECURITY/i);
    expect(rlsSql).toMatch(/ALTER TABLE apu_import_batches\s+FORCE ROW LEVEL SECURITY/i);
  });

  // (46/47) site/client bloqueados; management/internal autorizados
  // (en DB: roles admin/gerencia, paridad review center).
  it('46/47. INSERT solo admin/gerencia con imported_by = identidad real; sin UPDATE/DELETE', () => {
    expect(rlsSql).toMatch(
      /aib_insert_authorized[\s\S]*?IN \('admin', 'gerencia'\)/i,
    );
    expect(rlsSql).toMatch(/imported_by = \(SELECT app\._auth_uid\(\)\)/i);
    const policies = [...rlsSql.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map((m) => m[0]);
    expect(policies.some((p) => /FOR UPDATE/i.test(p))).toBe(false);
    expect(policies.some((p) => /FOR DELETE/i.test(p))).toBe(false);
  });

  it('migración 100% aditiva: sin DROP de tablas/columnas activos ni DELETE', () => {
    const active = (sql: string) =>
      sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
    for (const sql of [tableSql, rlsSql]) {
      const activeSql = active(sql);
      expect(activeSql).not.toMatch(/DROP TABLE/i);
      expect(activeSql).not.toMatch(/DROP COLUMN/i);
      expect(activeSql).not.toMatch(/\bDELETE FROM\b/i);
      expect(activeSql).not.toMatch(/TRUNCATE/i);
    }
  });

  it('RPC import_apu_batch: SECURITY INVOKER, deny-by-default y grants mínimos', () => {
    expect(tableSql).toMatch(/FUNCTION public\.import_apu_batch[\s\S]*?SECURITY INVOKER/i);
    expect(tableSql).toMatch(/no_session/);
    expect(tableSql).toMatch(/no_membership/);
    expect(tableSql).toMatch(/REVOKE ALL ON FUNCTION public\.import_apu_batch[\s\S]*?FROM PUBLIC/i);
    expect(tableSql).toMatch(/REVOKE ALL ON FUNCTION public\.import_apu_batch[\s\S]*?FROM anon/i);
    expect(tableSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.import_apu_batch[\s\S]*?TO authenticated/i);
  });

  it('RPC: linking solo sobre ítems sin vínculo, no archivados, de la versión objetivo', () => {
    expect(tableSql).toMatch(
      /UPDATE public\.boq_items[\s\S]*?apu_template_id IS NULL[\s\S]*?archived_at IS NULL/i,
    );
    expect(tableSql).toMatch(/estimate_version_id = p_version_id/i);
    expect(tableSql).toMatch(/version_locked/);
  });

  it('RPC: total_component_cost recalculado en SQL (jamás del cliente)', () => {
    expect(tableSql).toMatch(/round\(v_qty \* \(1 \+ v_waste\) \* v_price, 10\)/i);
  });

  it('idempotencia estructural: UNIQUE (organization_id, digest_sha256)', () => {
    expect(tableSql).toMatch(
      /CREATE UNIQUE INDEX apu_import_batches_org_digest_uq\s+ON apu_import_batches \(organization_id, digest_sha256\)/i,
    );
  });
});
