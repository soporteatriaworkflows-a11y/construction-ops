/**
 * manual-takeoff.ts — Motor PURO del flujo F3 "Manual Takeoff" (mock/local).
 *
 * Todo el cálculo pasa por el dominio real de F1 (`@/modules/steel`): parser,
 * calculadora ml/kg, alertas y optimizador FFD. Este archivo NO reinventa
 * fórmulas — solo orquesta y da forma de vista. Sin I/O: la persistencia
 * local (localStorage) vive en `manual-store.ts`; aquí solo hay funciones
 * puras testeables.
 *
 * Los precios/proveedores provienen de `MOCK_STEEL_SPECS` (mock declarado):
 * cuando F2 (datos reales) se apruebe, la única costura a cambiar es la
 * resolución de precio/proveedor — el resto del flujo queda igual.
 */
import type { DecimalString } from '@/lib/utils/types';
import {
  calculateSteelLine,
  calculateWastePct,
  classifyWasteSeverity,
  defaultSteelWasteThresholds,
  evaluateSteelLineAlerts,
  findDefaultRebarSpec,
  lineInputFromParsed,
  optimizeSteelCutsFFD,
  parseSteelDescription,
  toDecimal,
  type SteelAlert,
  type SteelCalculatedLine,
  type SteelCutInput,
  type SteelCutPlan,
  type SteelLineInput,
  type SteelParsedDescription,
} from '@/modules/steel';
import { MOCK_STEEL_SETTINGS, MOCK_STEEL_SPECS } from './mock-data';
import type { SteelPriceStatusView, SteelTakeoffStatusView } from './types';

// ---------------------------------------------------------------------------
// Registros persistibles (solo INPUTS; todo lo derivado se recalcula con F1)
// ---------------------------------------------------------------------------

/** Método de lectura de la evidencia adjunta a una línea (F6E). */
export type ManualLineEvidenceMethod = 'native_text' | 'ocr' | 'manual';

/**
 * Evidencia de origen de una línea manual (F6E): fuente, página, tipo de
 * fuente, método de lectura, confianza y observación. Es SOLO trazabilidad —
 * jamás alimenta cálculo alguno (F1 sigue siendo la única calculadora).
 * Los nombres están alineados con `ManualExcelLineEvidence` (F4A.2) para que
 * el export Excel la recoja tal cual en CONTROL_LECTURA/EVIDENCIAS.
 */
export interface ManualLineEvidence {
  sourceFileName?: string;
  pageNumber?: number;
  sourceType?: string;
  readingMethod?: ManualLineEvidenceMethod;
  confidence?: string;
  originalFragment?: string;
  observation?: string;
}

/**
 * Línea manual tal como se guarda localmente. Deliberadamente NO persiste
 * ml/kg/alertas: una sola fuente de verdad para cálculos (regla global #1) —
 * siempre se recalcula desde la descripción con el dominio F1.
 */
export interface ManualLineRecord {
  id: string;
  originalDescription: string;
  /** % desperdicio asumido del takeoff para esta línea (modo `assumed`, D5). */
  assumedWastePct: DecimalString;
  /** Nº de varilla asignado a mano cuando el parser no lo infiere (ej. `15 + 35 + 15`). */
  manualBarNumber?: number;
  /** Evidencia de origen (F6E): de qué PDF/página/método salió la línea. */
  evidence?: ManualLineEvidence;
}

export interface ManualTakeoffRecord {
  id: string;
  name: string;
  projectName: string;
  scopeLabel: string;
  status: SteelTakeoffStatusView;
  createdAt: string;
  lines: readonly ManualLineRecord[];
  /**
   * Longitudes comerciales disponibles para ESTE takeoff (F7.1, editable):
   * el mercado/proveedor puede cambiar (6/9/12 hoy; 7.5 mañana). Ausente ⇒
   * defaults del preview. Solo configura el optimizador FFD/pedido — jamás
   * altera cálculos F1 de ml/kg.
   */
  commercialLengthsM?: readonly DecimalString[];
}

// ---------------------------------------------------------------------------
// Longitudes comerciales configurables (F7.1)
// ---------------------------------------------------------------------------

