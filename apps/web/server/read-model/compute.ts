/**
 * compute.ts — Derivación de los DTOs financieros del read-model a partir de
 * filas crudas, USANDO cost-domain como única fuente de verdad de los cálculos.
 *
 * Propiedad: agent-db-rls. El read-model NO reimplementa fórmulas financieras:
 * delega en `@/modules/boq` (`calculateBoq`, `calculateEstimateTotals`) y en
 * `@/modules/apu` (`calculateApuUnitCost`). Aquí sólo se ORQUESTA el mapeo
 * fila → entrada de cost-domain → DTO, compartido por las dos implementaciones
 * del puerto (fixture y Drizzle) para garantizar idénticos resultados.
 *
 * Las tasas AIU/IVA NO se hardcodean: provienen de las reglas
 * `indirect_cost_rules` de la versión. La base de la utilidad se deriva de
 * `baseType + sortOrder` dentro de cost-domain (sin flags ni códigos).
 */

import {
  calculateBoq,
  calculateEstimateTotals,
  calculateIndirectCosts,
  calculateTotal,
  type IndirectCostRuleInput,
} from '@/modules/boq';
import { calculateApuUnitCost, toDecimal, toDecimalString } from '@/modules/apu';
import type {
  ChapterDistributionSlice,
  ChapterSummary,
  DashboardSummary,
  DecimalString,
  EstimateSummary,
  EstimateVersionStatus,
  IsoDateTime,
  Uuid,
} from '@/lib/contracts/read-model';

/* ----------------------------------------------------------------------------
 * Tipos de fila crudos (espejo de las columnas relevantes del esquema)
 * ------------------------------------------------------------------------- */

/** Fila mínima de capítulo. */
export interface RawChapter {
  id: Uuid;
  code: string;
  name: string;
  sortOrder: number;
}

/** Fila mínima de ítem BOQ. */
export interface RawBoqItem {
  id: Uuid;
  chapterId: Uuid;
  code: string;
  descriptionSnapshot: string;
  unitSnapshot: string;
  quantitySnapshot: DecimalString;
  unitPriceSnapshot: DecimalString;
  subtotal: DecimalString;
  sortOrder: number;
}

/** Fila mínima de regla de costo indirecto. */
export interface RawIndirectRule {
  code: string;
  name: string;
  percentage: DecimalString;
  baseType: 'direct_cost' | 'utility' | 'custom';
  sortOrder: number;
  visibleToClient: boolean;
}

/** Entrada para derivar los totales y vistas de una versión de presupuesto. */
export interface EstimateComputationInput {
  estimateId: Uuid;
  versionId: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  chapters: readonly RawChapter[];
  items: readonly RawBoqItem[];
  indirectRules: readonly RawIndirectRule[];
  /** Área construida (>0) para el valor por m². Opcional. */
  builtArea?: DecimalString | null;
  /** Última actualización de la versión (para el dashboard). */
  lastUpdatedAt: IsoDateTime;
}

/* ----------------------------------------------------------------------------
 * Helpers de mapeo a cost-domain
 * ------------------------------------------------------------------------- */

function toIndirectRuleInputs(
  rules: readonly RawIndirectRule[],
): IndirectCostRuleInput[] {
  return rules.map((r) => ({
    code: r.code,
    name: r.name,
    percentage: r.percentage,
    baseType: r.baseType,
    sortOrder: r.sortOrder,
    visibleToClient: r.visibleToClient,
  }));
}

/**
 * Busca el monto de una línea AIU por su `baseType` y posición, sin asumir
 * códigos textuales ('A','U','IVA'). Devuelve "0" si no hay coincidencia.
 *
 * - Administración / Imprevistos / Utilidad: líneas `direct_cost` en orden.
 * - IVA sobre utilidad: línea `utility`.
 *
 * Para mapear a los campos nombrados de `EstimateSummary` se usa la convención
 * del golden master (3 líneas `direct_cost` ⇒ A, I, U; 1 línea `utility` ⇒ IVA),
 * derivada de `sortOrder`. Si hay menos líneas, los faltantes quedan en "0".
 */
