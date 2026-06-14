/**
 * generator.ts — Generador de cronograma desde BOQ (SCHEDULE_FROM_BOQ_V1).
 *
 * Propiedad: agent-orchestrator. Espejo de `docs/SCHEDULE_FROM_BOQ_V1_CONTRACT.md`
 * §3–§5. Dominio PURO: sin DB, sin React, sin efectos. Recibe la estructura ya
 * leída del presupuesto (capítulos + ítems BOQ + rendimiento APO inyectado) y
 * produce un PREVIEW read-only de las tareas que se crearían. NO escribe nada;
 * la persistencia (server action) consume este preview en una fase posterior.
 *
 * Reglas congeladas:
 *   - El preview NO muta sus entradas ni toca BOQ/APU/quantities/precios.
 *   - Capítulos ⇒ tareas resumen (`task_type='chapter'`).
 *   - Ítems BOQ ⇒ actividades (`task_type='activity'`), con `boq_item_id`,
 *     `apu_template_id` (si existe), `quantity_snapshot` y `unit_snapshot`.
 *   - Duración conservadora: nunca se inventa exactitud (ver §4 del contrato).
 *   - `productivity_source` ∈ {apu, manual, unknown}.
 */

import { toDecimal, gt } from './decimal';
import { dayIndexToIsoDate, isoDateToDayIndex } from './date';
import type { DecimalString, IsoDate, Uuid } from './types';

/* ----------------------------------------------------------------------------
 * Entradas (DTOs inyectados por la capa server-side; aquí solo datos puros)
 * ------------------------------------------------------------------------- */

/** Capítulo del presupuesto (espejo de `chapters`). */
export interface GeneratorChapterInput {
  id: Uuid;
  code: string;
  name: string;
  sortOrder: number;
}

/** Ítem BOQ + rendimiento APU pre-resuelto (espejo de `boq_items` + APU). */
export interface GeneratorItemInput {
  /** id del `boq_items` (se persiste como `boq_item_id`). */
  boqItemId: Uuid;
  chapterId: Uuid;
  code: string;
  description: string;
  /** unidad del BOQ (se congela como `unit_snapshot`). */
  unit: string;
  /** cantidad del BOQ (se congela como `quantity_snapshot`). */
  quantity: DecimalString;
  /** APU vinculado al ítem, si lo hay. `null` ⇒ ítem sin APU. */
  apuTemplateId: Uuid | null;
  /**
   * Persona·días por unidad de actividad = Σ(quantity de componentes labor del
   * APU), donde cada `quantity_labor = rendimiento_días × integrantes`. La capa
   * server-side lo calcula desde `getApuDetail`. Semántica:
   *   - `null`  ⇒ no hay APU (coincide con `apuTemplateId === null`).
   *   - `'0'`/≤0 ⇒ hay APU pero sin rendimiento laboral usable.
   *   - `>0`     ⇒ rendimiento usable ⇒ duración estimable.
   */
  apuLaborPersonDaysPerUnit: DecimalString | null;
}

/** Opciones del generador (espejo del contrato §3). */
export interface GeneratorOptions {
  scheduleName: string;
  startDate: IsoDate;
  /** Crear tareas resumen por capítulo (default true). */
  includeChapters: boolean;
  /** Omitir ítems con cantidad ≤ 0 (default true). */
  onlyPositiveQuantity: boolean;
  /** Incluir ítems sin APU (default true). Si false, se omiten y se cuentan. */
  includeItemsWithoutApu: boolean;
  /** Crear un hito de cierre por capítulo (default false). */
  createChapterMilestones: boolean;
  /** Duración mínima (días enteros ≥ 1) de cualquier actividad (default 1). */
  minDurationDays: number;
  /** Tamaño de cuadrilla por defecto para estimar duración (editable; default '1'). */
  defaultCrewSize: DecimalString;
  /**
   * Prefijo de `wbs_code` para garantizar unicidad por proyecto entre cronogramas
   * (la UNIQUE es `(project_id, wbs_code)`). La persistencia pasa un token único
   * por cronograma; en el dominio puro default ''.
   */
  wbsPrefix?: string;
}

export interface GeneratorInput {
  chapters: GeneratorChapterInput[];
  items: GeneratorItemInput[];
  options: GeneratorOptions;
}

/* ----------------------------------------------------------------------------
 * Salida (preview read-only)
 * ------------------------------------------------------------------------- */

