/**
 * duration-criteria.ts — Criterio de duración por tipo de actividad (P2C4a).
 *
 * Propiedad: agent-planning. Módulo PURO (sin DB/React/DOM): clasifica
 * actividades por keywords conservadoras en español, evalúa si la duración
 * planificada cae fuera de un rango razonable y arma el reporte global del
 * cronograma. SOLO advertencias — NUNCA bloquea, NUNCA cambia duraciones,
 * fechas ni el generador.
 *
 * Calibración: los rangos (min/típico/máx, en días) son valores iniciales
 * para vivienda de 1-2 pisos y viven aquí como constantes para que la
 * calibración con obra real sea un cambio trivial de tabla.
 *
 * Privacidad: las advertencias son señal INTERNA de calidad de datos; la UI
 * las gatea con el mismo patrón client-safe de P1 (consulta NO las ve).
 */

import { isoDateToDayIndex } from './date';
import type { IsoDate } from './types';

/** Claves de categoría reconocidas. */
export type DurationCategoryKey =
  | 'preliminares'
  | 'excavacion'
  | 'cimentacion'
  | 'estructura'
  | 'mamposteria'
  | 'cubierta'
  | 'electricas'
  | 'hidrosanitarias'
  | 'acabados'
  | 'carpinteria'
  | 'pintura'
  | 'limpieza';

export interface DurationCategory {
  key: DurationCategoryKey;
  /** Etiqueta humana para el copy. */
  label: string;
  /** Keywords (minúsculas, SIN acentos) que activan la categoría. */
  keywords: readonly string[];
  minDays: number;
  typicalDays: number;
  maxDays: number;
}

/**
 * Tabla de categorías. El ORDEN importa: la primera coincidencia gana (p. ej.
 * "losa de cimentacion" debe caer en cimentación antes de que "losa" caiga en
 * estructura). Keywords deliberadamente conservadoras: mejor una actividad
 * sin clasificar (sin advertencia) que un falso positivo agresivo.
 */
export const DURATION_CATEGORIES: readonly DurationCategory[] = [
  {
    key: 'preliminares',
    label: 'preliminares',
    keywords: ['preliminar', 'campamento', 'localizacion', 'replanteo', 'demolicion'],
    minDays: 1,
    typicalDays: 5,
    maxDays: 20,
  },
  {
    key: 'excavacion',
    label: 'excavación',
    keywords: ['excavacion', 'movimiento de tierra', 'descapote', 'relleno', 'nivelacion'],
    minDays: 2,
    typicalDays: 7,
    maxDays: 30,
  },
  {
    key: 'cimentacion',
    label: 'cimentación',
    keywords: ['cimentacion', 'cimiento', 'zapata', 'pilote', 'viga de amarre', 'solado'],
    minDays: 3,
    typicalDays: 10,
    maxDays: 35,
  },
  {
    key: 'estructura',
    label: 'estructura',
    keywords: ['estructura', 'columna', 'viga', 'losa', 'concreto reforzado', 'acero de refuerzo', 'placa'],
    minDays: 10,
    typicalDays: 30,
    maxDays: 90,
  },
  {
    key: 'mamposteria',
    label: 'mampostería',
    keywords: ['mamposteria', 'muro', 'ladrillo', 'bloque'],
    minDays: 5,
    typicalDays: 20,
    maxDays: 60,
  },
  {
    key: 'cubierta',
    label: 'cubierta',
    keywords: ['cubierta', 'teja', 'canaleta'],
    minDays: 3,
    typicalDays: 10,
    maxDays: 30,
  },
  {
    key: 'electricas',
    label: 'instalaciones eléctricas',
    keywords: ['electric', 'iluminacion', 'tomacorriente', 'cableado', 'tablero'],
    minDays: 5,
    typicalDays: 15,
    maxDays: 45,
  },
  {
    key: 'hidrosanitarias',
    label: 'instalaciones hidrosanitarias',
    keywords: ['hidrosanitari', 'hidraulic', 'sanitari', 'plomeria', 'tuberia', 'desague', 'acueducto', 'aguas lluvias'],
    minDays: 5,
    typicalDays: 15,
    maxDays: 45,
  },
  {
    key: 'acabados',
    label: 'pañetes/acabados',
    keywords: ['panete', 'estuco', 'acabado', 'enchape', 'ceramica', 'baldosa', 'piso'],
    minDays: 5,
    typicalDays: 20,
    maxDays: 60,
  },
  {
    key: 'carpinteria',
    label: 'carpintería',
    keywords: ['carpinteria', 'puerta', 'ventana', 'closet', 'mueble', 'madera'],
    minDays: 3,
    typicalDays: 12,
    maxDays: 40,
  },
  {
    key: 'pintura',
    label: 'pintura',
    keywords: ['pintura', 'pintar'],
    minDays: 3,
    typicalDays: 10,
    maxDays: 30,
  },
  {
    key: 'limpieza',
    label: 'limpieza/entrega',
    keywords: ['limpieza', 'entrega', 'aseo'],
    minDays: 1,
    typicalDays: 3,
    maxDays: 10,
  },
];

