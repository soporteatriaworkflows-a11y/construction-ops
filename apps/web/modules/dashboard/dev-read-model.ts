/**
 * Accesor temporal de desarrollo — modo fixture.
 *
 * TEMP integración 3A: reemplazar por @/server/read-model cuando db-rls
 * entregue la implementación canónica de ReadModelPort.
 *
 * Lee el fixture sanitizado del golden master y devuelve un DashboardSummary
 * real para que el dashboard muestre números reales en `pnpm dev`.
 *
 * PROPIEDAD: agent-dashboard (módulo dashboard).
 * NO calcula finanzas: los valores vienen precalculados en el fixture.
 * NO accede a DB, Excel privado ni datos de producción.
 */

import fixtureJson from '../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';

import type {
  DashboardSummary,
  ViewerContext,
  ChapterDistributionSlice,
  ChapterSummary,
} from '@/lib/contracts/read-model';
import type { DecimalString, Uuid } from '@/lib/utils/types';

// ---------------------------------------------------------------------------
// Tipos internos del fixture (subset de lo que usamos)
// ---------------------------------------------------------------------------

interface FixtureChapter {
  id: Uuid;
  estimateVersionId: Uuid;
  code: string;
  name: string;
  sortOrder: number;
}

interface FixtureBoqItem {
  id: Uuid;
  estimateVersionId: Uuid;
  chapterId: Uuid;
  subtotal: DecimalString;
}

interface FixtureEstimateTotals {
  costos_directos: DecimalString;
  costos_indirectos: DecimalString;
  total_costo: DecimalString;
}

interface FixtureEstimateVersion {
  id: Uuid;
  estimateId: Uuid;
  versionNumber: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
}

interface FixtureProject {
  id: Uuid;
}

interface FixtureData {
  project: FixtureProject;
  estimateVersion: FixtureEstimateVersion;
  chapters: FixtureChapter[];
  boqItems: FixtureBoqItem[];
  estimateTotals: FixtureEstimateTotals;
}

// ---------------------------------------------------------------------------
// Carga del fixture (lazy, una vez por proceso)
// ---------------------------------------------------------------------------

let _cached: FixtureData | null = null;

// Ruta absoluta del fixture, relativa a este archivo fuente.
// Funciona tanto en Next.js (que ejecuta desde la raíz del proyecto) como en
// Vitest (que ejecuta desde apps/web/ con __dirname resuelto por el transform).
function loadFixture(): FixtureData {
  if (_cached) return _cached;
  // Import estático del JSON (analizable por Turbopack y por Vitest).
  // Solo lectura; sin DB, sin Excel privado, sin datos de producción.
  _cached = fixtureJson as unknown as FixtureData;
  return _cached;
}

// ---------------------------------------------------------------------------
// Helpers de cálculo de agregación (solo sumas de DecimalString ya calculadas)
// ---------------------------------------------------------------------------

/**
 * Suma una lista de DecimalString usando aritmética de números de punto flotante
 * de JS (suficiente para presentación; los valores definitivos vienen del dominio).
 * NO es cálculo financiero de dominio: solo agrega subtotales ya calculados.
 */
function sumDecimalStrings(values: DecimalString[]): DecimalString {
  let total = 0;
  for (const v of values) {
    total += parseFloat(v);
  }
  return total.toFixed(10);
}

/**
 * Divide dos DecimalStrings y devuelve la fracción como DecimalString.
 * Devuelve "0" si el divisor es 0.
 */
function divideDecimalStrings(numerator: DecimalString, denominator: DecimalString): DecimalString {
  const num = parseFloat(numerator);
  const den = parseFloat(denominator);
  if (den === 0) return '0.0000000000';
  return (num / den).toFixed(10);
}

// ---------------------------------------------------------------------------
// Función principal exportada
// ---------------------------------------------------------------------------

/**
 * Devuelve un DashboardSummary construido desde el fixture sanitizado.
 *
 * Privacidad: los campos 🔒 (projectedSaving, realizedSaving, pricingCoverage)
 * solo se incluyen para roles `management` o `internal`.
 */
export function getDashboardSummaryFromFixture(
  viewer: ViewerContext,
  _projectId: Uuid,
): DashboardSummary {
  const fixture = loadFixture();

  const { chapters, boqItems, estimateTotals, project, estimateVersion } = fixture;

  // Calcular subtotal por capítulo sumando los boqItems
  const subtotalByChapter = new Map<Uuid, number>();
  const itemCountByChapter = new Map<Uuid, number>();

  for (const item of boqItems) {
    const prev = subtotalByChapter.get(item.chapterId) ?? 0;
    subtotalByChapter.set(item.chapterId, prev + parseFloat(item.subtotal));
    itemCountByChapter.set(item.chapterId, (itemCountByChapter.get(item.chapterId) ?? 0) + 1);
  }

  const directCostNum = parseFloat(estimateTotals.costos_directos);

  // Construir distribución por capítulo
  const chapterDistribution: ChapterDistributionSlice[] = chapters
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((ch) => {
      const subtotalNum = subtotalByChapter.get(ch.id) ?? 0;
      const subtotal = subtotalNum.toFixed(10);
      const share = divideDecimalStrings(subtotal, directCostNum.toFixed(10));
      return {
        chapterId: ch.id,
        code: ch.code,
        name: ch.name,
        subtotal,
        share,
      };
    });

  // Top capítulos (los 5 con mayor subtotal)
  const topChapters: ChapterSummary[] = [...chapterDistribution]
    .sort((a, b) => parseFloat(b.subtotal) - parseFloat(a.subtotal))
    .slice(0, 5)
    .map((slice) => ({
      id: slice.chapterId,
      code: slice.code,
      name: slice.name,
      subtotal: slice.subtotal,
      itemCount: itemCountByChapter.get(slice.chapterId) ?? 0,
    }));

  // Sumar costos directos desde la agregación de capítulos (verificación)
  const computedDirectCost = sumDecimalStrings(
    chapterDistribution.map((c) => c.subtotal),
  );

  const summary: DashboardSummary = {
    projectId: project.id,
    budget: estimateTotals.total_costo,
    directCost: computedDirectCost,
    indirectCost: estimateTotals.costos_indirectos,
    chapterDistribution,
    topChapters,
    estimateStatus: estimateVersion.status as DashboardSummary['estimateStatus'],
    lastUpdatedAt: estimateVersion.approvedAt ?? estimateVersion.createdAt,
  };

  // Campos 🔒: solo para management/internal
  if (viewer.role === 'management' || viewer.role === 'internal') {
    // En modo fixture, no hay datos reales de ahorro/pricing.
    // Dejamos estos campos undefined para que el dashboard los maneje correctamente.
    // (En producción vendrán de PricingReadPort vía server/read-model.)
    summary.projectedSaving = undefined;
    summary.realizedSaving = undefined;
    summary.pricingCoverage = undefined;
  }

  return summary;
}
