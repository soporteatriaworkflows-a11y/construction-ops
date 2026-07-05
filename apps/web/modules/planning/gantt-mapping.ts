/**
 * gantt-mapping.ts — Mapeo PURO de los DTOs del read-model a la forma que espera
 * `frappe-gantt` (Oleada 3B).
 *
 * Propiedad: agent-planning. Funciones PURAS (sin DB, sin React, sin DOM). Se
 * testean como funciones puras; el render real del Gantt vive en el componente
 * cliente `components/planning/gantt-chart.tsx`.
 *
 * NOTAS sobre `frappe-gantt@1.2.2`:
 *  - Cada barra es `{ id, name, start, end, progress, dependencies, custom_class }`.
 *  - `start`/`end` son fechas `YYYY-MM-DD` (interpretadas como días).
 *  - `dependencies` es una lista (string separada por comas) de IDs de
 *    PREDECESORES; frappe sólo dibuja FLECHAS predecesor→sucesor y NO modela la
 *    semántica SS/FF/SF (esa la resuelve nuestro CPM en `cpm.ts`). Las flechas
 *    son informativas; las fechas de cada barra provienen de `plannedStart/End`.
 *  - `progress` es un `number` 0..100 (sólo presentación; el dato autoritativo
 *    es `progressPct` en `DecimalString`).
 *  - frappe normaliza el `id` con `replaceAll(' ', '_')`; usamos UUIDs sin
 *    espacios, así que el id se conserva intacto.
 */

import type {
  DependencyType,
  DependencyView,
  IsoDate,
  ScheduleTaskView,
  Uuid,
} from './types';

/** Barra de tarea en la forma que consume `frappe-gantt`. */
export interface GanttTask {
  id: Uuid;
  /**
   * Etiqueta CORTA de la barra (P2B1): `wbsCode` cuando existe; frappe la
   * dibuja dentro de la barra si cabe. El nombre completo viaja en `fullName`.
   */
  name: string;
  /** Nombre completo ("WBS · nombre") para popup/panel; frappe lo ignora. */
  fullName: string;
  start: IsoDate;
  end: IsoDate;
  /** Avance 0..100 (presentación; redondeado desde `progressPct`). */
  progress: number;
  /** IDs de predecesores (frappe los recibe como lista; arrastra flechas). */
  dependencies: string;
  /** Clases CSS para estilizar (hito, crítica, estado, etc.). */
  custom_class: string;
}

/** Longitud máxima del fallback de etiqueta corta cuando no hay `wbsCode`. */
const SHORT_LABEL_MAX_CHARS = 14;

/**
 * Etiqueta corta de la barra (P2B1): `wbsCode` si es significativo (no vacío y
 * no el placeholder `—`); si no, el nombre truncado a un largo seguro con
 * elipsis. Nunca devuelve cadena vacía (frappe renderiza el label siempre).
 */
export function shortGanttLabel(task: Pick<ScheduleTaskView, 'wbsCode' | 'name'>): string {
  const wbs = task.wbsCode.trim();
  if (wbs !== '' && wbs !== '—') return wbs;
  const name = task.name.trim();
  if (name.length <= SHORT_LABEL_MAX_CHARS) return name || '·';
  return `${name.slice(0, SHORT_LABEL_MAX_CHARS - 1).trimEnd()}…`;
}

/** Nombre completo para popup/panel: "WBS · nombre" (o solo nombre sin WBS). */
export function fullGanttLabel(task: Pick<ScheduleTaskView, 'wbsCode' | 'name'>): string {
  const wbs = task.wbsCode.trim();
  if (wbs !== '' && wbs !== '—') return `${wbs} · ${task.name}`;
  return task.name;
}

/** Opciones del mapeo (qué resaltar según permisos del rol). */
export interface GanttMappingOptions {
  /**
   * IDs de tareas en la ruta crítica. SÓLO se pasa para roles autorizados; para
   * `client` se omite (lista vacía) y no se aplica la clase crítica.
   */
  criticalTaskIds?: readonly Uuid[];
}

/**
 * Redondea un `DecimalString` de porcentaje (0..100) a `number` entero acotado a
 * [0,100] para el render de la barra. NO usa el valor para cálculos.
 *
 * @param progressPct - Avance en `DecimalString`.
 * @returns Entero 0..100.
 */