/** Veredicto de la evaluación de duración. */
export type DurationVerdict = 'low' | 'ok' | 'high';

/** Normaliza para matching: minúsculas y sin acentos/diacríticos. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Clasifica una actividad por su nombre (y, como respaldo, el capítulo).
 * `null` si no clasifica: la actividad NO recibe advertencia (conservador).
 */
export function classifyActivityDurationCategory(
  name: string,
  chapterName?: string | null,
): DurationCategory | null {
  const sources = [normalize(name), chapterName ? normalize(chapterName) : ''];
  for (const source of sources) {
    if (source === '') continue;
    for (const category of DURATION_CATEGORIES) {
      if (category.keywords.some((keyword) => source.includes(keyword))) return category;
    }
  }
  return null;
}

/**
 * Evalúa una duración (días) contra el rango de la categoría.
 * `null` si no hay categoría o la duración no es un número finito > 0.
 */
export function evaluateActivityDuration(
  days: number,
  category: DurationCategory | null,
): DurationVerdict | null {
  if (!category) return null;
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days < category.minDays) return 'low';
  if (days > category.maxDays) return 'high';
  return 'ok';
}

/** Copy de advertencia por actividad. Tono suave, no alarmista. */
export function getDurationWarningCopy(
  verdict: DurationVerdict,
  category: DurationCategory,
): string | null {
  if (verdict === 'high') {
    return `Duración inusualmente alta para ${category.label} (rango sugerido ${category.minDays}–${category.maxDays} días). Revisar antes de publicar.`;
  }
  if (verdict === 'low') {
    return `Duración inusualmente baja para ${category.label} (rango sugerido ${category.minDays}–${category.maxDays} días). Revisar antes de publicar.`;
  }
  return null;
}

/** Entrada mínima del reporte (subconjunto de WorkspaceTask/ScheduleTaskView). */
export interface DurationReportTask {
  id: string;
  name: string;
  chapterName?: string | null;
  taskType: string | null;
  isMilestone: boolean;
  plannedDurationDays: string | number;
  plannedStart: string;
  plannedEnd: string;
}

export interface DurationReportItem {
  taskId: string;
  name: string;
  categoryKey: DurationCategoryKey;
  categoryLabel: string;
  days: number;
  verdict: Exclude<DurationVerdict, 'ok'>;
}

export interface ScheduleDurationReport {
  /** Rango calendario inclusivo (días) que cubren las tareas; 0 sin fechas. */
  totalDays: number;
  outOfRangeCount: number;
  highCount: number;
  lowCount: number;
  /** SOLO las actividades fuera de rango. */
  items: DurationReportItem[];
}

/**
 * Reporte global del cronograma: rango total + actividades fuera del rango
 * sugerido. Considera SOLO actividades (excluye capítulos e hitos). Puro y
 * determinista; nunca lanza (fechas inválidas se ignoran para el total).
 */
export function buildScheduleDurationReport(
  tasks: ReadonlyArray<DurationReportTask>,
): ScheduleDurationReport {
  let minDay = Number.POSITIVE_INFINITY;
  let maxDay = Number.NEGATIVE_INFINITY;
  const items: DurationReportItem[] = [];
  let highCount = 0;
  let lowCount = 0;

  for (const task of tasks) {
    const start = tryDayIndex(task.plannedStart);
    const end = tryDayIndex(task.plannedEnd);
    if (start !== null && end !== null && end >= start) {
      if (start < minDay) minDay = start;
      if (end > maxDay) maxDay = end;
    }

    if (task.taskType !== 'activity' || task.isMilestone) continue;
    const category = classifyActivityDurationCategory(task.name, task.chapterName);
    if (!category) continue;
    const days = Number(task.plannedDurationDays);
    const verdict = evaluateActivityDuration(days, category);
    if (verdict !== 'low' && verdict !== 'high') continue;
    if (verdict === 'high') highCount += 1;
    else lowCount += 1;
    items.push({
      taskId: task.id,
      name: task.name,
      categoryKey: category.key,
      categoryLabel: category.label,
      days,
      verdict,
    });
  }

  const totalDays =
    Number.isFinite(minDay) && Number.isFinite(maxDay) ? maxDay - minDay + 1 : 0;

  return {
    totalDays,
    outOfRangeCount: items.length,
    highCount,
    lowCount,
    items,
  };
}

function tryDayIndex(value: string): number | null {
  try {
    return isoDateToDayIndex(value as IsoDate);
  } catch {
    return null;
  }
}