/** Default del preview (paridad con MOCK_STEEL_SETTINGS): 6/9/12 m. */
export const DEFAULT_COMMERCIAL_LENGTHS_M: readonly DecimalString[] =
  MOCK_STEEL_SETTINGS.commercialLengthsM;

/** Tope físico razonable: una barra comercial no supera los 24 m. */
export const MAX_COMMERCIAL_LENGTH_M = 24;

/**
 * Valida una longitud comercial digitada. Rechaza vacío, no numérico, 0,
 * negativos y valores fuera del rango físico razonable.
 */
export function validateCommercialLengthInput(
  raw: string,
): { ok: true; lengthM: DecimalString } | { ok: false; reason: string } {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed.length === 0) return { ok: false, reason: 'Escribe una longitud en metros.' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, reason: 'La longitud debe ser un número (metros).' };
  if (value <= 0) return { ok: false, reason: 'La longitud debe ser mayor que 0 m.' };
  if (value > MAX_COMMERCIAL_LENGTH_M) {
    return { ok: false, reason: `La longitud supera el máximo razonable (${MAX_COMMERCIAL_LENGTH_M} m).` };
  }
  return { ok: true, lengthM: toDecimal(trimmed).toFixed() };
}

/**
 * Longitudes efectivas del takeoff: configuradas y válidas, o el default.
 * Nunca devuelve lista vacía (el optimizador necesita al menos una).
 */
export function effectiveCommercialLengths(
  takeoff: Pick<ManualTakeoffRecord, 'commercialLengthsM'> | undefined,
): readonly DecimalString[] {
  const configured = (takeoff?.commercialLengthsM ?? []).filter(
    (length) => validateCommercialLengthInput(length).ok,
  );
  if (configured.length === 0) return DEFAULT_COMMERCIAL_LENGTHS_M;
  return [...new Set(configured)].sort((a, b) => toDecimal(a).cmp(toDecimal(b)));
}

export const MANUAL_TAKEOFF_ID_PREFIX = 'mtk-';

export function isManualTakeoffId(id: string): boolean {
  return id.startsWith(MANUAL_TAKEOFF_ID_PREFIX);
}

export function newManualTakeoffId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  return `${MANUAL_TAKEOFF_ID_PREFIX}${now().toString(36)}-${random().toString(36).slice(2, 7)}`;
}

/** Id fijo del takeoff demo local para probar la lectura asistida (F6A). */
export const DEMO_INTAKE_TAKEOFF_ID = `${MANUAL_TAKEOFF_ID_PREFIX}demo-lectura`;

/**
 * Garantiza que exista el takeoff demo de lectura asistida (pura e
 * idempotente): si ya está en los registros los devuelve intactos; si no,
 * lo agrega vacío en `draft`. Solo localStorage — jamás DB.
 */
export function ensureDemoIntakeTakeoff(
  records: readonly ManualTakeoffRecord[],
  today: string = new Date().toISOString().slice(0, 10),
): { records: readonly ManualTakeoffRecord[]; id: string; created: boolean } {
  if (records.some((takeoff) => takeoff.id === DEMO_INTAKE_TAKEOFF_ID)) {
    return { records, id: DEMO_INTAKE_TAKEOFF_ID, created: false };
  }
  return {
    records: [
      ...records,
      {
        id: DEMO_INTAKE_TAKEOFF_ID,
        name: 'Demo — lectura asistida PDF/plano',
        projectName: 'Demo local',
        scopeLabel: 'Prueba de lectura asistida',
        status: 'draft',
        createdAt: today,
        lines: [],
      },
    ],
    id: DEMO_INTAKE_TAKEOFF_ID,
    created: true,
  };
}

// ---------------------------------------------------------------------------
// Ciclo de vida del takeoff manual (draft → in_review → approved → locked)
// ---------------------------------------------------------------------------

/** Transiciones permitidas. `locked` es terminal (espejo de snapshots emitidos). */
export const MANUAL_TAKEOFF_STATUS_TRANSITIONS: Record<
  SteelTakeoffStatusView,
  readonly SteelTakeoffStatusView[]
> = {
  draft: ['in_review'],
  in_review: ['approved', 'draft'],
  approved: ['locked', 'in_review'],
  locked: [],
};

