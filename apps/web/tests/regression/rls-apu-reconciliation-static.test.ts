/**
 * rls-apu-reconciliation-static.test.ts — Validación ESTÁTICA de la migración
 * y la UI de APU_COMPONENT_RESOURCE_RECONCILIATION_AND_LIBRARY_UX_V1.
 *
 * No se conecta a base de datos: parsea el SQL de la migración
 * 20260617090000 y los archivos de UI para verificar invariantes de schema,
 * RLS, RPCs (SECURITY INVOKER + guard de rol + idempotencia), ausencia de
 * DROP/DELETE y la estructura operativa de la biblioteca/centro. El
 * comportamiento runtime (cross-org, idempotencia real) requiere DB local y se
 * cubre con el harness RLS (scripts/rls-runtime) antes del release.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const WEB = join(ROOT, 'apps', 'web');

function readMigration(suffix: string): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith(suffix));
  if (!file) throw new Error(`No se encontró la migración *${suffix}`);
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

const sql = readMigration('_apu_component_reconciliation.sql');
const activeSql = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('Schema aditivo apu_components (1, 4)', () => {
  it('1. columnas aditivas updated_at / reconciliation_state / reconciled_by', () => {
    expect(activeSql).toMatch(/ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now\(\)/i);
    expect(activeSql).toMatch(/ADD COLUMN reconciliation_state text NOT NULL DEFAULT 'pending'/i);
    expect(activeSql).toMatch(/ADD COLUMN reconciled_by uuid REFERENCES profiles/i);
  });

  it('CHECK de reconciliation_state acotado', () => {
    expect(activeSql).toMatch(
      /reconciliation_state IN \('pending', 'associated', 'intentionally_unresolved'\)/i,
    );
  });

  it('4. trigger de recálculo financiero BEFORE UPDATE (cierra R-01)', () => {
    expect(activeSql).toMatch(/FUNCTION public\.apu_component_recompute_total/i);
    expect(activeSql).toMatch(
      /total_component_cost\s*:=\s*round\(NEW\.quantity \* \(1 \+ NEW\.waste_pct\) \* NEW\.unit_price_snapshot, 10\)/i,
    );
    expect(activeSql).toMatch(/CREATE TRIGGER apu_components_recompute_total\s+BEFORE UPDATE/i);
  });
});

describe('Tabla de auditoría apu_component_resource_actions (3, 5, 6, 7)', () => {
  it('3. tabla con organization_id + idempotency_key + counts', () => {
    expect(activeSql).toMatch(/CREATE TABLE apu_component_resource_actions/i);
    expect(activeSql).toMatch(/organization_id\s+uuid NOT NULL REFERENCES organizations/i);
    expect(activeSql).toMatch(/idempotency_key\s+text/i);
  });

  it('idempotencia: unique parcial (org, idempotency_key)', () => {
    expect(activeSql).toMatch(
      /CREATE UNIQUE INDEX apu_component_resource_actions_org_idempotency_uq[\s\S]*?WHERE idempotency_key IS NOT NULL/i,
    );
  });

  it('2/5. ENABLE + FORCE RLS', () => {
    expect(activeSql).toMatch(
      /ALTER TABLE apu_component_resource_actions ENABLE ROW LEVEL SECURITY/i,
    );
    expect(activeSql).toMatch(
      /ALTER TABLE apu_component_resource_actions FORCE ROW LEVEL SECURITY/i,
    );
  });

  it('6. tenant-scoped: SELECT/INSERT por current_org y rol autorizado', () => {
    expect(activeSql).toMatch(
      /CREATE POLICY apu_component_resource_actions_select[\s\S]*?organization_id = app\.current_org\(\)/i,
    );
    expect(activeSql).toMatch(
      /CREATE POLICY apu_component_resource_actions_insert[\s\S]*?app\.current_role\(\) IN \('admin', 'gerencia', 'presupuestos'\)/i,
    );
    expect(activeSql).toMatch(/initiated_by = app\._auth_uid\(\)/i);
  });

  it('7. auditoría inmutable: sin política UPDATE/DELETE', () => {
    expect(activeSql).not.toMatch(
      /CREATE POLICY apu_component_resource_actions_(update|delete)/i,
    );
  });
});

describe('RPCs SECURITY INVOKER con guard de rol (17, 18, 20, 21, 22)', () => {
  const rpcs = [
    'reconcile_apu_component',
    'reconcile_apu_components_bulk',
    'update_apu_component_reconciliation',
  ];

  it('todas las RPC públicas son SECURITY INVOKER', () => {
    for (const fn of rpcs) {
      const re = new RegExp(`FUNCTION public\\.${fn}[\\s\\S]*?SECURITY INVOKER`, 'i');
      expect(activeSql).toMatch(re);
    }
  });

  it('no hay SECURITY DEFINER en SQL activo', () => {
    expect(activeSql).not.toMatch(/SECURITY DEFINER/i);
  });

  it('20/21/22. guard: no_session / no_membership / rol autorizado', () => {
    expect(activeSql).toMatch(/no_session/);
    expect(activeSql).toMatch(/no_membership/);
    expect(activeSql).toMatch(
      /app\.current_role\(\) NOT IN \('admin', 'gerencia', 'presupuestos'\)[\s\S]*?insufficient_role/i,
    );
  });

  it('18. bulk con límite de 50 y recálculo server-side', () => {
    expect(activeSql).toMatch(/v_count > 50[\s\S]*?bulk_limit_exceeded/i);
    expect(activeSql).toMatch(/round\(v_comp\.quantity \* \(1 \+ v_comp\.waste_pct\) \* v_price, 10\)/i);
  });

  it('6. nunca reconcilia mano de obra ni recurso de otra org', () => {
    expect(activeSql).toMatch(/labor_role_id IS NOT NULL OR v_comp\.unit_price_source = 'labor_role'/i);
    expect(activeSql).toMatch(/FROM public\.resources r[\s\S]*?r\.organization_id = p_org/i);
  });

  it('GRANT EXECUTE solo a authenticated; anon revocado', () => {
    expect(activeSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reconcile_apu_component[\s\S]*?TO authenticated/i);
    expect(activeSql).toMatch(/REVOKE ALL ON FUNCTION public\.reconcile_apu_component[\s\S]*?anon/i);
  });
});

describe('Migración estrictamente aditiva (7)', () => {
  it('sin DROP TABLE / DELETE / TRUNCATE en SQL activo', () => {
    expect(activeSql).not.toMatch(/\bDROP TABLE\b/i);
    expect(activeSql).not.toMatch(/\bDELETE FROM\b/i);
    expect(activeSql).not.toMatch(/\bTRUNCATE\b/i);
  });
});

/* --- UX estructural (30–43) ---------------------------------------------- */

