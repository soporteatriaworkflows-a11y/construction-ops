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
import {
  calculateApuUnitCost,
  calculateApuUnitCostFull,
  type ApuComponentCostEntry,
} from '@/modules/apu';
import { toDecimal, toDecimalString } from '@/modules/apu';
import { canonicalizeUnit } from '@/server/pricing/units';
import type {
  ApuComponentType,
  ApuComponentView,
  ApuDetail,
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

/* ----------------------------------------------------------------------------
 * APU detalle (FASE 4B.1 — APU_COST_MODEL_FOUNDATION_V1_CONTRACT §10)
 * ------------------------------------------------------------------------- */

/** Fila mínima de plantilla APU para el detalle. */
export interface RawApuTemplate {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  version: number;
  defaultToolPct: DecimalString;
}

/** Fila mínima de componente APU para el detalle. */
export interface RawApuComponent {
  id: Uuid;
  componentType: ApuComponentType;
  resourceCode?: string | null;
  resourceName?: string | null;
  laborRoleCode?: string | null;
  laborRoleName?: string | null;
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
  sortOrder: number;
  // APU_SMART_DEFAULTS_V1B (aditivo, nullable). NULL ⇒ recommended = wastePct.
  recommendedWastePct?: DecimalString | null;
  wastePctSource?: string | null;
  wastePctNote?: string | null;
  // APU_PRODUCTIVITY_CREW_OVERRIDES_V1C (aditivo, nullable). NULL ⇒ heredado.
  recommendedLaborQuantity?: DecimalString | null;
  recommendedProductivity?: DecimalString | null;
  appliedProductivity?: DecimalString | null;
  productivityUnit?: string | null;
  recommendedCrewSize?: DecimalString | null;
  appliedCrewSize?: DecimalString | null;
  productivitySource?: string | null;
  productivityNote?: string | null;
  // APU_MATERIAL_CONSUMPTION_OVERRIDES_V1 (aditivo, nullable). NULL ⇒ heredado.
  recommendedMaterialQuantity?: DecimalString | null;
  materialQuantitySource?: string | null;
  materialQuantityNote?: string | null;
}

/** Conteo por tipo de componente + materiales sin precio (biblioteca APU). */
export interface ApuComponentSummaryCounts {
  typeCounts: Record<ApuComponentType, number>;
  /** Componentes material con `unit_price_snapshot` ausente o ≤ 0. */
  materialsWithoutPrice: number;
}

/**
 * Resume los componentes de un APU por tipo y cuenta materiales sin precio.
 * PURA, sin DB, sin recalcular finanzas (solo cuenta). Se deriva de componentes
 * ya cargados (sin consultas extra), para enriquecer `ApuSummary` en la biblioteca.
 */
export function summarizeApuComponents(
  components: readonly Pick<RawApuComponent, 'componentType' | 'unitPriceSnapshot'>[],
): ApuComponentSummaryCounts {
  const typeCounts: Record<ApuComponentType, number> = {
    material: 0, labor: 0, equipment: 0, tool: 0, subcontract: 0, other: 0,
  };
  let materialsWithoutPrice = 0;
  for (const c of components) {
    typeCounts[c.componentType] = (typeCounts[c.componentType] ?? 0) + 1;
    if (c.componentType === 'material') {
      const price = Number(c.unitPriceSnapshot);
      if (!Number.isFinite(price) || price <= 0) materialsWithoutPrice += 1;
    }
  }
  return { typeCounts, materialsWithoutPrice };
}

/**
 * Deriva el `ApuDetail` COMPLETO (con campos 🔒 de rol laboral) a partir de
 * filas crudas, delegando el costo unitario completo (incluida la herramienta
 * menor derivada `defaultToolPct × M.O.`) en cost-domain. La proyección por
 * rol la aplica el repositorio (`projectApuDetailForRole`).
 *
 * @param template - Plantilla APU cruda (incluye `defaultToolPct`).
 * @param components - Componentes crudos (costos calculados server-side).
 * @returns Detalle completo (sin proyectar por rol).
 */
export function computeApuDetail(
  template: RawApuTemplate,
  components: readonly RawApuComponent[],
): ApuDetail {
  const ordered = [...components].sort((a, b) => a.sortOrder - b.sortOrder);

  const entries: ApuComponentCostEntry[] = ordered.map((c) => ({
    componentType: c.componentType,
    totalComponentCost: c.totalComponentCost,
  }));
  const breakdown = calculateApuUnitCostFull(entries, template.defaultToolPct);

  const views: ApuComponentView[] = ordered.map((c) => ({
    id: c.id,
    componentType: c.componentType,
    ...(c.resourceCode ? { resourceCode: c.resourceCode } : {}),
    ...(c.resourceName ? { resourceName: c.resourceName } : {}),
    ...(c.laborRoleCode ? { laborRoleCode: c.laborRoleCode } : {}),
    ...(c.laborRoleName ? { laborRoleName: c.laborRoleName } : {}),
    quantity: c.quantity,
    wastePct: c.wastePct,
    ...(c.recommendedWastePct != null ? { wastePctRecommended: c.recommendedWastePct } : {}),
    ...(c.wastePctSource ? { wastePctSource: c.wastePctSource } : {}),
    ...(c.wastePctNote ? { wastePctNote: c.wastePctNote } : {}),
    ...(c.recommendedLaborQuantity != null ? { recommendedLaborQuantity: c.recommendedLaborQuantity } : {}),
    ...(c.recommendedProductivity != null ? { recommendedProductivity: c.recommendedProductivity } : {}),
    ...(c.appliedProductivity != null ? { appliedProductivity: c.appliedProductivity } : {}),
    ...(c.productivityUnit ? { productivityUnit: c.productivityUnit } : {}),
    ...(c.recommendedCrewSize != null ? { recommendedCrewSize: c.recommendedCrewSize } : {}),
    ...(c.appliedCrewSize != null ? { appliedCrewSize: c.appliedCrewSize } : {}),
    ...(c.productivitySource ? { productivitySource: c.productivitySource } : {}),
    ...(c.productivityNote ? { productivityNote: c.productivityNote } : {}),
    ...(c.recommendedMaterialQuantity != null ? { recommendedMaterialQuantity: c.recommendedMaterialQuantity } : {}),
    ...(c.materialQuantitySource ? { materialQuantitySource: c.materialQuantitySource } : {}),
    ...(c.materialQuantityNote ? { materialQuantityNote: c.materialQuantityNote } : {}),
    unitPriceSnapshot: c.unitPriceSnapshot,
    totalComponentCost: c.totalComponentCost,
    sortOrder: c.sortOrder,
  }));

  return {
    id: template.id,
    code: template.code,
    name: template.name,
    unit: template.unit,
    unitCanonical: canonicalizeUnit(template.unit).canonical,
    version: template.version,
    defaultToolPct: template.defaultToolPct,
    components: views,
    unitCostMaterials: breakdown.materials,
    unitCostLabor: breakdown.labor,
    unitCostEquipment: breakdown.equipment,
    unitCostTools: breakdown.tools,
    unitCostToolDerived: breakdown.toolDerived,
    unitCostSubcontract: breakdown.subcontract,
    unitCostOther: breakdown.other,
    unitCostTotal: breakdown.total,
  };
}
