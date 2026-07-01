/**
 * rls-quick-notes-policy-patch-static.test.ts — Validación ESTÁTICA del patch
 * 20260627093000_quick_notes_project_estimate_policy_patch.sql
 * (ICONIC_OPS_V5_4_2A_QUICK_NOTES_POLICY_PATCH_PROJECT_ESTIMATE_CONSISTENCY).
 *
 * NO se conecta a base de datos: parsea el SQL (ignorando comentarios) y verifica que el
 * patch recrea la policy INSERT de quick_notes corrigiendo el shadowing de columna que
 * volvía inoperante la consistencia project/estimate (detectado por el harness RLS vivo
 * contra Cloud: 30/31, único FAIL = inconsistencia project/estimate intra-org).
 *
 * Invariantes:
 *  - recrea SOLO la policy INSERT (DROP POLICY + CREATE POLICY), aditivo.
 *  - la condición de consistencia usa `ps.project_id = quick_notes.project_id` (calificado).
 *  - NO queda el patrón ambiguo `ps.project_id = project_id` (shadowing/tautología).
 *  - no introduce policy abierta (true / TO anon) ni policy de DELETE.
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

const sql = readMigration('_quick_notes_project_estimate_policy_patch.sql');
// SQL "activo": sin comentarios (la sección DOWN documenta el patrón buggy y no debe
// contaminar las aserciones de ausencia).
const activeSql = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

const insertPolicy =
  activeSql.match(/CREATE POLICY quick_notes_insert_authorized[\s\S]*?\);/i)?.[0] ?? '';

describe('quick_notes patch — recrea la policy INSERT (aditivo)', () => {
  it('hace DROP POLICY IF EXISTS de la policy INSERT', () => {
    expect(activeSql).toMatch(
      /DROP POLICY IF EXISTS quick_notes_insert_authorized ON public\.quick_notes/i,
    );
  });

  it('recrea quick_notes_insert_authorized FOR INSERT', () => {
    expect(insertPolicy).toMatch(/CREATE POLICY quick_notes_insert_authorized ON public\.quick_notes/i);
    expect(insertPolicy).toMatch(/FOR INSERT/i);
    expect(insertPolicy).toMatch(/WITH CHECK/i);
  });

  it('preserva el contrato de autoría/rol/org (consulta NO crea)', () => {
    expect(insertPolicy).toMatch(/organization_id = app\.current_org\(\)/i);
    expect(insertPolicy).toMatch(/created_by = \(SELECT app\._auth_uid\(\)\)/i);
    expect(insertPolicy).toMatch(
      /app\.current_role\(\) IN \('admin', 'gerencia', 'presupuestos', 'obra', 'compras'\)/i,
    );
    expect(insertPolicy).not.toMatch(/'consulta'/);
  });
});

describe('quick_notes patch — corrección del shadowing project/estimate', () => {
  it('la consistencia usa quick_notes.project_id CALIFICADO', () => {
    expect(insertPolicy).toMatch(/ps\.project_id = quick_notes\.project_id/i);
  });

  it('NO queda el patrón ambiguo `ps.project_id = project_id` (shadowing)', () => {
    // project_id no calificado (ni quick_notes. ni ps.) a la derecha del igual.
    expect(insertPolicy).not.toMatch(/ps\.project_id\s*=\s*project_id\b/i);
    // y en general: ninguna referencia desnuda `= project_id` sin calificar dentro del EXISTS.
    expect(insertPolicy).not.toMatch(/=\s*project_id\b/i);
  });

  it('gate de estimate y de project quedan calificados a la NEW-row', () => {
    expect(insertPolicy).toMatch(/app\.estimate_in_org\(quick_notes\.estimate_id\)/i);
    expect(insertPolicy).toMatch(/p\.id = quick_notes\.project_id/i);
    expect(insertPolicy).toMatch(/e\.id = quick_notes\.estimate_id/i);
  });

  it('mantiene el contrato: project_id NULL o estimate_id NULL cortocircuitan la consistencia', () => {
    expect(insertPolicy).toMatch(
      /quick_notes\.project_id IS NULL OR quick_notes\.estimate_id IS NULL/i,
    );
  });
});

describe('quick_notes patch — sin apertura ni DELETE', () => {
  it('no introduce policy abierta (true) ni TO anon', () => {
    expect(activeSql).not.toMatch(/USING \(true\)/i);
    expect(activeSql).not.toMatch(/WITH CHECK \(true\)/i);
    expect(activeSql).not.toMatch(/TO anon/i);
  });

  it('no crea policy de DELETE', () => {
    expect(activeSql).not.toMatch(/FOR DELETE/i);
    expect(activeSql).not.toMatch(/CREATE POLICY quick_notes_delete/i);
  });

  it('es estrictamente aditivo: solo DROP POLICY (sin DROP TABLE/DELETE/TRUNCATE)', () => {
    expect(activeSql).not.toMatch(/\bDROP TABLE\b/i);
    expect(activeSql).not.toMatch(/\bDELETE FROM\b/i);
    expect(activeSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(activeSql).not.toMatch(/\bALTER TABLE\b/i);
    // el único DROP permitido es el de la policy que se recrea
    const drops = activeSql.match(/\bDROP\b[^\n;]*/gi) ?? [];
    for (const d of drops) expect(d).toMatch(/DROP POLICY IF EXISTS quick_notes_insert_authorized/i);
  });

  it('la policy recreada sigue atada a app.current_org()', () => {
    expect(insertPolicy).toMatch(/app\.current_org\(\)/i);
  });
});