function pickAiuAmounts(lines: { baseType: string; amount: DecimalString; sortOrder: number }[]): {
  administration: DecimalString;
  contingency: DecimalString;
  utility: DecimalString;
  taxOnUtility: DecimalString;
} {
  const directCostLines = lines
    .filter((l) => l.baseType === 'direct_cost')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const utilityLines = lines
    .filter((l) => l.baseType === 'utility')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    administration: directCostLines[0]?.amount ?? '0',
    contingency: directCostLines[1]?.amount ?? '0',
    utility: directCostLines[2]?.amount ?? '0',
    taxOnUtility: utilityLines[0]?.amount ?? '0',
  };
}

/* ----------------------------------------------------------------------------
 * Derivaciones públicas
 * ------------------------------------------------------------------------- */

/** Resultado conjunto: resumen + capítulos + ítems + distribución de capítulos. */
export interface EstimateComputation {
  summary: EstimateSummary;
  chapters: ChapterSummary[];
  /** subtotal por capítulo (en orden de `sortOrder`). */
  chapterDistribution: ChapterDistributionSlice[];
}

/**
 * Deriva el `EstimateSummary`, los `ChapterSummary[]` y la distribución por
 * capítulo a partir de filas crudas, usando cost-domain para todos los totales.
 * Función PURA respecto a la entrada (no toca DB ni red).
 *
 * @param input - Filas de la versión (capítulos, ítems, reglas AIU, área).
 * @returns Resumen financiero + vistas de capítulo (cliente-safe).
 */
export function computeEstimate(input: EstimateComputationInput): EstimateComputation {
  // 1) BOQ y costos directos (cost-domain).
  const boq = calculateBoq(
    input.items.map((it) => ({
      chapterId: it.chapterId,
      quantitySnapshot: it.quantitySnapshot,
      unitPriceSnapshot: it.unitPriceSnapshot,
    })),
  );
  const directCost = boq.directCosts;

  // 2) AIU/IVA, total y valor m² (cost-domain). Si no hay área, se omite m².
  const indirectRules = toIndirectRuleInputs(input.indirectRules);
  const hasArea =
    input.builtArea !== undefined &&
    input.builtArea !== null &&
    toDecimal(input.builtArea).greaterThan(0);

  let administration = '0';
  let contingency = '0';
  let utility = '0';
  let taxOnUtility = '0';
  let grandTotal = directCost;
  let totalArea: DecimalString | undefined;
  let costPerSquareMeter: DecimalString | undefined;

  if (hasArea) {
    const totals = calculateEstimateTotals({
      directCosts: directCost,
      indirectRules,
      builtArea: input.builtArea as DecimalString,
    });
    const aiu = pickAiuAmounts(totals.indirect.lines);
    administration = aiu.administration;
    contingency = aiu.contingency;
    utility = aiu.utility;
    taxOnUtility = aiu.taxOnUtility;
    grandTotal = totals.totalCost;
    totalArea = totals.builtArea;
    costPerSquareMeter = totals.valuePerSqm;
  } else if (indirectRules.length > 0) {
    // Sin área: aún derivamos AIU y total (pero sin valor m²).
    const indirect = calculateIndirectCosts(directCost, indirectRules);
    const aiu = pickAiuAmounts(indirect.lines);
    administration = aiu.administration;
    contingency = aiu.contingency;
    utility = aiu.utility;
    taxOnUtility = aiu.taxOnUtility;
    grandTotal = calculateTotal(directCost, indirect.totalIndirect);
  }

  const summary: EstimateSummary = {
    estimateId: input.estimateId,
    versionId: input.versionId,
    versionNumber: input.versionNumber,
    status: input.status,
    directCost,
    administration,
    contingency,
    utility,
    taxOnUtility,
    grandTotal,
    ...(totalArea !== undefined ? { totalArea } : {}),
    ...(costPerSquareMeter !== undefined ? { costPerSquareMeter } : {}),
  };

  // 3) Subtotales por capítulo en el orden declarado.
  const subtotalByChapter = new Map<Uuid, DecimalString>(
    boq.chapterSubtotals.map((c) => [c.chapterId, c.subtotal]),
  );
  const itemCountByChapter = new Map<Uuid, number>();
  for (const it of input.items) {
    itemCountByChapter.set(it.chapterId, (itemCountByChapter.get(it.chapterId) ?? 0) + 1);
  }

  const orderedChapters = [...input.chapters].sort((a, b) => a.sortOrder - b.sortOrder);

  const chapters: ChapterSummary[] = orderedChapters.map((ch) => ({
    id: ch.id,
    code: ch.code,
    name: ch.name,
    subtotal: subtotalByChapter.get(ch.id) ?? '0',
    itemCount: itemCountByChapter.get(ch.id) ?? 0,
  }));

  const direct = toDecimal(directCost);
  const chapterDistribution: ChapterDistributionSlice[] = chapters.map((ch) => ({
    chapterId: ch.id,
    code: ch.code,
    name: ch.name,
    subtotal: ch.subtotal,
    share: direct.isZero()
      ? '0'
      : toDecimalString(toDecimal(ch.subtotal).dividedBy(direct)),
  }));

  return { summary, chapters, chapterDistribution };
}

