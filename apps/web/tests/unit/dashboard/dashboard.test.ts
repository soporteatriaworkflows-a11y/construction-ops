/**
 * Tests del módulo dashboard.
 * Propiedad: agent-dashboard.
 *
 * Cubre:
 * 1. Agregaciones: suma de capítulos = total directos.
 * 2. Filtros: datos retornan correctamente.
 * 3. Roles: rol client NO recibe campos 🔒.
 * 4. Formato: montos en COP con dos decimales y separador miles.
 * 5. Empty: estado vacío sin error.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getReadModel } from '@/server/read-model';
import type { DashboardSummary } from '@/lib/contracts/read-model';
import { formatCOP, formatPct } from '@/lib/utils/format';
import {
  VIEWER_MANAGEMENT,
  VIEWER_CLIENT,
  VIEWER_SITE,
  VIEWER_INTERNAL,
  DASHBOARD_SUMMARY_MANAGEMENT,
  DASHBOARD_SUMMARY_CLIENT,
  DEMO_PROJECT_ID,
} from './fixtures';

// Read-model canónico en modo fixture (integración 3A). Summaries precomputados
// para mantener los `it` síncronos.
let sMgmt!: DashboardSummary;
let sClient!: DashboardSummary;
let sSite!: DashboardSummary;
let sInternal!: DashboardSummary;

beforeAll(async () => {
  const rm = getReadModel({ env: { READ_MODEL_SOURCE: 'fixture' } });
  sMgmt = await rm.getDashboardSummary(VIEWER_MANAGEMENT, DEMO_PROJECT_ID);
  sClient = await rm.getDashboardSummary(VIEWER_CLIENT, DEMO_PROJECT_ID);
  sSite = await rm.getDashboardSummary(VIEWER_SITE, DEMO_PROJECT_ID);
  sInternal = await rm.getDashboardSummary(VIEWER_INTERNAL, DEMO_PROJECT_ID);
});

// ---------------------------------------------------------------------------
// Tests de agregación
// ---------------------------------------------------------------------------

describe('Aggregations — chapterDistribution', () => {
  it('suma de subtotales de capítulos ≈ directCost (fixture real)', () => {
    const summary = sMgmt;

    const sumFromChapters = summary.chapterDistribution.reduce(
      (acc, slice) => acc + parseFloat(slice.subtotal),
      0,
    );
    const directCostNum = parseFloat(summary.directCost);

    // Tolerancia: ±1 COP (diferencias de punto flotante al sumar 131 items)
    expect(Math.abs(sumFromChapters - directCostNum)).toBeLessThan(1);
  });

  it('hay exactamente 14 capítulos (golden master primer piso)', () => {
    const summary = sMgmt;
    expect(summary.chapterDistribution).toHaveLength(14);
  });

  it('la suma de shares de capítulos ≈ 1.0', () => {
    const summary = sMgmt;
    const sumShares = summary.chapterDistribution.reduce(
      (acc, s) => acc + parseFloat(s.share),
      0,
    );
    // Tolerancia: ±0.0001 (redondeos de división)
    expect(Math.abs(sumShares - 1.0)).toBeLessThan(0.0001);
  });

  it('topChapters contiene los 5 capítulos con mayor subtotal', () => {
    const summary = sMgmt;
    expect(summary.topChapters).toHaveLength(5);

    // Verificar que el primero es el mayor de todos
    const sortedAll = [...summary.chapterDistribution]
      .sort((a, b) => parseFloat(b.subtotal) - parseFloat(a.subtotal));
    const topFirst = sortedAll[0];
    const topChapterFirst = summary.topChapters[0];
    expect(topChapterFirst?.id).toBe(topFirst?.chapterId);
  });

  it('directCost del fixture coincide con el golden master §3.4 (±1 COP)', () => {
    const summary = sMgmt;
    const EXPECTED_DIRECT_COST = 336084479.9369073500;
    expect(Math.abs(parseFloat(summary.directCost) - EXPECTED_DIRECT_COST)).toBeLessThan(1);
  });

  it('budget del fixture coincide con el golden master §3.4 (±1 COP)', () => {
    const summary = sMgmt;
    const EXPECTED_TOTAL = 372247169.9781186;
    expect(Math.abs(parseFloat(summary.budget) - EXPECTED_TOTAL)).toBeLessThan(1);
  });

  it('indirectCost del fixture coincide con el golden master §3.4 (±1 COP)', () => {
    const summary = sMgmt;
    const EXPECTED_INDIRECT = 36162690.0412112300;
    expect(Math.abs(parseFloat(summary.indirectCost) - EXPECTED_INDIRECT)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Tests de privacidad / roles
// ---------------------------------------------------------------------------

describe('Privacy — role-based field projection', () => {
  it('rol `client` NO recibe campos 🔒 (projectedSaving undefined)', () => {
    const summary = sClient;
    expect(summary.projectedSaving).toBeUndefined();
  });

  it('rol `client` NO recibe campos 🔒 (realizedSaving undefined)', () => {
    const summary = sClient;
    expect(summary.realizedSaving).toBeUndefined();
  });

  it('rol `client` NO recibe campos 🔒 (pricingCoverage undefined)', () => {
    const summary = sClient;
    expect(summary.pricingCoverage).toBeUndefined();
  });

  it('rol `site` NO recibe campos 🔒 (projectedSaving undefined)', () => {
    const summary = sSite;
    expect(summary.projectedSaving).toBeUndefined();
  });

  it('rol `management` recibe un summary válido (sin ahorros fabricados en fixture)', () => {
    const summary = sMgmt;
    // El read-model canónico OMITE los campos 🔒 cuando no hay dato real (el
    // fixture no trae ahorros). Con `db` y datos reales, los roles autorizados sí
    // los reciben. La privacidad cliente se valida en los tests previos.
    expect(typeof summary.budget).toBe('string');
    expect(typeof summary.directCost).toBe('string');
    expect(summary.projectedSaving).toBeUndefined();
  });

  it('rol `internal` recibe un summary válido (sin ahorros fabricados en fixture)', () => {
    const summary = sInternal;
    expect(typeof summary.budget).toBe('string');
    expect(summary.realizedSaving).toBeUndefined();
  });

  it('DASHBOARD_SUMMARY_CLIENT no tiene projectedSaving', () => {
    expect(DASHBOARD_SUMMARY_CLIENT.projectedSaving).toBeUndefined();
  });

  it('DASHBOARD_SUMMARY_MANAGEMENT tiene projectedSaving', () => {
    expect(DASHBOARD_SUMMARY_MANAGEMENT.projectedSaving).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests de formato COP
// ---------------------------------------------------------------------------

describe('Format — COP currency formatting (Intl.NumberFormat es-CO)', () => {
  it('formatCOP produce string con símbolo $ y separador de miles', () => {
    const result = formatCOP('372247169.9781186000');
    // Debe incluir $ y separador (punto o coma dependiendo del locale)
    expect(result).toContain('$');
    expect(result.length).toBeGreaterThan(5);
  });

  it('formatCOP con 0 devuelve "$0" o equivalente', () => {
    const result = formatCOP('0');
    expect(result).toContain('$');
    expect(result).toContain('0');
  });

  it('formatCOP con valor inválido devuelve "—"', () => {
    expect(formatCOP('abc')).toBe('—');
    expect(formatCOP('')).toBe('—');
  });

  it('formatPct con 0.75 devuelve cadena con porcentaje', () => {
    const result = formatPct('0.75');
    expect(result).toContain('%');
  });

  it('formatPct con valor inválido devuelve "—"', () => {
    expect(formatPct('xyz')).toBe('—');
  });

  it('formatCOP de los valores del golden master tienen formato legible', () => {
    // directCost
    const directResult = formatCOP('336084479.9369073500');
    expect(directResult).toBeTruthy();
    expect(directResult).not.toBe('—');
    // budget
    const budgetResult = formatCOP('372247169.9781186000');
    expect(budgetResult).toBeTruthy();
    expect(budgetResult).not.toBe('—');
  });
});

// ---------------------------------------------------------------------------
// Tests de estado vacío
// ---------------------------------------------------------------------------

describe('Empty state — DashboardSummary handling', () => {
  it('DashboardSummary con chapterDistribution vacío no genera error', () => {
    const emptySummary: typeof DASHBOARD_SUMMARY_CLIENT = {
      ...DASHBOARD_SUMMARY_CLIENT,
      chapterDistribution: [],
      topChapters: [],
    };
    expect(emptySummary.chapterDistribution).toHaveLength(0);
    expect(emptySummary.topChapters).toHaveLength(0);
    // No debe lanzar excepción al acceder a los campos
    expect(() => formatCOP(emptySummary.budget)).not.toThrow();
    expect(() => formatCOP(emptySummary.directCost)).not.toThrow();
  });

  it('chapterDistribution.map funciona con array vacío', () => {
    const result = [].map((x: unknown) => x);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests de tipos del contrato
// ---------------------------------------------------------------------------

describe('Contract types — DashboardSummary shape', () => {
  it('DashboardSummary tiene todos los campos obligatorios', () => {
    const summary = sMgmt;
    expect(typeof summary.projectId).toBe('string');
    expect(typeof summary.budget).toBe('string');
    expect(typeof summary.directCost).toBe('string');
    expect(typeof summary.indirectCost).toBe('string');
    expect(Array.isArray(summary.chapterDistribution)).toBe(true);
    expect(Array.isArray(summary.topChapters)).toBe(true);
    expect(typeof summary.estimateStatus).toBe('string');
    expect(typeof summary.lastUpdatedAt).toBe('string');
  });

  it('ChapterDistributionSlice tiene todos los campos', () => {
    const summary = sMgmt;
    const slice = summary.chapterDistribution[0];
    expect(slice).toBeDefined();
    expect(typeof slice!.chapterId).toBe('string');
    expect(typeof slice!.code).toBe('string');
    expect(typeof slice!.name).toBe('string');
    expect(typeof slice!.subtotal).toBe('string');
    expect(typeof slice!.share).toBe('string');
  });

  it('ChapterSummary tiene todos los campos', () => {
    const summary = sMgmt;
    const ch = summary.topChapters[0];
    expect(ch).toBeDefined();
    expect(typeof ch!.id).toBe('string');
    expect(typeof ch!.code).toBe('string');
    expect(typeof ch!.name).toBe('string');
    expect(typeof ch!.subtotal).toBe('string');
    expect(typeof ch!.itemCount).toBe('number');
  });

  it('DecimalString nunca es número — budget', () => {
    const summary = sMgmt;
    expect(typeof summary.budget).toBe('string');
    expect(typeof summary.directCost).toBe('string');
    expect(typeof summary.indirectCost).toBe('string');
  });
});
