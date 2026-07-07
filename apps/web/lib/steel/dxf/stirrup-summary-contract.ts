/**
 * stirrup-summary-contract.ts — Stirrup Summary Contract (F8D, puro).
 *
 * Contrato claro para estribos/flejado de un beam detail: zonas detectadas
 * (`27 E#3@12`…), resumen declarado (`2x240E#3184`), subtotal por repetición,
 * valor sugerido y estado de comparación. Reglas de envío al takeoff:
 *
 * - `match`      ⇒ se envía el RESUMEN (una línea, no todas las zonas).
 * - `mismatch`   ⇒ NO se autoaprueba: decisión humana (resumen del plano /
 *                  suma por zonas / marcar para revisión).
 * - `unverified` ⇒ no se envía automático; la usuaria puede elegir explícito.
 * - `ambiguous`  ⇒ no se envía (posible mezcla de detalles contiguos:
 *                  revisar segmentación primero).
 *
 * Este módulo no calcula ml/kg/costos (F1 única calculadora), no aprueba nada
 * y jamás inventa cantidades.
 */

// ---------------------------------------------------------------------------
// Tipos (estructurales, compatibles con el Beam Detail Assembly)
// ---------------------------------------------------------------------------

export interface StirrupContractSummaryInput {
  raw: string;
  /** Normalizado ("2x240E#3184"). */
  normalized: string;
  groups: number;
  countPerGroup: number;
  barCode: number;
  lengthCm?: number;
}

export interface StirrupContractZoneInput {
  count: number;
  barCode: number;
  spacingCm: number;
  sourceText: string;
  x?: number;
}

export type StirrupComparisonStatus = 'match' | 'mismatch' | 'unverified' | 'ambiguous';

export const STIRRUP_COMPARISON_STATUS_LABEL: Record<StirrupComparisonStatus, string> = {
  match: 'Coincide',
  mismatch: 'Desfase',
  unverified: 'Sin verificar',
  ambiguous: 'No confiable',
};

export type StirrupTakeoffChoice = 'declared_summary' | 'zone_total' | 'mark_for_review';

export const STIRRUP_TAKEOFF_CHOICE_LABEL: Record<StirrupTakeoffChoice, string> = {
  declared_summary: 'Usar resumen del plano',
  zone_total: 'Usar cálculo por zonas',
  mark_for_review: 'Marcar para revisión',
};

export const POSSIBLE_VIEW_MIXING_MESSAGE =
  'Posible mezcla de detalles contiguos. Revisar segmentación.';

export interface StirrupSummaryContract {
  /** Resumen declarado normalizado ("2x240E#3184"), si el detalle lo trae. */
  declaredSummary?: string;
  declaredRaw?: string;
  zones: readonly StirrupContractZoneInput[];
  /** Suma de las zonas del detalle (por repetición/cara). */
  zoneTotalPerRepetition?: number;
  /** Conteo declarado en el resumen (por repetición/cara). */
  declaredPerRepetition?: number;
  /** Repeticiones/caras del resumen (el `2` de `2x240…`). */
  groups?: number;
  barCode?: number;
  lengthCm?: number;
  /** Valor sugerido tras comparar zonas vs resumen (solo si es confiable). */
  suggestedPerRepetition?: number;
  /** Diferencia |zonas − resumen| cuando ambos existen. */
  difference?: number;
  comparisonStatus: StirrupComparisonStatus;
  /** Línea lista para el takeoff — SOLO en `match` (o vía elección humana). */
  suggestedTakeoffLine?: string;
  /** true cuando el desfase parece causado por mezcla de vistas contiguas. */
  possibleViewMixing: boolean;
  /** Zonas excluidas por caer entre dos vistas (segmentación F8D). */
  ambiguousZoneCount: number;
  message: string;
}

export interface StirrupContractInput {
  summary?: StirrupContractSummaryInput;
  zones: readonly StirrupContractZoneInput[];
  /** Zonas descartadas por ambigüedad de vista (informativo). */
  ambiguousZoneCount?: number;
}

// ---------------------------------------------------------------------------
// Construcción del contrato
// ---------------------------------------------------------------------------