/** Etiqueta de la acción que LLEVA a cada estado destino. */
export const MANUAL_TAKEOFF_TRANSITION_LABEL: Record<SteelTakeoffStatusView, string> = {
  draft: 'Devolver a borrador',
  in_review: 'Enviar a revisión',
  approved: 'Aprobar',
  locked: 'Bloquear (inmutable)',
};

export function canTransitionManualTakeoff(
  from: SteelTakeoffStatusView,
  to: SteelTakeoffStatusView,
): boolean {
  return MANUAL_TAKEOFF_STATUS_TRANSITIONS[from].includes(to);
}

/** Solo en borrador y revisión se agregan/quitan líneas. Aprobado y bloqueado son de lectura. */
export function canEditManualLines(status: SteelTakeoffStatusView): boolean {
  return status === 'draft' || status === 'in_review';
}

// ---------------------------------------------------------------------------
// Puente al parser + calculadora + alertas reales (Agentes 2, 3 y 4)
// ---------------------------------------------------------------------------

/** Spec mock del catálogo preview para una referencia (`REBAR-5`, etc.). */
function findMockSpecView(reference: string) {
  return MOCK_STEEL_SPECS.find((s) => s.reference === reference);
}

export interface ManualComputedLine {
  record: ManualLineRecord;
  parsed: SteelParsedDescription;
  calculated: SteelCalculatedLine;
  /** Nº de varilla efectivo: del parser o asignado a mano. */
  barNumber?: number;
  barLabel: string;
  totalPieces: DecimalString;
  wastePct: DecimalString;
  wasteSeverity: 'ok' | 'warning' | 'critical';
  alerts: readonly SteelAlert[];
  priceStatus: SteelPriceStatusView;
  supplierName?: string;
  /** ¿Puede ir al plan de corte? Si no, `cutPlanExclusionReason` explica por qué. */
  cutPlanEligible: boolean;
  cutPlanExclusionReason?: string;
}

function cutPlanExclusionReason(params: {
  parsed: SteelParsedDescription;
  barNumber?: number;
  cutLengthM?: DecimalString;
  totalPieces: DecimalString;
}): string | undefined {
  if (params.parsed.steelFamily === 'other') {
    return 'El parser no reconoció la descripción; corrígela o revísala antes de optimizar.';
  }
  if (!params.cutLengthM || toDecimal(params.cutLengthM).lte(0)) {
    return 'La línea no tiene longitud de corte interpretada.';
  }
  if (toDecimal(params.totalPieces).lte(0)) {
    return 'La línea no tiene cantidad de piezas.';
  }
  if (!params.barNumber) {
    return 'Falta el número de varilla (asígnalo manualmente para calcular peso y agrupar cortes).';
  }
  return undefined;
}

/**
 * Descripción original → interpretación (parser F1) → cálculo (calculadora F1)
 * → alertas (evaluador F1). Idéntico camino al de la ingesta real futura.
 */
export function computeManualLine(record: ManualLineRecord): ManualComputedLine {
  const parsed = parseSteelDescription(record.originalDescription);
  const baseInput = lineInputFromParsed(record.id, parsed);
  const barNumber = parsed.barNumber ?? record.manualBarNumber;
  const spec = barNumber ? findDefaultRebarSpec(barNumber) : undefined;
  const mockSpec = spec ? findMockSpecView(spec.technicalReference) : undefined;

  const input: SteelLineInput = {
    ...baseInput,
    barNumber,
    steelSpecId: spec?.id,
    wasteMode: 'assumed',
    assumedWastePct: record.assumedWastePct,
    unitPriceSnapshot: mockSpec?.priceCop,
    currency: 'COP',
  };

  const calculated = calculateSteelLine(input, spec);
  const alerts = evaluateSteelLineAlerts(calculated, {
    spec,
    hasSupplier: false,
    hasApprovedPrice: mockSpec?.priceStatus === 'aprobado',
  });

  const totalPieces = toDecimal(calculated.quantityPerUnit)
    .times(toDecimal(calculated.repetitions))
    .toFixed();
  const wastePct = calculated.estimatedWasteMl
    ? calculateWastePct(calculated.totalMl, calculated.estimatedWasteMl)
    : '0';
  const wasteSeverity = classifyWasteSeverity(
    calculated.steelFamily,
    wastePct,
    defaultSteelWasteThresholds,
  );

  const exclusionReason = cutPlanExclusionReason({
    parsed,
    barNumber,
    cutLengthM: calculated.cutLengthM,
    totalPieces,
  });

  return {
    record,
    parsed,
    calculated,
    barNumber,
    barLabel: barNumber ? `#${barNumber}` : 'sin identificar',
    totalPieces,
    wastePct,
    wasteSeverity,
    alerts,
    priceStatus: mockSpec?.priceStatus ?? 'sin_precio',
    supplierName: mockSpec?.supplierName,
    cutPlanEligible: !exclusionReason,
    cutPlanExclusionReason: exclusionReason,
  };
}