export type ProductivitySource = 'apu' | 'manual' | 'unknown';
export type GeneratorTaskType = 'chapter' | 'activity' | 'milestone';
export type GeneratorWarningKind = 'no_apu' | 'no_rendimiento';

export interface GeneratorWarning {
  kind: GeneratorWarningKind;
  boqItemId: Uuid;
  itemCode: string;
  message: string;
}

/**
 * Tarea proyectada por el preview. `tempId`/`parentTempId` son identificadores
 * deterministas del preview (no UUID de DB); la persistencia los resuelve a
 * `id`/`parent_task_id` reales tras insertar.
 */
export interface PreviewTask {
  tempId: string;
  parentTempId: string | null;
  taskType: GeneratorTaskType;
  wbsCode: string;
  name: string;
  unitSnapshot: string | null;
  quantitySnapshot: DecimalString | null;
  boqItemId: Uuid | null;
  chapterId: Uuid | null;
  apuTemplateId: Uuid | null;
  durationDays: number;
  plannedStart: IsoDate;
  plannedEnd: IsoDate;
  progressPct: DecimalString;
  isMilestone: boolean;
  productivitySource: ProductivitySource | null;
  crewSize: DecimalString | null;
  sortOrder: number;
  /** Advertencias específicas de esta actividad (vacío en capítulos/hitos). */
  warnings: GeneratorWarning[];
}

export interface GeneratorStats {
  chapterCount: number;
  activityCount: number;
  milestoneCount: number;
  /** Actividades con duración derivada del rendimiento APU. */
  activitiesWithApu: number;
  /** Actividades sin APU vinculado. */
  activitiesWithoutApu: number;
  /** Actividades con APU pero sin rendimiento laboral usable. */
  activitiesWithoutRendimiento: number;
  /** Ítems omitidos por cantidad ≤ 0 (opción activa). */
  omittedZeroQuantity: number;
  /** Ítems omitidos por no tener APU (cuando includeItemsWithoutApu=false). */
  omittedWithoutApu: number;
  totalTasks: number;
  /** Σ de duraciones de actividades (proxy de esfuerzo, NO el lapso). */
  totalActivityDurationDays: number;
  /** Lapso inclusivo del cronograma (de start_date a la fecha fin más tardía). */
  scheduleSpanDays: number;
}

export interface GeneratorPreview {
  scheduleName: string;
  startDate: IsoDate;
  /** Fecha fin más tardía del preview (o startDate si no hay tareas). */
  endDate: IsoDate;
  tasks: PreviewTask[];
  /** Todas las advertencias agregadas (sin APU / sin rendimiento). */
  warnings: GeneratorWarning[];
  stats: GeneratorStats;
}

/* ----------------------------------------------------------------------------
 * Estimador de duración (§4) — conservador, sin inventar exactitud
 * ------------------------------------------------------------------------- */

export interface DurationEstimate {
  durationDays: number;
  productivitySource: ProductivitySource;
  warning: GeneratorWarningKind | null;
}

/** Normaliza `minDurationDays` a entero ≥ 1. */
function normalizedMinDuration(min: number): number {
  if (!Number.isFinite(min)) return 1;
  const floored = Math.floor(min);
  return floored >= 1 ? floored : 1;
}

/**
 * Estima la duración de una actividad SIN inventar exactitud (contrato §4):
 *   - Sin APU (`apuTemplateId === null`) ⇒ duración mínima, source `manual`,
 *     warning `no_apu`.
 *   - Con APU pero sin rendimiento usable (persona·días ≤ 0 o nulo) ⇒ duración
 *     mínima, source `unknown`, warning `no_rendimiento`.
 *   - Con rendimiento usable ⇒ `ceil(cantidad × persona·días/unidad / crew) `,
 *     acotado al mínimo; source `apu`.
 */
export function estimateActivityDuration(
  item: GeneratorItemInput,
  options: Pick<GeneratorOptions, 'minDurationDays' | 'defaultCrewSize'>,
): DurationEstimate {
  const min = normalizedMinDuration(options.minDurationDays);

  if (item.apuTemplateId === null) {
    return { durationDays: min, productivitySource: 'manual', warning: 'no_apu' };
  }

  const personDays = item.apuLaborPersonDaysPerUnit;
  if (personDays === null || !gt(personDays, '0')) {
    return {
      durationDays: min,
      productivitySource: 'unknown',
      warning: 'no_rendimiento',
    };
  }

  // Crew size válido (> 0); si no, 1.
  const crew = gt(options.defaultCrewSize, '0') ? options.defaultCrewSize : '1';
  const raw = toDecimal(item.quantity)
    .times(toDecimal(personDays))
    .div(toDecimal(crew));
  // Días enteros hacia arriba (nunca menos del mínimo, nunca < 1).
  const ceil = raw.ceil().toNumber();
  const durationDays = Math.max(min, Number.isFinite(ceil) && ceil >= 1 ? ceil : min);
  return { durationDays, productivitySource: 'apu', warning: null };
}

