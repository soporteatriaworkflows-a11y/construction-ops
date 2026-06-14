/**
 * sidebar-access.test.ts — Nav, sidebar "Accesos" y dashboard copy.
 *
 * Propiedad: agent-orchestrator.
 * Hotfix: DASHBOARD_ACCESS_NAV_AND_PRICING_KPI_HOTFIX_V1.
 *
 * Cubre (FASE 5 del contrato):
 *   NAV  1. admin ve Accesos (canManageAccess logic)
 *        2. gerencia ve Accesos
 *        3. client no ve Accesos
 *        4. site no ve Accesos
 *        5. link apunta a /settings/access
 *        6. Layout pasa canManageAccess a SidebarNav
 *        7. Layout llama resolveCanManageAccess()
 *        8. /settings/access tiene guard canManageAccess
 *        9. sidebar-nav define ACCESS_ITEM con href correcto
 *
 *   DASHBOARD
 *        7. no contiene "fixture"
 *        8. no contiene "Oleada 3A"
 *        9. savings-section no contiene "fixture activo"
 *       10. savings-section muestra copy nuevo limpio
 *       11. savings-section no inventa ahorro (no datos dummy)
 *       12. savings-section tiene estado vacío limpio
 *
 *   PLANNING
 *       16. planning empty state usa framing limpio (sin "SCHEDULE_FROM_BOQ_V1" en UI)
 *
 * Estrategia: static source analysis (readFileSync) — igual que route-config.test.ts.
 * No se conecta a Supabase ni a la base de datos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canManageAccess,
  isProfileRole,
} from '@/server/access/permissions';

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(relPath: string): string {
  return readFileSync(resolve(here, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Fuentes relevantes
// ---------------------------------------------------------------------------
const sidebarNavSrc = readSrc('../../../components/shared/sidebar-nav.tsx');
const layoutSrc = readSrc('../../../app/(dashboard)/layout.tsx');
const accessPageSrc = readSrc('../../../app/(dashboard)/settings/access/page.tsx');
const savingsSectionSrc = readSrc('../../../modules/dashboard/savings-section.tsx');
const dashboardPageSrc = readSrc('../../../app/(dashboard)/dashboard/page.tsx');
const planningPageSrc = readSrc('../../../app/(dashboard)/planning/page.tsx');

// ---------------------------------------------------------------------------
// NAV — lógica pura de visibilidad
// ---------------------------------------------------------------------------

describe('NAV — canManageAccess: visibilidad de "Accesos" por rol', () => {
  it('1. admin puede gestionar accesos (ve "Accesos")', () => {
    expect(canManageAccess('admin')).toBe(true);
  });

  it('2. gerencia puede gestionar accesos (ve "Accesos")', () => {
    expect(canManageAccess('gerencia')).toBe(true);
  });

  it('3. client NO puede gestionar accesos (no ve "Accesos")', () => {
    expect(canManageAccess('consulta')).toBe(false);
  });

  it('4. site (obra) NO puede gestionar accesos (no ve "Accesos")', () => {
    expect(canManageAccess('obra')).toBe(false);
  });

  it('presupuestos y compras tampoco ven "Accesos"', () => {
    expect(canManageAccess('presupuestos')).toBe(false);
    expect(canManageAccess('compras')).toBe(false);
  });

  it('null/undefined → deny-by-default', () => {
    expect(canManageAccess(null)).toBe(false);
    expect(canManageAccess(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NAV — estructura del sidebar
// ---------------------------------------------------------------------------

describe('NAV — sidebar-nav.tsx define ACCESS_ITEM y lógica condicional', () => {
  it('5. ACCESS_ITEM apunta a /settings/access', () => {
    expect(sidebarNavSrc).toContain('/settings/access');
  });

  it('ACCESS_ITEM tiene label "Accesos"', () => {
    expect(sidebarNavSrc).toContain("label: 'Accesos'");
  });

  it('sidebar acepta prop canManageAccess (false por defecto)', () => {
    expect(sidebarNavSrc).toMatch(/canManageAccess\s*=\s*false/);
  });

  it('sidebar incluye ACCESS_ITEM solo cuando canManageAccess es true', () => {
    // La lógica spread: [...NAV_ITEMS, ACCESS_ITEM] condicionado a canManageAccess
    expect(sidebarNavSrc).toMatch(/canManageAccess\s*\?\s*\[/);
    expect(sidebarNavSrc).toContain('ACCESS_ITEM');
  });
});

// ---------------------------------------------------------------------------
// NAV — layout pasa canManageAccess
// ---------------------------------------------------------------------------

describe('NAV — layout.tsx resuelve y pasa canManageAccess al SidebarNav', () => {
  it('6. layout importa resolveAccessActor y canManageAccess', () => {
    expect(layoutSrc).toContain('resolveAccessActor');
    expect(layoutSrc).toContain('canManageAccess');
  });

  it('7. layout llama resolveCanManageAccess()', () => {
    expect(layoutSrc).toMatch(/resolveCanManageAccess\(\)/);
  });

  it('layout pasa showAccess / canManageAccess al SidebarNav', () => {
    expect(layoutSrc).toMatch(/canManageAccess\s*=\s*\{/);
    expect(layoutSrc).toContain('SidebarNav');
  });

  it('layout fuerza render dinámico (request-time)', () => {
    expect(layoutSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });
});

// ---------------------------------------------------------------------------
// NAV — guard backend en /settings/access
// ---------------------------------------------------------------------------

describe('NAV — /settings/access tiene guard backend (9)', () => {
  it('8. página de accesos verifica canManageAccess server-side', () => {
    expect(accessPageSrc).toContain('canManageAccess');
    expect(accessPageSrc).toContain('resolveAccessActor');
  });

  it('página de accesos rechaza rol no autorizado', () => {
    expect(accessPageSrc).toContain('Unauthorized');
    expect(accessPageSrc).toMatch(/if\s*\(\s*!canManageAccess/);
  });

  it('página de accesos fuerza render dinámico', () => {
    expect(accessPageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });
});

// ---------------------------------------------------------------------------
// DASHBOARD — copy limpio (sin texto stale)
// ---------------------------------------------------------------------------

describe('DASHBOARD — dashboard/page.tsx no contiene texto stale', () => {
  it('17. dashboard.tsx no contiene "fixture activo"', () => {
    expect(dashboardPageSrc).not.toContain('fixture activo');
  });

  it('18. dashboard.tsx no contiene "Oleada 3A"', () => {
    expect(dashboardPageSrc).not.toContain('Oleada 3A');
  });

  it('dashboard sigue renderizando SavingsSection para management/internal', () => {
    expect(dashboardPageSrc).toContain('SavingsSection');
    expect(dashboardPageSrc).toContain('isAuthorizedForSavings');
  });
});

// ---------------------------------------------------------------------------
// DASHBOARD — savings-section copy limpio
// ---------------------------------------------------------------------------

describe('DASHBOARD — savings-section.tsx copy correcto', () => {
  it('9. savings-section no contiene "fixture activo"', () => {
    expect(savingsSectionSrc).not.toContain('fixture activo');
  });

  it('9. savings-section no contiene "modo fixture"', () => {
    expect(savingsSectionSrc.toLowerCase()).not.toContain('modo fixture');
  });

  it('8. savings-section no contiene "Oleada 3A"', () => {
    expect(savingsSectionSrc).not.toContain('Oleada 3A');
  });

  it('10. savings-section muestra copy informativo actualizado', () => {
    expect(savingsSectionSrc).toContain('precios aprobados');
  });

  it('12. savings-section tiene estado vacío con role="status"', () => {
    expect(savingsSectionSrc).toMatch(/role\s*=\s*['"]status['"]/);
  });

  it('11. savings-section NO fuerza valores dummy de ahorro', () => {
    // No debe inventar números hardcodeados en el estado vacío
    expect(savingsSectionSrc).not.toMatch(/'\d{6,}'.*empty/i);
  });

  it('savings-section sigue mostrando los tres KPIs cuando hay datos', () => {
    expect(savingsSectionSrc).toContain('projectedSaving');
    expect(savingsSectionSrc).toContain('realizedSaving');
    expect(savingsSectionSrc).toContain('pricingCoverage');
  });

  it('savings-section protege campos con hasAnyData antes de renderizar', () => {
    expect(savingsSectionSrc).toMatch(/hasAnyData/);
  });
});

// ---------------------------------------------------------------------------
// PLANNING — empty state limpio
// ---------------------------------------------------------------------------

describe('PLANNING — planning/page.tsx empty state actualizado', () => {
  it('16. planning no expone referencia técnica "SCHEDULE_FROM_BOQ_V1" al usuario', () => {
    expect(planningPageSrc).not.toContain('SCHEDULE_FROM_BOQ_V1');
  });

  it('planning tiene empty state con mensaje claro para el usuario', () => {
    // SCHEDULE_FROM_BOQ_V1 Fase 4: /planning ahora lista cronogramas; el empty
    // state se muestra cuando no hay ninguno todavía.
    expect(planningPageSrc).toContain('Todavía no hay cronogramas');
  });

  it('planning usa EmptyState component', () => {
    expect(planningPageSrc).toContain('EmptyState');
  });

  it('planning fuerza render dinámico', () => {
    expect(planningPageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });
});

// ---------------------------------------------------------------------------
// REGRESIÓN — isProfileRole no acepta roles inválidos
// ---------------------------------------------------------------------------

describe('REGRESIÓN — isProfileRole solo acepta los 6 roles válidos', () => {
  it('roles válidos pasan', () => {
    for (const r of ['admin', 'gerencia', 'presupuestos', 'obra', 'compras', 'consulta']) {
      expect(isProfileRole(r)).toBe(true);
    }
  });

  it('roles inválidos son rechazados', () => {
    expect(isProfileRole('superuser')).toBe(false);
    expect(isProfileRole('root')).toBe(false);
    expect(isProfileRole(null)).toBe(false);
    expect(isProfileRole('')).toBe(false);
  });
});