/**
 * Construye el `DashboardSummary` COMPLETO (con campos 🔒) a partir de un
 * cómputo de estimación. La proyección por rol (omitir 🔒 para `client`) la
 * aplica el repositorio vía `projectDashboardForRole`.
 *
 * @param projectId - Proyecto del dashboard.
 * @param computation - Resultado de {@link computeEstimate}.
 * @param input - Entrada original (estado y `lastUpdatedAt`).
 * @param internal - Métricas internas opcionales (ahorros, cobertura de precios).
 * @returns Dashboard completo (sin proyectar por rol).
 */
export function computeDashboard(
  projectId: Uuid,
  computation: EstimateComputation,
  input: Pick<EstimateComputationInput, 'status' | 'lastUpdatedAt'>,
  internal?: {
    projectedSaving?: DecimalString;
    realizedSaving?: DecimalString;
    pricingCoverage?: DecimalString;
  },
): DashboardSummary {
  const { summary, chapters, chapterDistribution } = computation;
  const indirectCost = toDecimalString(
    toDecimal(summary.grandTotal).minus(toDecimal(summary.directCost)),
  );

  // Top capítulos por subtotal (desc), tope 5.
  const topChapters = [...chapters]
    .sort((a, b) => (toDecimal(b.subtotal).greaterThan(toDecimal(a.subtotal)) ? 1 : -1))
    .slice(0, 5);

  return {
    projectId,
    budget: summary.grandTotal,
    directCost: summary.directCost,
    indirectCost,
    chapterDistribution,
    topChapters,
    estimateStatus: input.status,
    lastUpdatedAt: input.lastUpdatedAt,
    ...(internal?.projectedSaving !== undefined
      ? { projectedSaving: internal.projectedSaving }
      : {}),
    ...(internal?.realizedSaving !== undefined
      ? { realizedSaving: internal.realizedSaving }
      : {}),
    ...(internal?.pricingCoverage !== undefined
      ? { pricingCoverage: internal.pricingCoverage }
      : {}),
  };
}

/**
 * Calcula el costo unitario de un APU sumando sus componentes (cost-domain).
 *
 * @param componentCosts - `totalComponentCost` de cada componente.
 * @returns Costo unitario del APU como `DecimalString`.
 */
export function computeApuUnitCost(componentCosts: readonly DecimalString[]): DecimalString {
  return calculateApuUnitCost(componentCosts);
}
