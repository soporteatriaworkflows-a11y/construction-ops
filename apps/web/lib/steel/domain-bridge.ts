/**
 * domain-bridge.ts — Conecta los mocks de UI con el dominio puro real de F1
 * (`@/modules/steel`, PR #35). Nada de esto toca DB/Supabase: los inputs son
 * los mocks de `mock-data.ts`; los cálculos (parser, ml/kg, alertas, FFD) son
 * la función real, no reinventada aquí.
 *
 * Líneas de refuerzo: pasan por `parseSteelDescription` (igual que lo haría
 * la ingesta real). Líneas de perfil/estructura metálica: F1 solo parsea
 * notación de refuerzo, así que se arman directo como `SteelLineInput` — se
 * documenta con `fromParser: false` en cada fila.
 */
import {
  calculateSteelLine,
  classifyWasteSeverity,
  calculateWastePct,
  defaultSteelWasteThresholds,
  evaluateSteelLineAlerts,
  findDefaultRebarSpec,
  lineInputFromParsed,
  optimizeSteelCutsFFD,
  parseSteelDescription,
  toDecimal,
  type SteelCalculatedLine,
  type SteelCutInput,
  type SteelCutPlan,
  type SteelLineInput,
} from '@/modules/steel';
import {
  MOCK_STEEL_ELEMENTS,
  MOCK_STEEL_ORDERS,
  MOCK_STEEL_PROFILE_LINES,
  MOCK_STEEL_SPECS,
  STEEL_RAW_DESCRIPTIONS,
} from './mock-data';
import type { SteelLineAlertView, SteelReviewItemView, SteelWorkspaceLineView } from './types';

/** Barra de refuerzo asumida por línea (mock de configuración de takeoff, D5). No viene del parser: el % de desperdicio asumido es un parámetro de takeoff, no de la interpretación de texto. */
const ASSUMED_WASTE_PCT_BY_RAW_ID: Record<string, string> = {
  'raw-1': '5', // ok
  'raw-2': '9', // warning
  'raw-3': '13', // critical
  'raw-4': '6', // ok
  'raw-5': '10', // warning
  'raw-6': '13', // critical
};

/** F1 no infiere numero de varilla para el patron de doblez segmentado (`15+35+15`); se asigna manualmente para poder calcular peso — riesgo ya anotado en F1_DOMAIN_CONTRACT.md. */
const MANUAL_BAR_NUMBER_BY_RAW_ID: Record<string, number> = {
  'raw-6': 3,
};

function specPriceCop(specId: string): string | undefined {
  return MOCK_STEEL_SPECS.find((s) => s.reference === specId || s.id === specId)?.priceCop;
}

function elementLabel(elementId: string): string {
  return MOCK_STEEL_ELEMENTS.find((e) => e.id === elementId)?.label ?? elementId;
}

function toWorkspaceRow(params: {
  id: string;
  elementId: string;
  family: SteelWorkspaceLineView['family'];
  originalDescription: string;
  interpretation: string;
  barNumberOrProfile: string;
  calculated: SteelCalculatedLine;
  alerts: readonly SteelLineAlertView[];
  fromParser: boolean;
}): SteelWorkspaceLineView {
  const totalPieces = toDecimal(params.calculated.quantityPerUnit).times(toDecimal(params.calculated.repetitions)).toFixed();
  const wastePct = params.calculated.estimatedWasteMl
    ? calculateWastePct(params.calculated.totalMl, params.calculated.estimatedWasteMl)
    : '0';
  const wasteSeverity = classifyWasteSeverity(params.family, wastePct, defaultSteelWasteThresholds);

  return {
    id: params.id,
    elementId: params.elementId,
    elementLabel: elementLabel(params.elementId),
    family: params.family,
    originalDescription: params.originalDescription,
    interpretation: params.interpretation,
    barNumberOrProfile: params.barNumberOrProfile,
    cutLengthM: params.calculated.cutLengthM ?? '0',
    totalPieces,
    totalMl: params.calculated.totalMl,
    totalKg: params.calculated.totalKg,
    commercialUnitsRequired: params.calculated.commercialUnitsRequired,
    verificationStatus: params.calculated.verificationStatus ?? 'unreviewed',
    confidenceScore: params.calculated.confidenceScore ?? '0',
    wasteSeverity,
    wastePct,
    alerts: params.alerts,
    fromParser: params.fromParser,
  };
}