function readWeb(rel: string): string {
  return readFileSync(join(WEB, rel), 'utf8');
}

describe('Biblioteca /apu compacta (30–34)', () => {
  const page = readWeb('app/(dashboard)/apu/page.tsx');
  it('30/31. tabla compacta + búsqueda visible', () => {
    expect(page).toMatch(/Biblioteca de APU/);
    expect(page).toMatch(/name="q"/);
  });
  it('32. filtros visibles', () => {
    expect(page).toMatch(/name="filter"/);
    expect(page).toMatch(/name="origin"|Origen/);
  });
  it('33. paginación visible (server-side)', () => {
    expect(page).toMatch(/Anterior/);
    expect(page).toMatch(/Siguiente/);
    expect(page).toMatch(/name="size"/);
  });
  it('34. ordenamiento', () => {
    expect(page).toMatch(/name="sort"/);
  });
  it('CTA reconciliar (39)', () => {
    expect(page).toMatch(/\/apu\/reconciliation/);
  });
});

describe('Detalle /apu/[id] organizado (35–38)', () => {
  const page = readWeb('app/(dashboard)/apu/[id]/page.tsx');
  it('35/36. pestañas + componentes en tabla', () => {
    expect(page).toMatch(/Resumen/);
    expect(page).toMatch(/Componentes/);
    expect(page).toMatch(/tab=/);
  });
  it('37/38. vínculo BOQ + trazabilidad', () => {
    expect(page).toMatch(/Vínculo BOQ/);
    expect(page).toMatch(/Trazabilidad/);
  });
});

describe('Centro de reconciliación (40–42)', () => {
  const client = readWeb('app/(dashboard)/apu/reconciliation/_components/reconciliation-client.tsx');
  it('40. centro con selección por checkbox', () => {
    expect(client).toMatch(/type="checkbox"/);
    expect(client).toMatch(/Asociar seleccionadas/);
  });
  it('41. modal bulk con texto congelado', () => {
    expect(client).toMatch(/Vas a asociar/);
    expect(client).toMatch(/Las asociaciones existentes no se sobrescribirán silenciosamente/);
    expect(client).toMatch(/Confirmar asociaciones/);
    expect(client).toMatch(/role="dialog"/);
  });
  it('42. badges operativos + CSV', () => {
    expect(client).toMatch(/Sugerido|Sin resolver|Ambiguo/);
    expect(client).toMatch(/downloadCsv|text\/csv/);
  });
});
