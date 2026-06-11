/**
 * ui-and-invariants.test.ts — Guardas de UI e invariantes del monitor (Fase 4A).
 * Mandato: tests 27-29 (no BOQ/AIU/export writes), 38 (redirects intactos),
 * 39-44 (UI), idioma source-scan (mismo patrón que route-config.test.ts 4B.1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../../..');

function read(rel: string): string {
  return readFileSync(resolve(webRoot, rel), 'utf8');
}

const monitorDir = resolve(webRoot, 'server/pricing/monitor');
const monitorSources = readdirSync(monitorDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(monitorDir, f), 'utf8'))
  .join('\n');

describe('invariantes del dominio del monitor (mandato 27-29)', () => {
  it('T27: el monitor NO importa ni escribe BOQ (estimates/boq)', () => {
    expect(monitorSources).not.toMatch(/@\/server\/estimates/);
    expect(monitorSources).not.toMatch(/boq_items|chapters\b/);
  });

  it('T28: el monitor NO toca AIU (indirect_cost_rules / aiu-calc)', () => {
    expect(monitorSources).not.toMatch(/indirect_cost_rules|aiu-calc|estimate_versions/);
  });

  it('T29: el monitor NO toca exports', () => {
    expect(monitorSources).not.toMatch(/@\/server\/exports|@\/modules\/exports/);
  });

  it('el monitor NUNCA inserta ni promueve observaciones approved', () => {
    // La única escritura sobre resource_price_observations es el INSERT pending.
    const dbStores = read('server/pricing/monitor/db-stores.ts');
    expect(dbStores).not.toMatch(/UPDATE\s+resource_price_observations/i);
    const insertBlock = dbStores.match(/INSERT INTO resource_price_observations[\s\S]*?RETURNING id/);
    expect(insertBlock).not.toBeNull();
    expect(insertBlock![0]).toContain(`'pending'`);
    expect(insertBlock![0]).not.toContain(`'approved'`);
  });

  it('solo las tablas del monitor + resource_price_observations en SQL del store', () => {
    const dbStores = read('server/pricing/monitor/db-stores.ts');
    const tables = dbStores.match(/(?:FROM|INTO|UPDATE)\s+([a-z_]+)/gi) ?? [];
    const allowed = new Set([
      'price_monitor_targets',
      'price_monitor_runs',
      'price_monitor_results',
      'resource_price_observations',
      'resources',
    ]);
    for (const m of tables) {
      const table = m.replace(/^(FROM|INTO|UPDATE)\s+/i, '').trim();
      expect(allowed.has(table), `tabla inesperada en monitor SQL: ${table}`).toBe(true);
    }
  });
});

describe('fetch seguro heredado intacto (mandato 37-38)', () => {
  it('T38: check-target reutiliza fetchPublicPage (redirects ≤5 y SSRF por salto)', () => {
    const src = read('server/pricing/monitor/check-target.ts');
    expect(src).toMatch(/from '\.\.\/validation\/fetch-public-page'/);
    expect(src).toMatch(/from '\.\.\/validation\/validate-url'/);
    // Sin fetch propio: nada de fetch( directo en el módulo monitor.
    expect(monitorSources).not.toMatch(/\bglobalThis\.fetch\b|\bawait fetch\(/);
  });

  it('fetch-public-page conserva MAX_REDIRECTS = 5 y cap 3MB', () => {
    const src = read('server/pricing/validation/fetch-public-page.ts');
    expect(src).toMatch(/MAX_REDIRECTS\s*=\s*5/);
    expect(src).toMatch(/3\s*\*\s*1024\s*\*\s*1024/);
  });
});

describe('UI del monitoreo (mandato 39-44)', () => {
  const resourcePage = read('app/(dashboard)/catalog/resources/[resourceId]/price-intelligence/page.tsx');
  const monitoringPage = read('app/(dashboard)/catalog/monitoring/page.tsx');
  const controls = read('app/(dashboard)/catalog/monitoring/_components/monitor-controls.tsx');
  const dashboard = read('app/(dashboard)/dashboard/page.tsx');
  const actions = read('app/(dashboard)/catalog/monitoring/actions.ts');

  it('T39: la página del recurso muestra la sección de monitoreo (toggle)', () => {
    expect(resourcePage).toMatch(/MonitoringSection/);
    expect(controls).toMatch(/Monitorear esta fuente/);
  });

  it('T40: la frecuencia 1/7/15/30 días es visible', () => {
    expect(controls).toMatch(/value:\s*1\b/);
    expect(controls).toMatch(/value:\s*7\b/);
    expect(controls).toMatch(/value:\s*15\b/);
    expect(controls).toMatch(/value:\s*30\b/);
  });

  it('T41: «Revisar ahora» existe y solo se renderiza a roles autorizados', () => {
    expect(controls).toMatch(/Revisar ahora/);
    // En el centro de monitoreo, RunNowButton va detrás de canMutate.
    expect(monitoringPage).toMatch(/\{canMutate && <RunNowButton/);
    // En la sección del recurso, los controles van detrás de canMutate.
    const section = read(
      'app/(dashboard)/catalog/resources/[resourceId]/price-intelligence/_components/monitoring-section.tsx',
    );
    expect(section).toMatch(/\{canMutate && \(/);
  });

  it('T42: el centro de monitoreo existe con tabla y resumen', () => {
    expect(monitoringPage).toMatch(/Monitoreo de precios/);
    expect(monitoringPage).toMatch(/Fuentes monitoreadas/);
    expect(monitoringPage).toMatch(/Próxima revisión/);
    expect(monitoringPage).toMatch(/export const dynamic = 'force-dynamic'/);
  });

  it('T43: el dashboard muestra los 4 KPIs de monitoreo + acceso rápido', () => {
    expect(dashboard).toMatch(/Fuentes monitoreadas/);
    expect(dashboard).toMatch(/Cambios de precio pendientes/);
    expect(dashboard).toMatch(/Fuentes con error/);
    expect(dashboard).toMatch(/Fuentes vencidas/);
    expect(dashboard).toMatch(/\/catalog\/monitoring/);
    expect(dashboard).toMatch(/Monitoreo de precios/);
  });

  it('T44: KPIs de monitoreo del dashboard van detrás de isAuthorizedForSavings (🔒)', () => {
    expect(dashboard).toMatch(/isAuthorizedForSavings && monitoringSummary &&/);
  });

  it('todas las Server Actions del monitor exigen viewer autorizado y modo db', () => {
    expect(actions).toMatch(/MUTATION_ROLES = \['management', 'internal'\]/);
    // Cada action pasa por resolveAuthorizedViewer (guard único).
    const actionCount = (actions.match(/export async function \w+Action/g) ?? []).length;
    const guardCount = (actions.match(/await resolveAuthorizedViewer\(\)/g) ?? []).length;
    expect(actionCount).toBeGreaterThanOrEqual(4);
    expect(guardCount).toBe(actionCount);
    // SSRF profundo antes de persistir el target.
    expect(actions).toMatch(/await validatePublicUrl\(sourceUrl\)/);
  });

  it('vercel.json declara el cron diario 11:00 UTC hacia el endpoint protegido', () => {
    const vercel = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(vercel.crons).toHaveLength(1);
    expect(vercel.crons[0]!.path).toBe('/api/cron/price-monitor');
    expect(vercel.crons[0]!.schedule).toBe('0 11 * * *');
  });
});
