/**
 * apu-productivity-display.ts — Capa de PRESENTACIÓN read-only del rendimiento /
 * cuadrilla de un componente de mano de obra (APU_PRODUCTIVITY_CREW_OVERRIDES_V1A).
 *
 * Funciones PURAS, server-safe (sin 'use client', sin DB, sin side-effects, sin
 * server actions). NO recalculan ni alteran `quantity`, `unit_price_snapshot`,
 * `total_component_cost` ni ningún costo: solo DESCRIBEN el dato existente.
 *
 * Honestidad de datos (ver docs/engineering/apu-productivity-crew-overrides-v1.md):
 * hoy el rendimiento laboral NO es un dato de primera clase. `buildCrewLaborComponent`
 * calcula `quantity = performanceDays × memberCount` y SOLO persiste `quantity`.
 * Por eso NO afirmamos un rendimiento ni una cuadrilla concretos: la cantidad
 * representa un consumo laboral CONSOLIDADO (persona·día por unidad de obra). La
 * edición de rendimiento/cuadrilla llega en una fase posterior (V1C).
 */
import type { ApuComponentType, DecimalString } from '@/lib/utils/types';

/**
 * Estado del rendimiento de un componente, para la UI read-only:
 *  - `inherited`      → componente de M.O. con cantidad consolidada (> 0).
 *  - `unavailable`    → componente de M.O. sin cantidad usable (0/invÁlida).
 *  - `not_applicable` → no es mano de obra (el rendimiento no aplica).
 */
export type ProductivityStatus = 'inherited' | 'unavailable' | 'not_applicable';

export interface LaborProductivityDisplay {
  /** ¿El rendimiento es un concepto aplicable a este componente (= es M.O.)? */
  applies: boolean;
  status: ProductivityStatus;
  /** Etiqueta corta para el chip (es-CO), o null si no aplica. */
  chipLabel: string | null;
  /** Texto explicativo corto, o null si no aplica. */
  description: string | null;
  /** Nota sobre la fase posterior, o null si no aplica. */
  futureNote: string | null;
  /** Etiqueta segura de la cantidad consolidada, o null si no aplica/usable. */
  quantityLabel: string | null;
}

/** Microcopy es-CO read-only del bloque de rendimiento/cuadrilla. */
export const PRODUCTIVITY_MICROCOPY = {
  chipInherited: 'Rendimiento heredado',
  chipConsolidated: 'Mano de obra consolidada',
  description:
    'La cantidad actual conserva el consumo laboral consolidado del APU.',
  futureNote:
    'Rendimiento y cuadrilla se habilitarán en una fase posterior.',
  unavailable:
    'Este componente conserva una cantidad consolidada de mano de obra.',
} as const;

/** ¿El componente es de mano de obra? PURA. */
export function isLaborComponent(componentType: ApuComponentType): boolean {
  return componentType === 'labor';
}

/** Parseo NO financiero (solo para clasificar estado). Devuelve NaN si inválido. */
function toNumber(value: DecimalString): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Construye la etiqueta segura de la cantidad consolidada de M.O. No afirma un
 * rendimiento ni una cuadrilla: solo nombra la cantidad como persona·día por
 * unidad de obra (encoding actual `quantity = performanceDays × memberCount`).
 * PURA.
 *
 * @param quantityText - Cantidad ya formateada por la capa de UI (passthrough).
 */
export function formattedQuantityLabel(quantityText: string): string {
  return `Cantidad consolidada: ${quantityText} persona·día / unidad`;
}

/**
 * Describe el rendimiento/cuadrilla de un componente para la UI read-only. PURA.
 * No altera el valor: la `quantity` sigue siendo la verdad del motor.
 *
 * @param input.componentType - Tipo del componente (material/labor/…).
 * @param input.quantity - Cantidad efectiva del componente (passthrough).
 * @param input.quantityText - Cantidad ya formateada (opcional) para el label.
 */
export function resolveLaborProductivityDisplay(input: {
  componentType: ApuComponentType;
  quantity: DecimalString;
  quantityText?: string;
}): LaborProductivityDisplay {
  const { componentType, quantity, quantityText } = input;

  if (!isLaborComponent(componentType)) {
    return {
      applies: false,
      status: 'not_applicable',
      chipLabel: null,
      description: null,
      futureNote: null,
      quantityLabel: null,
    };
  }

  const value = toNumber(quantity);
  const usable = Number.isFinite(value) && value > 0;
  const status: ProductivityStatus = usable ? 'inherited' : 'unavailable';

  return {
    applies: true,
    status,
    chipLabel: usable
      ? PRODUCTIVITY_MICROCOPY.chipInherited
      : PRODUCTIVITY_MICROCOPY.chipConsolidated,
    description: usable
      ? PRODUCTIVITY_MICROCOPY.description
      : PRODUCTIVITY_MICROCOPY.unavailable,
    futureNote: PRODUCTIVITY_MICROCOPY.futureNote,
    quantityLabel: usable && quantityText ? formattedQuantityLabel(quantityText) : null,
  };
}

/* ----------------------------------------------------------------------------
 * V1B — Estado del override de rendimiento (read-side). PURO, sin DB. Refleja la
 * metadata persistida por la migración aditiva (NULL = heredado). La edición NO
 * está activa todavía (llega en V1C); esto solo describe el estado para la UI.
 * ------------------------------------------------------------------------- */

/**
 * Estado del override de rendimiento de un componente, derivado de la metadata
 * persistida (`productivity_source`) y el tipo:
 *  - `not_applicable` → no es labor.
 *  - `manual`         → override aplicado por experto (`source = 'manual'`).
 *  - `reset`          → restaurado al recomendado (`source = 'reset'`).
 *  - `inherited`      → labor con cantidad usable y sin override (source NULL).
 *  - `unavailable`    → labor sin cantidad usable y sin override.
 */
export type ProductivityOverrideStatus =
  | 'not_applicable'
  | 'manual'
  | 'reset'
  | 'inherited'
  | 'unavailable';

/** Deriva el estado del override de rendimiento. PURA (no edita ni recalcula). */
export function resolveProductivityOverrideStatus(input: {
  componentType: ApuComponentType;
  quantity: DecimalString;
  productivitySource?: string | null;
}): ProductivityOverrideStatus {
  if (input.componentType !== 'labor') return 'not_applicable';
  if (input.productivitySource === 'manual') return 'manual';
  if (input.productivitySource === 'reset') return 'reset';
  const n = Number(input.quantity);
  return Number.isFinite(n) && n > 0 ? 'inherited' : 'unavailable';
}

/** Texto de presentación de un valor de rendimiento + unidad. PURA. */
export function formatProductivityDisplay(
  value: DecimalString | null | undefined,
  unit?: string | null,
): string {
  if (value === null || value === undefined || value === '') return 'No disponible';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'No disponible';
  const num = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  switch (unit) {
    case 'unit_per_crew_day':
      return `${num} unidades / día de cuadrilla`;
    case 'person_day_per_unit':
      return `${num} persona·día / unidad`;
    default:
      return num;
  }
}