export function progressToNumber(progressPct: string): number {
  const n = Number.parseFloat(progressPct);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

/**
 * Construye la clase CSS de una barra como UN ÚNICO token SIN espacios.
 *
 * IMPORTANTE: frappe-gantt 1.2.2, en `Bar.refresh()`, ejecuta
 * `classList.add(custom_class)`, que LANZA `InvalidCharacterError` si el valor
 * contiene espacios. Por eso codificamos todas las facetas (estado, hito,
 * crítica) en un único token con separadores `--`, y el CSS usa selectores de
 * subcadena (`[class*="--critical"]`, etc.). Orden de facetas fijo para que el
 * token sea determinista (snapshots estables).
 *
 * @param task - Tarea proyectada.
 * @param isCritical - `true` si pertenece a la ruta crítica (sólo autorizados).
 * @returns Token de clase único, sin espacios.
 */
function buildCustomClass(
  task: ScheduleTaskView,
  isCritical: boolean,
): string {
  let token = `gbar--status-${task.status}`;
  if (task.isMilestone) token += '--milestone';
  if (isCritical) token += '--critical';
  return token;
}

/**
 * Mapea una tarea + sus dependencias entrantes a una `GanttTask`.
 *
 * Para un HITO (`isMilestone`), frappe necesita un `end` posterior al `start`
 * para dibujar la barra; usamos `end = start` y la clase de hito lo representa
 * como un punto (el CSS reduce el ancho). Si `plannedEnd < plannedStart` el
 * dato es inválido aguas arriba; aquí asumimos DTOs ya validados por el dominio.
 *
 * @param task - Tarea proyectada del read-model.
 * @param predecessorIds - IDs de predecesores (de las dependencias).
 * @param criticalSet - Conjunto de IDs críticos (vacío para `client`).
 * @returns Barra Gantt.
 */
export function toGanttTask(
  task: ScheduleTaskView,
  predecessorIds: readonly Uuid[],
  criticalSet: ReadonlySet<Uuid>,
): GanttTask {
  const isCritical = criticalSet.has(task.id);
  return {
    id: task.id,
    name: shortGanttLabel(task),
    fullName: fullGanttLabel(task),
    start: task.plannedStart,
    end: task.plannedEnd,
    progress: progressToNumber(task.progressPct),
    dependencies: predecessorIds.join(','),
    custom_class: buildCustomClass(task, isCritical),
  };
}

/**
 * Indexa, por sucesor, la lista de IDs de predecesores a partir de las
 * dependencias. frappe dibuja una flecha por cada predecesor del sucesor.
 *
 * @param dependencies - Dependencias del cronograma.
 * @returns Mapa `successorTaskId → predecessorTaskId[]`.
 */
export function indexPredecessors(
  dependencies: readonly DependencyView[],
): Map<Uuid, Uuid[]> {
  const bySuccessor = new Map<Uuid, Uuid[]>();
  for (const dep of dependencies) {
    const list = bySuccessor.get(dep.successorTaskId) ?? [];
    list.push(dep.predecessorTaskId);
    bySuccessor.set(dep.successorTaskId, list);
  }
  return bySuccessor;
}

/**
 * Mapea el conjunto completo de tareas + dependencias a barras Gantt, en el
 * orden recibido (que el read-model ya ordena por `sortOrder`).
 *
 * @param tasks - Tareas proyectadas del read-model.
 * @param dependencies - Dependencias proyectadas.
 * @param options - `criticalTaskIds` (omitido/vacío para `client`).
 * @returns Lista de barras Gantt lista para `new Gantt(...)`.
 */
export function mapScheduleToGantt(
  tasks: readonly ScheduleTaskView[],
  dependencies: readonly DependencyView[],
  options: GanttMappingOptions = {},
): GanttTask[] {
  const predecessorsBySuccessor = indexPredecessors(dependencies);
  const criticalSet = new Set<Uuid>(options.criticalTaskIds ?? []);
  return tasks.map((task) =>
    toGanttTask(
      task,
      predecessorsBySuccessor.get(task.id) ?? [],
      criticalSet,
    ),
  );
}

/** Re-exporta el tipo de dependencia por conveniencia de los consumidores. */
export type { DependencyType };