/** Líneas de refuerzo: parser real → calculadora real → alertas reales. */
export function buildRebarWorkspaceLines(): readonly SteelWorkspaceLineView[] {
  return STEEL_RAW_DESCRIPTIONS.map((raw) => {
    const parsed = parseSteelDescription(raw.originalDescription);
    const baseInput = lineInputFromParsed(raw.id, parsed);
    const barNumber = parsed.barNumber ?? MANUAL_BAR_NUMBER_BY_RAW_ID[raw.id];
    const spec = barNumber ? findDefaultRebarSpec(barNumber) : undefined;
    const assumedWastePct = ASSUMED_WASTE_PCT_BY_RAW_ID[raw.id] ?? '0';

    const input: SteelLineInput = {
      ...baseInput,
      barNumber,
      wasteMode: 'assumed',
      assumedWastePct,
      unitPriceSnapshot: spec ? specPriceCop(spec.technicalReference) : undefined,
      currency: 'COP',
    };

    const calculated = calculateSteelLine(input, spec);
    const alerts = evaluateSteelLineAlerts(calculated, {
      spec,
      hasSupplier: false,
      hasApprovedPrice: Boolean(input.unitPriceSnapshot),
    });

    return toWorkspaceRow({
      id: raw.id,
      elementId: raw.elementId,
      family: 'rebar',
      originalDescription: raw.originalDescription,
      interpretation: parsed.explanation,
      barNumberOrProfile: barNumber ? `#${barNumber}` : 'sin identificar',
      calculated,
      alerts,
      fromParser: true,
    });
  });
}

/** Perfiles/estructura metálica: sin parser (fuera de alcance F1), pero sí calculadora + alertas reales. */
const PROFILE_COMMERCIAL_LENGTHS_M = ['6', '9', '12'] as const;

/** Longitud comercial mínima que alcanza a cubrir el corte (mismo criterio del optimizador FFD, sin plan completo). */
function minimumCommercialLengthFor(cutLengthM: string): string | undefined {
  const cut = toDecimal(cutLengthM);
  return PROFILE_COMMERCIAL_LENGTHS_M.find((length) => toDecimal(length).gte(cut));
}

export function buildProfileWorkspaceLines(): readonly SteelWorkspaceLineView[] {
  return MOCK_STEEL_PROFILE_LINES.map((line) => {
    const input: SteelLineInput = {
      id: line.id,
      originalDescription: line.originalDescription,
      steelFamily: 'structural_steel',
      steelShape: 'profile_piece',
      profileReference: line.profileReference,
      cutLengthM: line.cutLengthM,
      quantityPerUnit: line.quantityPerUnit,
      repetitions: line.repetitions,
      unitWeightKgMSnapshot: line.unitWeightKgM,
      commercialLengthM: minimumCommercialLengthFor(line.cutLengthM),
      wasteMode: 'assumed',
      assumedWastePct: line.assumedWastePct,
      unitPriceSnapshot: specPriceCop(line.profileReference),
      currency: 'COP',
      verificationStatus: 'confirmed',
      confidenceScore: '1',
    };
    const calculated = calculateSteelLine(input);
    const alerts = evaluateSteelLineAlerts(calculated, {
      hasSupplier: false,
      hasApprovedPrice: Boolean(input.unitPriceSnapshot),
    });

    return toWorkspaceRow({
      id: line.id,
      elementId: line.elementId,
      family: 'structural_steel',
      originalDescription: line.originalDescription,
      interpretation: `Linea de perfil ingresada manualmente (F1 no parsea notacion de perfiles): ${line.profileReference}, ${line.cutLengthM} m.`,
      barNumberOrProfile: line.profileReference,
      calculated,
      alerts,
      fromParser: false,
    });
  });
}

export function buildAllWorkspaceLines(): readonly SteelWorkspaceLineView[] {
  return [...buildRebarWorkspaceLines(), ...buildProfileWorkspaceLines()];
}

/** Líneas calculadas cuyo elemento pertenece al `takeoffId` dado. */
export function buildWorkspaceLinesForTakeoff(takeoffId: string): readonly SteelWorkspaceLineView[] {
  const elementIds = new Set(MOCK_STEEL_ELEMENTS.filter((e) => e.takeoffId === takeoffId).map((e) => e.id));
  return buildAllWorkspaceLines().filter((line) => elementIds.has(line.elementId));
}