export function computeManualLines(records: readonly ManualLineRecord[]): readonly ManualComputedLine[] {
  return records.map(computeManualLine);
}

// ---------------------------------------------------------------------------
// Totales del takeoff (Agente 3)
// ---------------------------------------------------------------------------

export interface ManualTakeoffTotals {
  totalMl: DecimalString;
  totalKg: DecimalString;
  totalCommercialUnits: DecimalString;
  estimatedWasteMl: DecimalString;
  estimatedWasteKg: DecimalString;
  estimatedCostCop: DecimalString;
  linesNeedingReview: number;
  criticalAlerts: number;
  warningAlerts: number;
}

export function computeManualTotals(lines: readonly ManualComputedLine[]): ManualTakeoffTotals {
  let ml = toDecimal('0');
  let kg = toDecimal('0');
  let units = toDecimal('0');
  let wasteMl = toDecimal('0');
  let wasteKg = toDecimal('0');
  let cost = toDecimal('0');

  for (const line of lines) {
    ml = ml.plus(toDecimal(line.calculated.totalMl));
    kg = kg.plus(toDecimal(line.calculated.totalKg));
    if (line.calculated.commercialUnitsRequired) {
      units = units.plus(toDecimal(line.calculated.commercialUnitsRequired));
    }
    if (line.calculated.estimatedWasteMl) {
      wasteMl = wasteMl.plus(toDecimal(line.calculated.estimatedWasteMl));
      wasteKg = wasteKg.plus(
        toDecimal(line.calculated.totalKg).times(toDecimal(line.wastePct)).div(100),
      );
    }
    if (line.calculated.estimatedCost) {
      cost = cost.plus(toDecimal(line.calculated.estimatedCost));
    }
  }

  const allAlerts = lines.flatMap((l) => l.alerts);
  return {
    totalMl: ml.toFixed(),
    totalKg: kg.toFixed(),
    totalCommercialUnits: units.toFixed(0),
    estimatedWasteMl: wasteMl.toFixed(),
    estimatedWasteKg: wasteKg.toFixed(),
    estimatedCostCop: cost.toFixed(0),
    linesNeedingReview: lines.filter((l) => l.calculated.verificationStatus === 'needs_review').length,
    criticalAlerts: allAlerts.filter((a) => a.severity === 'critical').length,
    warningAlerts: allAlerts.filter((a) => a.severity === 'warning').length,
  };
}

// ---------------------------------------------------------------------------
// Plan de corte (Agente 5): líneas válidas → FFD real
// ---------------------------------------------------------------------------

export interface ManualCutPlanResult {
  plan: SteelCutPlan;
  includedLineIds: readonly string[];
  excluded: readonly { lineId: string; originalDescription: string; reason: string }[];
}

/** SpecId sintético compatible con `specDisplayLabel`/`groupBarsBySpec` de domain-bridge. */
export function rebarCutSpecId(barNumber: number): string {
  return `spec-rebar-${barNumber}`;
}