/* ----------------------------------------------------------------------------
 * Generador de preview (§3) — read-only, puro
 * ------------------------------------------------------------------------- */

/** `plannedEnd` inclusivo de una tarea de `durationDays` que inicia en `start`. */
function inclusiveEnd(start: IsoDate, durationDays: number): IsoDate {
  const startIdx = isoDateToDayIndex(start);
  // Duración inclusiva: 1 día ⇒ end = start. N días ⇒ end = start + (N-1).
  return dayIndexToIsoDate(startIdx + Math.max(0, durationDays - 1));
}

function isPositive(quantity: DecimalString): boolean {
  return gt(quantity, '0');
}

/**
 * Construye el PREVIEW del cronograma desde el BOQ. Función PURA: no escribe, no
 * muta sus entradas, no accede a DB. Devuelve las tareas que se crearían más
 * estadísticas y advertencias.
 *
 * @param input - Capítulos, ítems BOQ (con rendimiento APU pre-resuelto) y opciones.
 * @returns Preview read-only.
 */
export function buildScheduleFromBoqPreview(input: GeneratorInput): GeneratorPreview {
  const { chapters, items, options } = input;
  const prefix = options.wbsPrefix ?? '';
  const startDate = options.startDate;

  // Índice de ítems por capítulo, preservando el orden recibido.
  const itemsByChapter = new Map<Uuid, GeneratorItemInput[]>();
  for (const it of items) {
    const list = itemsByChapter.get(it.chapterId);
    if (list) list.push(it);
    else itemsByChapter.set(it.chapterId, [it]);
  }

  const tasks: PreviewTask[] = [];
  const warnings: GeneratorWarning[] = [];
  const stats: GeneratorStats = {
    chapterCount: 0,
    activityCount: 0,
    milestoneCount: 0,
    activitiesWithApu: 0,
    activitiesWithoutApu: 0,
    activitiesWithoutRendimiento: 0,
    omittedZeroQuantity: 0,
    omittedWithoutApu: 0,
    totalTasks: 0,
    totalActivityDurationDays: 0,
    scheduleSpanDays: 0,
  };

  let sortOrder = 0;
  let latestEndIdx = isoDateToDayIndex(startDate);

  // Capítulos en su orden declarado (sortOrder, luego code estable).
  const orderedChapters = [...chapters].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );

  for (const chapter of orderedChapters) {
    const chapterItems = itemsByChapter.get(chapter.id) ?? [];

    // Resolver actividades incluidas de este capítulo.
    const activityTasks: PreviewTask[] = [];
    for (const item of chapterItems) {
      // Omitir cantidad ≤ 0 si la opción está activa.
      if (options.onlyPositiveQuantity && !isPositive(item.quantity)) {
        stats.omittedZeroQuantity += 1;
        continue;
      }
      // Omitir ítems sin APU si la opción lo pide.
      if (!options.includeItemsWithoutApu && item.apuTemplateId === null) {
        stats.omittedWithoutApu += 1;
        continue;
      }

      const est = estimateActivityDuration(item, options);
      const itemWarnings: GeneratorWarning[] = [];
      if (est.warning === 'no_apu') {
        const w: GeneratorWarning = {
          kind: 'no_apu',
          boqItemId: item.boqItemId,
          itemCode: item.code,
          message: `El ítem ${item.code} no tiene APU vinculado; duración manual (mínima) aplicada.`,
        };
        itemWarnings.push(w);
        warnings.push(w);
        stats.activitiesWithoutApu += 1;
      } else if (est.warning === 'no_rendimiento') {
        const w: GeneratorWarning = {
          kind: 'no_rendimiento',
          boqItemId: item.boqItemId,
          itemCode: item.code,
          message: `El APU del ítem ${item.code} no tiene rendimiento laboral usable; duración manual (mínima) aplicada.`,
        };
        itemWarnings.push(w);
        warnings.push(w);
        stats.activitiesWithoutRendimiento += 1;
      } else {
        stats.activitiesWithApu += 1;
      }

      const tempId = `item:${item.boqItemId}`;
      const plannedStart = startDate; // §5: sin dependencia ⇒ inicia en start del cronograma.
      const plannedEnd = inclusiveEnd(plannedStart, est.durationDays);
      activityTasks.push({
        tempId,
        parentTempId: null, // se asigna al emitir el capítulo (o queda null sin capítulos).
        taskType: 'activity',
        wbsCode: '', // se asigna abajo con el índice dentro del capítulo.
        name: item.description,
        unitSnapshot: item.unit,
        quantitySnapshot: item.quantity,
        boqItemId: item.boqItemId,
        chapterId: item.chapterId,
        apuTemplateId: item.apuTemplateId,
        durationDays: est.durationDays,
        plannedStart,
        plannedEnd,
        progressPct: '0',
        isMilestone: false,
        productivitySource: est.productivitySource,
        crewSize:
          est.productivitySource === 'apu'
            ? gt(options.defaultCrewSize, '0')
              ? options.defaultCrewSize
              : '1'
            : null,
        sortOrder: 0, // se asigna al aplanar.
        warnings: itemWarnings,
      });
    }

    // Capítulo vacío (sin actividades incluidas) ⇒ no se emite.
    if (activityTasks.length === 0) continue;

    // Lapso del capítulo (todas inician en startDate ⇒ end = la más larga).
    let chapterEndIdx = isoDateToDayIndex(startDate);
    for (const a of activityTasks) {
      const e = isoDateToDayIndex(a.plannedEnd);
      if (e > chapterEndIdx) chapterEndIdx = e;
    }
    const chapterEnd = dayIndexToIsoDate(chapterEndIdx);
    const chapterDuration = chapterEndIdx - isoDateToDayIndex(startDate) + 1;

    const chapterTempId = `chapter:${chapter.id}`;

    // Emitir capítulo (si includeChapters) ANTES de sus actividades.
    if (options.includeChapters) {
      stats.chapterCount += 1;
      tasks.push({
        tempId: chapterTempId,
        parentTempId: null,
        taskType: 'chapter',
        wbsCode: `${prefix}${chapter.code}`,
        name: chapter.name,
        unitSnapshot: null,
        quantitySnapshot: null,
        boqItemId: null,
        chapterId: chapter.id,
        apuTemplateId: null,
        durationDays: chapterDuration,
        plannedStart: startDate,
        plannedEnd: chapterEnd,
        progressPct: '0',
        isMilestone: false,
        productivitySource: null,
        crewSize: null,
        sortOrder: sortOrder++,
        warnings: [],
      });
    }

    // Emitir actividades, asignando wbs/sortOrder/parent.
    let activityIndex = 0;
    for (const a of activityTasks) {
      activityIndex += 1;
      a.parentTempId = options.includeChapters ? chapterTempId : null;
      a.wbsCode = `${prefix}${chapter.code}.${String(activityIndex).padStart(3, '0')}`;
      a.sortOrder = sortOrder++;
      tasks.push(a);
      stats.activityCount += 1;
      stats.totalActivityDurationDays += a.durationDays;
    }

    // Hito de cierre del capítulo (opcional).
    if (options.createChapterMilestones) {
      stats.milestoneCount += 1;
      tasks.push({
        tempId: `milestone:${chapter.id}`,
        parentTempId: options.includeChapters ? chapterTempId : null,
        taskType: 'milestone',
        wbsCode: `${prefix}${chapter.code}.M`,
        name: `Fin ${chapter.name}`,
        unitSnapshot: null,
        quantitySnapshot: null,
        boqItemId: null,
        chapterId: chapter.id,
        apuTemplateId: null,
        durationDays: 0,
        plannedStart: chapterEnd,
        plannedEnd: chapterEnd, // hito ⇒ start = end, duración 0.
        progressPct: '0',
        isMilestone: true,
        productivitySource: null,
        crewSize: null,
        sortOrder: sortOrder++,
        warnings: [],
      });
    }

    if (chapterEndIdx > latestEndIdx) latestEndIdx = chapterEndIdx;
  }

  stats.totalTasks = tasks.length;
  stats.scheduleSpanDays = latestEndIdx - isoDateToDayIndex(startDate) + 1;

  return {
    scheduleName: options.scheduleName,
    startDate,
    endDate: dayIndexToIsoDate(latestEndIdx),
    tasks,
    warnings,
    stats,
  };
}
