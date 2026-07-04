/**
 * module-access-wiring.test.ts — Verifica que los guards V5.6.2 estén CABLEADOS.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_2_ROLE_ACCESS_MATRIX_HARDENING.md`.
 *
 * Estrategia: análisis estático de fuente (readFileSync) — igual que
 * `sidebar-access.test.ts`. NO conecta a Supabase ni a la base de datos. El
 * objetivo es que borrar un guard rompa el test (la regla vive server-side, no
 * solo en el sidebar).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
function readSrc(rel: string): string {
  return readFileSync(resolve(here, '../../../', rel), 'utf8');
}

// --- Fuentes ---
const catalogLayout = readSrc('app/(dashboard)/catalog/layout.tsx');
const priceIntelPage = readSrc('app/(dashboard)/catalog/resources/[resourceId]/price-intelligence/page.tsx');
const monitoringPage = readSrc('app/(dashboard)/catalog/monitoring/page.tsx');
const reviewPage = readSrc('app/(dashboard)/catalog/prices/review/page.tsx');
const sidebarNav = readSrc('components/shared/sidebar-nav.tsx');
const dashboardLayout = readSrc('app/(dashboard)/layout.tsx');
const catalogActions = readSrc('app/(dashboard)/catalog/actions.ts');
const monitoringActions = readSrc('app/(dashboard)/catalog/monitoring/actions.ts');
const reviewActions = readSrc('app/(dashboard)/catalog/prices/review/actions.ts');
const priceIntelActions = readSrc('app/(dashboard)/catalog/resources/[resourceId]/price-intelligence/actions.ts');
const notesActions = readSrc('app/(dashboard)/dashboard/notes-actions.ts');

describe('ROUTE GUARDS — páginas de módulos internos exigen módulo server-side', () => {
  it('catalog/layout.tsx exige el módulo "catalog"', () => {
    expect(catalogLayout).toMatch(/requireModuleAccess\(\s*['"]catalog['"]\s*\)/);
  });

  it('price-intelligence/page.tsx verifica "price-intelligence" y muestra denegacion inline', () => {
    expect(priceIntelPage).toMatch(/checkModuleAccess\(\s*['"]price-intelligence['"]\s*\)/);
    expect(priceIntelPage).toContain('PriceIntelligenceDenied');
  });

  it('monitoring/page.tsx exige "monitoring"', () => {
    expect(monitoringPage).toMatch(/requireModuleAccess\(\s*['"]monitoring['"]\s*\)/);
  });

  it('prices/review/page.tsx exige "operational-review"', () => {
    expect(reviewPage).toMatch(/requireModuleAccess\(\s*['"]operational-review['"]\s*\)/);
  });
});

describe('SIDEBAR — filtra módulos por canAccessModule', () => {
  it('sidebar-nav importa canAccessModule', () => {
    expect(sidebarNav).toContain('canAccessModule');
    expect(sidebarNav).toMatch(/from '@\/server\/access\/module-access'/);
  });

  it('sidebar-nav filtra NAV_ITEMS por el módulo', () => {
    expect(sidebarNav).toMatch(/filter\(\s*\(?it\)?\s*=>\s*canAccessModule\(profileRole,\s*it\.module\)/);
  });

  it('sidebar-nav conserva ACCESS_ITEM gateado por canManageAccess', () => {
    expect(sidebarNav).toContain('ACCESS_ITEM');
    expect(sidebarNav).toMatch(/canManageAccess\s*&&/);
  });

  it('layout resuelve y pasa profileRole al rail', () => {
    expect(dashboardLayout).toMatch(/profileRole=\{actor\.role\}/);
  });
});

describe('SERVER ACTION GUARDS — actions sensibles verifican módulo', () => {
  it('catalog/actions.ts verifica checkModuleAccess("catalog")', () => {
    expect(catalogActions).toMatch(/checkModuleAccess\(\s*['"]catalog['"]\s*\)/);
  });

  it('monitoring/actions.ts verifica checkModuleAccess("monitoring")', () => {
    expect(monitoringActions).toMatch(/checkModuleAccess\(\s*['"]monitoring['"]\s*\)/);
  });

  it('prices/review/actions.ts verifica checkModuleAccess("operational-review")', () => {
    expect(reviewActions).toMatch(/checkModuleAccess\(\s*['"]operational-review['"]\s*\)/);
  });

  it('price-intelligence/actions.ts verifica checkModuleAccess("price-intelligence")', () => {
    expect(priceIntelActions).toMatch(/checkModuleAccess\(\s*['"]price-intelligence['"]\s*\)/);
  });

  it('notes-actions.ts verifica checkModuleAccess("quick-notes")', () => {
    expect(notesActions).toMatch(/checkModuleAccess\(\s*['"]quick-notes['"]\s*\)/);
  });
});