export function buildManualCutPlan(
  lines: readonly ManualComputedLine[],
  options: { commercialLengthsM?: readonly DecimalString[] } = {},
): ManualCutPlanResult {
  const eligible = lines.filter((l) => l.cutPlanEligible);
  const excluded = lines
    .filter((l) => !l.cutPlanEligible)
    .map((l) => ({
      lineId: l.record.id,
      originalDescription: l.record.originalDescription,
      reason: l.cutPlanExclusionReason ?? 'Línea no elegible.',
    }));

  const cuts: SteelCutInput[] = eligible.map((line) => ({
    id: line.record.id,
    lengthM: line.calculated.cutLengthM ?? '0',
    quantity: line.totalPieces,
    steelSpecId: rebarCutSpecId(line.barNumber as number),
    steelFamily: 'rebar',
    barNumber: line.barNumber,
    treatment: 'none',
  }));

  // F7.1: las longitudes comerciales son configurables por takeoff (mercado/
  // proveedor cambia); sin configuración se mantiene el default 6/9/12.
  const commercialLengthsM =
    options.commercialLengthsM && options.commercialLengthsM.length > 0
      ? options.commercialLengthsM
      : DEFAULT_COMMERCIAL_LENGTHS_M;

  const plan = optimizeSteelCutsFFD(cuts, {
    commercialLengthsM,
    kerfM: MOCK_STEEL_SETTINGS.kerfRebarM,
    minimumUsefulOffcutM: MOCK_STEEL_SETTINGS.minimumUsefulOffcutRebarM,
  });

  return { plan, includedLineIds: eligible.map((l) => l.record.id), excluded };
}

// ---------------------------------------------------------------------------
// Pedido proveedor mock (Agente 6): agrupar barras del plan por varilla+longitud
// ---------------------------------------------------------------------------

export interface ManualOrderLineDraft {
  id: string;
  specId: string;
  specLabel: string;
  commercialLengthM: DecimalString;
  commercialUnits: DecimalString;
  totalMl: DecimalString;
  totalKg: DecimalString;
  supplierName: string;
  priceStatus: SteelPriceStatusView;
  unitPriceCopPerKg?: DecimalString;
  validUntil?: string;
  subtotalCop?: DecimalString;
}

export interface ManualOrderDraft {
  name: string;
  status: 'draft';
  lines: readonly ManualOrderLineDraft[];
  totalUnits: DecimalString;
  totalMl: DecimalString;
  totalKg: DecimalString;
  totalEstimatedCop: DecimalString;
  linesWithoutApprovedPrice: number;
}

/**
 * Convierte el plan FFD en un borrador de pedido: 1 línea por combinación
 * varilla × longitud comercial, con unidades = barras del plan (no `ceil` por
 * línea de despiece: el FFD ya consolidó los cortes).
 */
export function buildManualOrderDraft(takeoffName: string, plan: SteelCutPlan): ManualOrderDraft {
  const groups = new Map<string, { specId: string; commercialLengthM: DecimalString; barCount: number }>();
  for (const bar of plan.bars) {
    const key = `${bar.steelSpecId}|${bar.commercialLengthM}`;
    const existing = groups.get(key);
    if (existing) {
      existing.barCount += 1;
    } else {
      groups.set(key, { specId: bar.steelSpecId, commercialLengthM: bar.commercialLengthM, barCount: 1 });
    }
  }

  let totalUnits = toDecimal('0');
  let totalMl = toDecimal('0');
  let totalKg = toDecimal('0');
  let totalCop = toDecimal('0');
  let linesWithoutApprovedPrice = 0;

  const lines: ManualOrderLineDraft[] = [...groups.values()]
    .sort((a, b) => a.specId.localeCompare(b.specId) || toDecimal(a.commercialLengthM).cmp(toDecimal(b.commercialLengthM)))
    .map((group, index) => {
      const barNumber = Number(group.specId.replace('spec-rebar-', ''));
      const spec = findDefaultRebarSpec(barNumber);
      const mockSpec = spec ? findMockSpecView(spec.technicalReference) : undefined;
      const units = toDecimal(String(group.barCount));
      const ml = units.times(toDecimal(group.commercialLengthM));
      const kg = ml.times(toDecimal(spec?.unitWeightKgM ?? '0'));
      const price = mockSpec?.priceCop;
      const subtotal = price ? kg.times(toDecimal(price)) : undefined;
      const priceStatus = mockSpec?.priceStatus ?? 'sin_precio';

      totalUnits = totalUnits.plus(units);
      totalMl = totalMl.plus(ml);
      totalKg = totalKg.plus(kg);
      if (subtotal) totalCop = totalCop.plus(subtotal);
      if (priceStatus !== 'aprobado') linesWithoutApprovedPrice += 1;

      return {
        id: `order-line-${index + 1}`,
        specId: group.specId,
        specLabel: spec?.name ?? group.specId,
        commercialLengthM: group.commercialLengthM,
        commercialUnits: units.toFixed(0),
        totalMl: ml.toFixed(2),
        totalKg: kg.toFixed(1),
        supplierName: mockSpec?.supplierName ?? MOCK_STEEL_SETTINGS.defaultSupplierName,
        priceStatus,
        unitPriceCopPerKg: price,
        validUntil: mockSpec?.validUntil,
        subtotalCop: subtotal?.toFixed(0),
      };
    });

  return {
    name: `Pedido acero (mock) — ${takeoffName}`,
    status: 'draft',
    lines,
    totalUnits: totalUnits.toFixed(0),
    totalMl: totalMl.toFixed(2),
    totalKg: totalKg.toFixed(1),
    totalEstimatedCop: totalCop.toFixed(0),
    linesWithoutApprovedPrice,
  };
}

