/**
 * date.ts — Conversión fecha de calendario ↔ índice de día (planning).
 *
 * Propiedad: agent-planning. El CPM opera sobre un eje temporal continuo medido
 * en DÍAS. Para evitar derivas por zona horaria, las fechas `IsoDate`
 * (`YYYY-MM-DD`) se interpretan SIEMPRE en UTC (regla técnica: nunca cadenas
 * locales sin TZ). El índice de día es el número de días enteros desde la época
 * Unix; las operaciones de calendario usan `Date.UTC`.
 *
 * CONVENCIÓN DE DURACIÓN (inclusiva, estilo cronograma de obra):
 *   - Una tarea con `plannedStart = plannedEnd` (mismo día) dura 1 día.
 *   - `durationDays(start, end) = (endIndex − startIndex) + 1`.
 *   - Un hito tiene `plannedStart = plannedEnd` y duración planificada 0; en el
 *     eje del CPM ocupa un instante (no consume días).
 *
 * El CPM interno trabaja con "duración efectiva en el eje": para una tarea
 * normal de N días, su finish = start + N (en unidades de eje), donde una tarea
 * de 1 día calendario equivale a 1 unidad de eje. Los hitos usan duración 0.
 */

import { PlanningError } from './types';
import type { IsoDate, Uuid } from './types';

/** Milisegundos por día. */
const MS_PER_DAY = 86_400_000;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte un `IsoDate` (`YYYY-MM-DD`, UTC) a índice de día entero (días desde
 * la época Unix).
 *
 * @param value - Fecha de calendario ISO.
 * @param context - IDs de tarea para enriquecer el error (opcional).
 * @returns Índice de día entero.
 * @throws PlanningError('invalid_dates') si la fecha es inválida.
 */
export function isoDateToDayIndex(value: IsoDate, context?: Uuid[]): number {
  const m = ISO_DATE_RE.exec(value);
  if (!m) {
    throw new PlanningError(
      'invalid_dates',
      `Fecha ISO inválida (se esperaba YYYY-MM-DD): "${value}"`,
      context,
    );
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ts = Date.UTC(year, month - 1, day);
  const d = new Date(ts);
  // Valida que no haya overflow (ej. 2026-02-31 → marzo).
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new PlanningError(
      'invalid_dates',
      `Fecha de calendario inexistente: "${value}"`,
      context,
    );
  }
  return Math.round(ts / MS_PER_DAY);
}

/**
 * Convierte un índice de día entero a `IsoDate` (`YYYY-MM-DD`, UTC).
 *
 * @param dayIndex - Índice de día entero.
 * @returns Fecha de calendario ISO.
 */
export function dayIndexToIsoDate(dayIndex: number): IsoDate {
  const d = new Date(Math.round(dayIndex) * MS_PER_DAY);
  const year = d.getUTCFullYear().toString().padStart(4, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Duración calendario inclusiva entre dos fechas, en días.
 * `start === end` ⇒ 1 día. Requiere `end >= start`.
 *
 * @param start - Fecha de inicio.
 * @param end - Fecha de fin.
 * @param context - IDs de tarea para el error.
 * @returns Días inclusivos (entero >= 1).
 * @throws PlanningError('invalid_dates') si `end < start`.
 */
export function inclusiveDurationDays(
  start: IsoDate,
  end: IsoDate,
  context?: Uuid[],
): number {
  const s = isoDateToDayIndex(start, context);
  const e = isoDateToDayIndex(end, context);
  if (e < s) {
    throw new PlanningError(
      'invalid_dates',
      `plannedEnd (${end}) anterior a plannedStart (${start})`,
      context,
    );
  }
  return e - s + 1;
}