/** Centro de revisión: mismas líneas de refuerzo, proyectadas al shape de revisión documental. */
export function buildReviewItems(): readonly SteelReviewItemView[] {
  return STEEL_RAW_DESCRIPTIONS.map((raw) => {
    const parsed = parseSteelDescription(raw.originalDescription);
    return {
      id: raw.id,
      elementLabel: elementLabel(raw.elementId),
      originalDescription: raw.originalDescription,
      interpretation: parsed.cutLengthM
        ? `${parsed.quantityPerUnit} x ${parsed.repetitions !== '1' ? `${parsed.repetitions} grupos, ` : ''}long. ${parsed.cutLengthM} m`
        : 'Sin interpretacion de longitud',
      confidenceScore: parsed.confidenceScore,
      needsReview: parsed.needsReview,
      explanation: parsed.explanation,
    };
  });
}

export interface SteelOptimizationResult {
  rebar: SteelCutPlan;
  profiles: SteelCutPlan;
}

/** Plan de corte real (FFD) para refuerzo y perfiles, a partir de las líneas ya calculadas. */
export function buildCutPlans(): SteelOptimizationResult {
  const rebarLines = buildRebarWorkspaceLines();
  const rebarCuts: SteelCutInput[] = rebarLines
    .filter((line) => line.cutLengthM !== '0')
    .map((line) => ({
      id: line.id,
      lengthM: line.cutLengthM,
      quantity: line.totalPieces,
      steelSpecId: `spec-${line.barNumberOrProfile.replace('#', 'rebar-')}`,
      steelFamily: 'rebar',
      barNumber: Number(line.barNumberOrProfile.replace('#', '')) || undefined,
      treatment: 'none',
    }));

  const profileCuts: SteelCutInput[] = MOCK_STEEL_PROFILE_LINES.filter((l) => l.elementId !== 'el-malla-1').map((line) => ({
    id: line.id,
    lengthM: line.cutLengthM,
    quantity: line.quantityPerUnit,
    steelSpecId: line.profileReference,
    steelFamily: 'structural_steel',
    profileReference: line.profileReference,
    treatment: 'none',
  }));

  const rebar = optimizeSteelCutsFFD(rebarCuts, {
    commercialLengthsM: ['6', '9', '12'],
    kerfM: '0',
    minimumUsefulOffcutM: '0.30',
  });
  const profiles = optimizeSteelCutsFFD(profileCuts, {
    commercialLengthsM: ['6', '9', '12'],
    kerfM: '0.005',
    minimumUsefulOffcutM: '0.50',
  });

  return { rebar, profiles };
}

export interface SteelDashboardKpis {
  totalKg: string;
  totalMl: string;
  totalCommercialUnits: string;
  estimatedWasteKg: string;
  optimizedWasteM: string;
  criticalAlertsCount: number;
  warningAlertsCount: number;
  draftOrdersCount: number;
  pendingOrExpiredPricesCount: number;
}

/** Agrega KPIs del hub a partir del dominio real (líneas calculadas + planes de corte), no de números fijos. */
export function computeDashboardKpis(): SteelDashboardKpis {
  const lines = buildAllWorkspaceLines();
  const { rebar, profiles } = buildCutPlans();

  const totalKg = lines.reduce((acc, l) => acc.plus(toDecimal(l.totalKg)), toDecimal('0'));
  const totalMl = lines.reduce((acc, l) => acc.plus(toDecimal(l.totalMl)), toDecimal('0'));
  const totalCommercialUnits = lines.reduce(
    (acc, l) => acc.plus(l.commercialUnitsRequired ? toDecimal(l.commercialUnitsRequired) : toDecimal('0')),
    toDecimal('0'),
  );
  const estimatedWasteKg = lines.reduce(
    (acc, l) => acc.plus(toDecimal(l.totalKg).times(toDecimal(l.wastePct)).div(100)),
    toDecimal('0'),
  );
  const optimizedWasteM = toDecimal(rebar.totalWasteM).plus(toDecimal(profiles.totalWasteM));

  const allAlerts = lines.flatMap((l) => l.alerts);
  const criticalAlertsCount = allAlerts.filter((a) => a.severity === 'critical').length;
  const warningAlertsCount = allAlerts.filter((a) => a.severity === 'warning').length;

  return {
    totalKg: totalKg.toFixed(1),
    totalMl: totalMl.toFixed(1),
    totalCommercialUnits: totalCommercialUnits.toFixed(0),
    estimatedWasteKg: estimatedWasteKg.toFixed(1),
    optimizedWasteM: optimizedWasteM.toFixed(2),
    criticalAlertsCount,
    warningAlertsCount,
    draftOrdersCount: MOCK_STEEL_ORDERS.filter((o) => o.status === 'draft').length,
    pendingOrExpiredPricesCount: MOCK_STEEL_SPECS.filter((s) => s.priceStatus !== 'vigente').length,
  };
}