// ---------------------------------------------------------------------------
// Preparación de export (mock): CSV plano generado en cliente
// ---------------------------------------------------------------------------

/**
 * Celda CSV segura: escapa comillas/comas/saltos y neutraliza formula
 * injection (`=`, `+`, `-`, `@`) con prefijo `'` — misma convención que los
 * exports Excel reales del proyecto (APU_EXPORTS_V1).
 */
export function sanitizeCsvCell(value: string): string {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/**
 * CSV del borrador (líneas calculadas + pedido mock si existe). Es una
 * PREPARACIÓN de export local: el export real (Excel/PDF con perfiles de
 * privacidad por rol, backend-first) llega con F4+, no aquí.
 */
export function buildManualExportCsv(
  takeoff: Pick<ManualTakeoffRecord, 'name' | 'projectName' | 'scopeLabel' | 'status'>,
  lines: readonly ManualComputedLine[],
  order?: ManualOrderDraft,
): string {
  const rows: string[][] = [];
  rows.push(['Takeoff', takeoff.name]);
  rows.push(['Proyecto', takeoff.projectName]);
  rows.push(['Alcance', takeoff.scopeLabel]);
  rows.push(['Estado', takeoff.status]);
  rows.push([]);
  rows.push([
    'Descripción original',
    'Interpretación',
    'Varilla',
    'Long. corte (m)',
    'Piezas',
    'Total ml',
    'Total kg',
    'Unidades comerciales',
    'Desperdicio %',
    'Confianza',
    'Necesita revisión',
  ]);
  for (const line of lines) {
    rows.push([
      line.record.originalDescription,
      line.parsed.explanation,
      line.barLabel,
      line.calculated.cutLengthM ?? '0',
      line.totalPieces,
      line.calculated.totalMl,
      line.calculated.totalKg,
      line.calculated.commercialUnitsRequired ?? '',
      line.wastePct,
      line.parsed.confidenceScore,
      line.parsed.needsReview ? 'sí' : 'no',
    ]);
  }

  if (order) {
    rows.push([]);
    rows.push([order.name]);
    rows.push(['Referencia', 'Long. comercial (m)', 'Unidades', 'Total ml', 'Total kg', 'Proveedor', 'Precio COP/kg', 'Estado precio', 'Subtotal COP']);
    for (const line of order.lines) {
      rows.push([
        line.specLabel,
        line.commercialLengthM,
        line.commercialUnits,
        line.totalMl,
        line.totalKg,
        line.supplierName,
        line.unitPriceCopPerKg ?? '',
        line.priceStatus,
        line.subtotalCop ?? '',
      ]);
    }
    rows.push(['Totales', '', order.totalUnits, order.totalMl, order.totalKg, '', '', '', order.totalEstimatedCop]);
  }

  return rows.map((row) => row.map(sanitizeCsvCell).join(',')).join('\r\n');
}
