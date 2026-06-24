/**
 * apu-factor-display.ts — Capa de PRESENTACIÓN read-only de factores del APU
 * (APU_SMART_DEFAULTS_V1A_UI_READONLY). Funciones PURAS, server-safe (sin
 * 'use client', sin DB, sin side-effects). NO recalculan costos: solo describen
 * el valor ya calculado para que el usuario entienda el APU.
 *
 * Alcance V1A: SOLO desperdicio. Rendimiento/cuadrilla quedan fuera (hoy están
 * consolidados dentro de la cantidad del componente; ver doc de discovery).
 *
 * Honestidad de datos: el read-model NO expone un "desperdicio recomendado" por
 * línea (eso llega en V1B). Por eso NO afirmamos "Recomendado": clasificamos el
 * origen por la procedencia del APU (`originType`) y marcamos "Sin clasificar"
 * cuando no se puede saber. El rango sugerido es una banda HEURÍSTICA genérica
 * (pendiente de rangos por recurso en V1E), no una regla financiera.
 */
import type { ApuComponentType, DecimalString } from '@/lib/utils/types';

/** Tipo de chip de origen del valor de desperdicio. */
export type WasteChipKind = 'excel' | 'manual' | 'unclassified' | 'none';

export interface WasteFactorDisplay {
  /** ¿El desperdicio es un factor conceptualmente relevante para este tipo? */
  applies: boolean;
  /** ¿Hay desperdicio aplicado (> 0)? */
  hasWaste: boolean;
  /** Fracción aplicada, passthrough sin alterar (la verdad sigue siendo el dato). */
  wastePct: DecimalString;
  chipKind: WasteChipKind;
  chipLabel: string;
  /** Banda sugerida [min,max] como fracciones, o null si no aplica al tipo. */
  suggestedRange: { min: number; max: number } | null;
  /** `true` si el valor aplicado excede la banda sugerida (advertencia, no error). */
  outOfRange: boolean;
  /** Microcopy de advertencia, o null si está dentro de rango / no aplica. */
  warning: string | null;
}

/** Banda heurística superior de desperdicio para MATERIAL (fracción). */
export const MATERIAL_WASTE_SUGGESTED = { min: 0, max: 0.1 } as const;

/** Microcopy general read-only del bloque de factores. */
export const FACTOR_MICROCOPY = {
  readonlyBanner:
    'Estos valores no se están editando todavía. Se muestran para ayudarte a entender cómo se calcula el APU.',
  recommendedHint:
    'Puedes conservar el valor recomendado o, en una fase posterior, ajustarlo con criterio técnico.',
  outOfRange:
    'Este valor está por fuera del rango sugerido. Verifica si corresponde a una condición especial.',
  performanceNote:
    'Rendimiento y cuadrilla serán tratados en una fase posterior porque actualmente están consolidados dentro de la cantidad del componente.',
} as const;

/** Etiquetas es-CO de cada chip de origen. */
const CHIP_LABELS: Record<WasteChipKind, string> = {
  excel: 'Importado (Excel)',
  manual: 'Manual',
  unclassified: 'Sin clasificar',
  none: 'Sin desperdicio',
};

/** Parseo NO financiero (solo umbral visual). Devuelve 0 ante valor inválido. */
function toNumberSafe(value: DecimalString): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Describe el factor de desperdicio de un componente para la UI read-only. PURA.
 *
 * @param input.componentType - Tipo del componente (material/labor/…).
 * @param input.wastePct - Fracción de desperdicio efectiva del componente.
 * @param input.apuOriginType - Origen del APU ('manual' | 'workbook_import').
 */
export function describeWasteFactor(input: {
  componentType: ApuComponentType;
  wastePct: DecimalString;
  apuOriginType?: string;
}): WasteFactorDisplay {
  const { componentType, wastePct, apuOriginType } = input;
  // El desperdicio es conceptualmente relevante en material y "otros"; en M.O.,
  // equipo, herramienta y subcontrato normalmente es 0 (no se sugiere rango).
  const applies = componentType === 'material' || componentType === 'other';
  const value = toNumberSafe(wastePct);
  const hasWaste = value > 0;

  let chipKind: WasteChipKind;
  if (!hasWaste) {
    chipKind = 'none';
  } else if (apuOriginType === 'manual') {
    chipKind = 'manual';
  } else if (apuOriginType === 'workbook_import') {
    chipKind = 'excel';
  } else {
    chipKind = 'unclassified';
  }

  // Banda sugerida + fuera de rango SOLO para material (heurística genérica).
  const suggestedRange = componentType === 'material' ? { ...MATERIAL_WASTE_SUGGESTED } : null;
  const outOfRange =
    suggestedRange !== null && hasWaste && value > suggestedRange.max;

  return {
    applies,
    hasWaste,
    wastePct,
    chipKind,
    chipLabel: CHIP_LABELS[chipKind],
    suggestedRange,
    outOfRange,
    warning: outOfRange ? FACTOR_MICROCOPY.outOfRange : null,
  };
}

/** Formatea una fracción como porcentaje entero/decimal corto para la UI. PURA. */
export function formatFractionPct(fraction: number): string {
  const pct = fraction * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Texto "X% – Y%" de una banda sugerida. PURA. */
export function formatSuggestedRange(range: { min: number; max: number }): string {
  return `${formatFractionPct(range.min)} – ${formatFractionPct(range.max)}`;
}

/* ----------------------------------------------------------------------------
 * V1B — Lógica read-side de override de desperdicio (recomendado vs aplicado).
 * PURA, sin DB. El valor APLICADO sigue siendo la verdad del motor; el
 * RECOMENDADO se persiste en V1B (columna `recommended_waste_pct`). Mientras la
 * migración no esté aplicada, `recommended` llega `undefined` ⇒ fallback = aplicado.
 * ------------------------------------------------------------------------- */

/**
 * Resuelve el desperdicio recomendado: si no hay recomendado persistido
 * (`undefined`/`null`), el recomendado ES el aplicado (fallback contractual). PURA.
 */
export function resolveRecommendedWaste(
  applied: DecimalString,
  recommended?: DecimalString | null,
): DecimalString {
  return recommended === undefined || recommended === null ? applied : recommended;
}

/** ¿El aplicado difiere del recomendado (override real)? PURA. */
export function isWastePctOverridden(
  applied: DecimalString,
  recommended?: DecimalString | null,
): boolean {
  return toNumberSafe(applied) !== toNumberSafe(resolveRecommendedWaste(applied, recommended));
}

/** Delta aplicado − recomendado, como fracción numérica. PURA. */
export function wastePctDelta(
  applied: DecimalString,
  recommended?: DecimalString | null,
): number {
  return toNumberSafe(applied) - toNumberSafe(resolveRecommendedWaste(applied, recommended));
}

/**
 * ¿Se puede EDITAR el desperdicio de un componente? PURA (espejo de los guards
 * server/RPC; la barrera REAL es la RPC SECURITY DEFINER + RLS). Por seguridad,
 * ante cualquier duda devuelve `false` (no editable).
 */
export function canEditWastePct(input: {
  /** Modo creación habilitado (APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db). */
  creationMode: boolean;
  /** Rol del viewer (gating: management/internal). */
  role: string;
  /** APU archivado ⇒ NO editable. */
  archived: boolean;
}): boolean {
  if (!input.creationMode) return false;
  if (input.archived) return false;
  return input.role === 'management' || input.role === 'internal';
}
