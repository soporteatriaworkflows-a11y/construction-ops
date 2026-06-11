/**
 * review-center-rls-static.test.ts — Validación ESTÁTICA del esquema y RLS del
 * Centro de Revisión de Precios (PRICE_OBSERVATION_REVIEW_CENTER_V1).
 *
 * Mandato (pruebas 1–6): batch tenant-scoped, action tenant-scoped, FK válida,
 * cross-org bloqueado, RLS FORCE, compatibilidad con observaciones históricas.
 * Además: migración aditiva (sin DROP destructivo, sin DELETE de datos).
 *
 * NO se conecta a base alguna (el runtime real lo cubre la sección 20 del
 * harness scripts/rls-runtime/run.ts).
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

const schemaSql = readMigration('_price_observation_batches_bulk_actions.sql');
const rlsSql = readMigration('_rls_price_observation_batches_bulk_actions.sql');

function activeSql(sql: string): string {
  // Excluye comentarios (el bloque DOWN documentado vive en comentarios).
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
}

describe('T1-T2 — tablas nuevas tenant-scoped (organization_id + FK a organizations)', () => {
  it.each(['price_observation_batches', 'price_observation_bulk_actions'] as const)(
    '%s tiene organization_id NOT NULL con FK a organizations',
    (table) => {
      const block = schemaSql.slice(schemaSql.indexOf(`CREATE TABLE ${table}`));
      expect(block).toMatch(
        /organization_id\s+uuid NOT NULL REFERENCES organizations \(id\) ON DELETE CASCADE/,
      );
    },
  );

  it.each(['price_observation_batches', 'price_observation_bulk_actions'] as const)(
    '%s filtra SELECT por app.current_org()',
    (table) => {
      const policies = [...rlsSql.matchAll(/CREATE POLICY[\s\S]*?;/gi)]
        .map((m) => m[0])
        .filter((b) => new RegExp(`ON ${table}\\b`, 'i').test(b));
      expect(policies.length).toBeGreaterThan(0);
      for (const p of policies) {
        expect(p).toMatch(/app\.current_org\(\)/i);
      }
    },
  );
});

describe('T3 — FK y trigger same-org de import_batch_id', () => {
  it('resource_price_observations.import_batch_id es nullable con FK al batch', () => {
    expect(schemaSql).toMatch(
      /ADD COLUMN import_batch_id uuid\s+REFERENCES price_observation_batches \(id\) ON DELETE SET NULL/,
    );
    // Nullable: sin NOT NULL en la columna nueva (compat retroactiva).
    expect(schemaSql).not.toMatch(/import_batch_id uuid[^,;]*NOT NULL/);
  });

  it('trigger same-org impide vincular un batch de otra organización', () => {
    expect(schemaSql).toMatch(/check_rpo_batch_same_org/);
    expect(schemaSql).toMatch(/b\.organization_id = NEW\.organization_id/);
    expect(schemaSql).toMatch(
      /CREATE TRIGGER rpo_batch_same_org\s+BEFORE INSERT OR UPDATE OF import_batch_id ON resource_price_observations/,
    );
  });
});

describe('T4 — cross-org bloqueado en INSERT', () => {
  it('batches: INSERT exige org propia + imported_by = identidad real + rol importador', () => {
    const policy = rlsSql.match(/CREATE POLICY pob_insert_authorized[\s\S]*?;/i)?.[0];
    expect(policy).toBeDefined();
    expect(policy).toMatch(/organization_id = app\.current_org\(\)/);
    expect(policy).toMatch(/imported_by = \(SELECT app\._auth_uid\(\)\)/);
    expect(policy).toMatch(/'admin', 'gerencia', 'presupuestos', 'compras'/);
  });

  it('bulk_actions: INSERT exige org propia + initiated_by = identidad real + admin/gerencia', () => {
    const policy = rlsSql.match(/CREATE POLICY poba_insert_reviewers[\s\S]*?;/i)?.[0];
    expect(policy).toBeDefined();
    expect(policy).toMatch(/organization_id = app\.current_org\(\)/);
    expect(policy).toMatch(/initiated_by = \(SELECT app\._auth_uid\(\)\)/);
    expect(policy).toMatch(/IN \('admin', 'gerencia'\)/);
    // El batch referenciado debe ser de la misma org.
    expect(policy).toMatch(/import_batch_id IS NULL\s+OR EXISTS/);
  });
});

describe('T5 — RLS ENABLE + FORCE en ambas tablas', () => {
  it.each(['price_observation_batches', 'price_observation_bulk_actions'] as const)(
    '%s tiene ENABLE y FORCE ROW LEVEL SECURITY',
    (table) => {
      expect(rlsSql).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, 'i'));
      expect(rlsSql).toMatch(new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`, 'i'));
    },
  );
});

describe('T6 — compatibilidad retroactiva e inmutabilidad', () => {
  it('sin backfill: la migración no ejecuta UPDATE sobre observaciones existentes', () => {
    expect(activeSql(schemaSql)).not.toMatch(/UPDATE resource_price_observations/i);
  });

  it('batches sin política UPDATE ni DELETE (procedencia inmutable)', () => {
    const policies = [...rlsSql.matchAll(/CREATE POLICY[\s\S]*?;/gi)]
      .map((m) => m[0])
      .filter((b) => /ON price_observation_batches\b/i.test(b));
    expect(policies.some((p) => /FOR UPDATE/i.test(p))).toBe(false);
    expect(policies.some((p) => /FOR DELETE/i.test(p))).toBe(false);
  });

  it('bulk_actions sin política DELETE (auditoría inmutable)', () => {
    const policies = [...rlsSql.matchAll(/CREATE POLICY[\s\S]*?;/gi)]
      .map((m) => m[0])
      .filter((b) => /ON price_observation_bulk_actions\b/i.test(b));
    expect(policies.some((p) => /FOR DELETE/i.test(p))).toBe(false);
  });

  it('idempotencia estructural: UNIQUE (organization_id, idempotency_key)', () => {
    expect(schemaSql).toMatch(/UNIQUE \(organization_id, idempotency_key\)/);
  });
});

describe('migración aditiva — sin sentencias destructivas activas', () => {
  it.each([
    ['schema', schemaSql],
    ['rls', rlsSql],
  ] as const)('%s: sin DROP TABLE/COLUMN ni DELETE/TRUNCATE activos', (_name, sql) => {
    const active = activeSql(sql);
    expect(active).not.toMatch(/DROP TABLE/i);
    expect(active).not.toMatch(/DROP COLUMN/i);
    expect(active).not.toMatch(/\bDELETE FROM\b/i);
    expect(active).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('ninguna política contiene un UUID hardcodeado', () => {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(uuidRe.test(rlsSql)).toBe(false);
  });
});
