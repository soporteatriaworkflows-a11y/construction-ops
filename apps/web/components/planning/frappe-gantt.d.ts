/**
 * frappe-gantt.d.ts — Declaración de tipos mínima para `frappe-gantt@1.2.2`.
 *
 * Propiedad: agent-planning. La librería (MIT) NO publica tipos. Declaramos
 * SÓLO la superficie que usa el componente cliente `gantt-chart.tsx`. No es una
 * tipificación exhaustiva: cubre el constructor y los métodos empleados.
 *
 * Ref: node_modules/frappe-gantt/src/index.js (clase `Gantt`).
 */

declare module 'frappe-gantt' {
  /** Barra de tarea aceptada por el constructor de Gantt. */
  export interface GanttTaskInput {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    /** Lista de IDs de predecesores separada por comas (o array). */
    dependencies?: string | string[];
    custom_class?: string;
  }

  /** Modos de vista soportados por frappe-gantt 1.x. */
  export type GanttViewMode =
    | 'Quarter Day'
    | 'Half Day'
    | 'Day'
    | 'Week'
    | 'Month'
    | 'Year';

  /** Subconjunto de opciones del constructor que usa el componente. */
  export interface GanttOptions {
    view_mode?: GanttViewMode;
    date_format?: string;
    language?: string;
    readonly?: boolean;
    infinite_padding?: boolean;
    popup_on?: 'click' | 'hover';
    /** Render de popup personalizado (devuelve HTML string o false). */
    popup?: (ctx: { task: GanttTaskInput }) => string | false | void;
  }

  /** Instancia de Gantt. */
  export default class Gantt {
    constructor(
      wrapper: string | HTMLElement | SVGElement,
      tasks: GanttTaskInput[],
      options?: GanttOptions,
    );
    /** Refresca las barras con un nuevo conjunto de tareas. */
    refresh(tasks: GanttTaskInput[]): void;
    /** Cambia el modo de vista. */
    change_view_mode(mode?: GanttViewMode): void;
  }
}
