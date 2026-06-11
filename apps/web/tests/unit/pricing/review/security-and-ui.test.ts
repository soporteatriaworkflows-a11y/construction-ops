/**
 * security-and-ui.test.ts — Seguridad e interfaz del Centro de Revisión
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1). Mandato: pruebas 23–40.
 *
 * Source-scan (mismo patrón que monitor/ui-and-invariants.test.ts): valida
 * invariantes de código sin red ni DB.
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

const reviewDir = resolve(webRoot, 'server/pricing/review');
const reviewSources = readdirSync(reviewDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(reviewDir, f), 'utf8'))
  .join('\n');

const actions = read('app/(dashboard)/catalog/prices/review/actions.ts');
const page = read('app/(dashboard)/catalog/prices/review/page.tsx');
const table = read('app/(dashboard)/catalog/prices/review/_components/review-table.tsx');
const dashboard = read('app/(dashboard)/dashboard/page.tsx');
const catalogPage = read('app/(dashboard)/catalog/page.tsx');
const service = read('server/pricing/review/service.ts');
const dbRepo = read('server/pricing/review/db-repository.ts');

describe('T23 — organización SIEMPRE server-side', () => {
  it('las actions derivan el viewer con resolveAuthenticatedViewer', () => {
    expect(actions).toMatch(/resolveAuthenticatedViewer/);
  });

  it('ni actions ni dominio aceptan organizationId del navegador', () => {
    expect(actions).not.toMatch(/formData\.get\(['"]organizationId['"]\)/);
    expect(reviewSources).not.toMatch(/formData\.get\(['"]organizationId['"]\)/);
  });

  it('el repositorio filtra por viewer.organizationId en toda consulta', () => {
    const queries = dbRepo.match(/\.from\('[a-z_]+'\)/g) ?? [];
    expect(queries.length).toBeGreaterThan(0);
    // Cada acceso a tablas tenant-scoped va acompañado del filtro de org.
    const orgFilters = dbRepo.match(/\.eq\('organization_id', viewer\.organizationId\)/g) ?? [];
    expect(orgFilters.length).toBeGreaterThanOrEqual(queries.length - 1);
  });
});

describe('T24-T25 — roles', () => {
  it('T24: management/internal autorizados en el servicio', () => {
    expect(service).toMatch(/REVIEW_ROLES = \['management', 'internal'\]/);
    expect(service).toMatch(/InsufficientRoleError/);
  });

  it('T25: la página NO carga datos 🔒 para site/client (backend-first)', () => {
    expect(page).toMatch(/REVIEW_ROLES = \['management', 'internal'\]/);
    expect(page).toMatch(/REVIEW_ROLES\.includes\(viewerRole\)/);
    expect(page).toMatch(/Acceso restringido/);
  });
});

describe('T26 — cross-org bloqueado estructuralmente', () => {
  it('el UPDATE masivo filtra org + status pending en el MISMO statement', () => {
    const updateBlock = dbRepo.match(/bulkUpdateStatus[\s\S]*?return updated;/)?.[0];
    expect(updateBlock).toBeDefined();
    expect(updateBlock).toMatch(/\.eq\('organization_id', viewer\.organizationId\)/);
    expect(updateBlock).toMatch(/\.eq\('status', 'pending'\)/);
  });

  it('sin service-role en el módulo de revisión', () => {
    expect(reviewSources).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});

describe('T27-T30 — BOQ, AIU, exports y monitor intactos', () => {
  it('T27: el módulo de revisión NO importa ni escribe BOQ', () => {
    expect(reviewSources).not.toMatch(/@\/server\/estimates/);
    expect(reviewSources).not.toMatch(/boq_items|chapters\b/);
  });

  it('T28: NO toca AIU (indirect_cost_rules / aiu-calc / estimate_versions)', () => {
    expect(reviewSources).not.toMatch(/indirect_cost_rules|aiu-calc|estimate_versions/);
  });

  it('T29: NO toca exports', () => {
    expect(reviewSources).not.toMatch(/@\/server\/exports|@\/modules\/exports/);
  });

  it('T30: NO escribe tablas del monitor (solo SELECT del flag de origen)', () => {
    // Permitido: .from('price_monitor_results') con .select(...) para marcar
    // observaciones del monitor. Prohibido: insert/update/delete sobre él.
    const monitorBlocks = dbRepo.match(/\.from\('price_monitor_results'\)[\s\S]*?;/g) ?? [];
    expect(monitorBlocks.length).toBeGreaterThan(0);
    for (const b of monitorBlocks) {
      expect(b).toMatch(/\.select\(/);
      expect(b).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
    expect(reviewSources).not.toMatch(/price_monitor_targets|price_monitor_runs/);
  });

  it('solo tablas autorizadas en el repositorio de revisión', () => {
    const tables = [...dbRepo.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    const allowed = new Set([
      'resource_price_observations',
      'price_observation_batches',
      'price_observation_bulk_actions',
      'price_monitor_results',
    ]);
    for (const t of tables) {
      expect(allowed.has(t!), `tabla inesperada en review SQL: ${t}`).toBe(true);
    }
  });

  it('el dominio jamás borra físicamente (sin .delete())', () => {
    expect(reviewSources).not.toMatch(/\.delete\(\)/);
  });
});

describe('T31-T37 — UI del centro de revisión', () => {
  it('T31: la ruta /catalog/prices/review existe con render request-time', () => {
    expect(page).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(page).toMatch(/Revisión de precios/);
  });

  it('T32: tabla con columnas del mandato', () => {
    for (const col of [
      'Recurso',
      'Proveedor',
      'Precio observado',
      'Neto sugerido',
      'Unidad',
      'Fuente',
      'Lote',
      'Fecha',
      'Advertencias',
      'Acción',
    ]) {
      expect(table).toContain(col);
    }
  });

  it('T33: filtros visibles (lote, proveedor, fuente, advertencias, fecha, recurso, seleccionadas)', () => {
    expect(table).toMatch(/Lote \/ procedencia/);
    expect(table).toMatch(/>\s*Proveedor/);
    expect(table).toMatch(/Fuente/);
    expect(table).toMatch(/Con advertencias/);
    expect(table).toMatch(/Sin advertencias/);
    expect(table).toMatch(/Desde \(fecha observación\)/);
    expect(table).toMatch(/Código o nombre/);
    expect(table).toMatch(/Solo seleccionadas/);
  });

  it('T34: seleccionar todas las válidas y desmarcar todas', () => {
    expect(table).toMatch(/Seleccionar todas las válidas/);
    expect(table).toMatch(/Desmarcar todas/);
  });

  it('T35: modal de confirmación obligatorio con el texto del mandato', () => {
    expect(table).toMatch(/Vas a aprobar/);
    expect(table).toMatch(/baseline aprobado para futuras/);
    expect(table).toMatch(/La acción quedará registrada/);
    expect(table).toMatch(/Cancelar/);
    expect(table).toMatch(/Confirmar aprobación/);
    // La clave de idempotencia se genera al abrir el modal.
    expect(table).toMatch(/crypto\.randomUUID\(\)/);
  });

  it('T36: resultado visible (aprobadas/omitidas/errores) + CSV descargable', () => {
    expect(table).toMatch(/Omitidas:/);
    expect(table).toMatch(/Descargar reporte de la acción/);
    expect(table).toMatch(/reportCsv/);
  });

  it('T37: advertencias visibles por fila (icono + tooltip)', () => {
    expect(table).toMatch(/o\.warnings\.length/);
    expect(table).toMatch(/AlertTriangle/);
  });
});

describe('T38-T40 — accesos y branding', () => {
  it('T38: acceso desde el dashboard (QuickLink + KPI enlazado)', () => {
    expect(dashboard).toMatch(/\/catalog\/prices\/review/);
    expect(dashboard).toMatch(/Revisión de precios/);
  });

  it('T39: acceso desde el catálogo', () => {
    expect(catalogPage).toMatch(/\/catalog\/prices\/review/);
    expect(catalogPage).toMatch(/Revisión de precios/);
  });

  it('acceso desde price intelligence cuando hay pendientes', () => {
    const pi = read('app/(dashboard)/catalog/resources/[resourceId]/price-intelligence/page.tsx');
    expect(pi).toMatch(/\/catalog\/prices\/review/);
  });

  it('T40: branding ICONIC intacto (tokens iconic en la página)', () => {
    expect(page).toMatch(/iconic-/);
    expect(table).toMatch(/iconic-/);
  });
});

describe('importación con lote (BULK_APPROVAL_BY_IMPORT_BATCH_V1)', () => {
  const importIndex = read('server/catalog/import/index.ts');
  const importRepo = read('server/catalog/import/db-import-repository.ts');

  it('confirmCatalogImport crea batch manual con digest persistido', () => {
    expect(importIndex).toMatch(/sourceType: 'manual'/);
    expect(importIndex).toMatch(/digestSha256: parsed\.digest/);
  });

  it('confirmProviderPriceList crea batch supplier_csv con proveedor', () => {
    expect(importIndex).toMatch(/sourceType: 'supplier_csv'/);
    expect(importIndex).toMatch(/providerId: provider\.id/);
  });

  it('el INSERT de observaciones propaga import_batch_id', () => {
    expect(importRepo).toMatch(/import_batch_id: o\.importBatchId/);
  });

  it('la importación NUNCA aprueba automáticamente (status pending intacto)', () => {
    expect(importRepo).toMatch(/status: 'pending'/);
    expect(importRepo).not.toMatch(/status: 'approved'/);
  });
});