export function buildStirrupSummaryContract(
  input: StirrupContractInput,
): StirrupSummaryContract | undefined {
  const { summary, zones } = input;
  const ambiguousZoneCount = input.ambiguousZoneCount ?? 0;
  if (!summary && zones.length === 0) return undefined;

  const zoneTotal = zones.length > 0 ? zones.reduce((acc, zone) => acc + zone.count, 0) : undefined;

  const base = {
    declaredSummary: summary?.normalized,
    declaredRaw: summary?.raw,
    zones,
    zoneTotalPerRepetition: zoneTotal,
    declaredPerRepetition: summary?.countPerGroup,
    groups: summary?.groups,
    barCode: summary?.barCode ?? zones[0]?.barCode,
    lengthCm: summary?.lengthCm,
    ambiguousZoneCount,
  };

  const ambiguousNote =
    ambiguousZoneCount > 0
      ? ` ${ambiguousZoneCount} zona(s) entre dos vistas quedaron excluidas de la suma.`
      : '';

  if (!summary) {
    return {
      ...base,
      comparisonStatus: 'unverified',
      possibleViewMixing: false,
      message: `Zonas de estribos detectadas (suman ${zoneTotal}) sin resumen tipo 2xN para verificar: no se envía automático.${ambiguousNote}`,
    };
  }

  if (zoneTotal === undefined || zones.length < 2) {
    return {
      ...base,
      suggestedPerRepetition: summary.countPerGroup,
      comparisonStatus: 'unverified',
      possibleViewMixing: false,
      message: `Resumen ${summary.normalized} sin zonas suficientes en el detalle para verificar el conteo: no se envía automático; la usuaria puede elegir el resumen del plano.${ambiguousNote}`,
    };
  }

  const difference = Math.abs(zoneTotal - summary.countPerGroup);

  if (zoneTotal === summary.countPerGroup) {
    return {
      ...base,
      difference,
      suggestedPerRepetition: summary.countPerGroup,
      comparisonStatus: 'match',
      suggestedTakeoffLine: summary.normalized,
      possibleViewMixing: false,
      message: `Coincide: las zonas suman ${zoneTotal} y el resumen declara ${summary.countPerGroup} por repetición (${summary.normalized}).${ambiguousNote}`,
    };
  }

  // Subtotal desproporcionado ⇒ la vecindad mezcló zonas de varios detalles
  // (o la segmentación no separó las vistas): evidencia NO confiable.
  if (zoneTotal > summary.countPerGroup * 2 || zoneTotal * 2 < summary.countPerGroup) {
    return {
      ...base,
      difference,
      comparisonStatus: 'ambiguous',
      possibleViewMixing: true,
      message: `Las zonas capturadas suman ${zoneTotal} vs ${summary.countPerGroup} del resumen. ${POSSIBLE_VIEW_MIXING_MESSAGE}${ambiguousNote}`,
    };
  }

  return {
    ...base,
    difference,
    comparisonStatus: 'mismatch',
    possibleViewMixing: false,
    message: `Desfase: las zonas del detalle suman ${zoneTotal} por repetición pero el resumen declara ${summary.countPerGroup}. Diferencia: ${difference}. Requiere decisión humana (no se envía automático).${ambiguousNote}`,
  };
}

// ---------------------------------------------------------------------------
// Resolución de la decisión humana
// ---------------------------------------------------------------------------

export type StirrupChoiceResolution =
  | { ok: true; description: string; note: string }
  | { ok: false; reason: string };

/**
 * Resuelve la elección humana sobre el estribo. `ambiguous` no es elegible
 * (primero revisar segmentación); `mark_for_review` nunca produce línea.
 */
export function resolveStirrupTakeoffChoice(
  contract: StirrupSummaryContract,
  choice: StirrupTakeoffChoice,
): StirrupChoiceResolution {
  if (choice === 'mark_for_review') {
    return { ok: false, reason: 'Marcado para revisión: el estribo NO se envía al takeoff.' };
  }
  if (contract.comparisonStatus === 'ambiguous') {
    return { ok: false, reason: POSSIBLE_VIEW_MIXING_MESSAGE };
  }
  if (choice === 'declared_summary') {
    if (!contract.declaredSummary) {
      return { ok: false, reason: 'El detalle no tiene resumen declarado en el plano.' };
    }
    return {
      ok: true,
      description: contract.declaredSummary,
      note: `Resumen del plano elegido por la usuaria (zonas sumaban ${contract.zoneTotalPerRepetition ?? '—'}).`,
    };
  }
  // choice === 'zone_total'
  if (
    contract.zoneTotalPerRepetition === undefined ||
    contract.groups === undefined ||
    contract.barCode === undefined ||
    contract.lengthCm === undefined
  ) {
    return {
      ok: false,
      reason:
        'No se puede armar la línea por zonas: falta el resumen (repeticiones/longitud de corte) o no hay zonas detectadas.',
    };
  }
  return {
    ok: true,
    description: `${contract.groups}x${contract.zoneTotalPerRepetition}E#${contract.barCode}${contract.lengthCm}`,
    note: `Suma por zonas elegida por la usuaria (el resumen del plano declaraba ${contract.declaredPerRepetition ?? '—'}).`,
  };
}
