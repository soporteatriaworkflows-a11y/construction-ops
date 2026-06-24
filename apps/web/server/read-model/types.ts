/**
 * types.ts — Tipos internos del read-model y proyección por rol.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/READ_MODEL_CONTRACT.md §3`.
 *
 * Los repositorios calculan internamente un `DashboardSummary` COMPLETO (con los
 * campos 🔒 `projectedSaving`/`realizedSaving`/`pricingCoverage`). La proyección
 * por rol OMITE esos campos antes de devolver el DTO a rol `client`
 * (privacidad backend-first: no basta ocultarlos en UI).
 *
 * El resto de DTOs del read-model ya son cliente-safe por diseño (sólo exponen
 * precio presupuestado/subtotales/totales del presupuesto, nunca precio público,
 * descuentos ni proveedor interno).
 */

import type {
  ApuComponentView,
  ApuDetail,
  DashboardSummary,
  ProgressEntryView,
  ResourceAssignmentView,
  ScheduleSummary,
  ScheduleTaskView,
  ViewerRole,
} from '@/lib/contracts/read-model';

/** Campos 🔒 de `DashboardSummary` que sólo ven roles autorizados. */
export const INTERNAL_DASHBOARD_FIELDS = [
  'projectedSaving',
  'realizedSaving',
  'pricingCoverage',
] as const satisfies ReadonlyArray<keyof DashboardSummary>;

export type InternalDashboardField = (typeof INTERNAL_DASHBOARD_FIELDS)[number];

/** Roles autorizados a ver los campos financieros internos del dashboard. */
const ROLES_WITH_INTERNAL_FIELDS: ReadonlySet<ViewerRole> = new Set<ViewerRole>([
  'management',
  'internal',
]);

/**
 * Indica si un rol puede recibir los campos 🔒 internos (ahorros, cobertura de
 * precios). `client` y `site` NO los reciben.
 *
 * @param role - Rol del viewer.
 * @returns `true` para `management`/`internal`.
 */
export function canSeeInternalDashboardFields(role: ViewerRole): boolean {
  return ROLES_WITH_INTERNAL_FIELDS.has(role);
}

/**
 * Proyecta un `DashboardSummary` COMPLETO según el rol: para roles no
 * autorizados (`client`/`site`) OMITE los campos 🔒 antes de serializar. La
 * omisión es real (las claves no existen en el objeto resultante), no un
 * `undefined` cosmético.
 *
 * @param full - Resumen completo calculado server-side (con campos internos).
 * @param role - Rol del viewer.
 * @returns DTO proyectado (sin campos 🔒 si el rol no está autorizado).
 */
export function projectDashboardForRole(
  full: DashboardSummary,
  role: ViewerRole,
): DashboardSummary {
  if (canSeeInternalDashboardFields(role)) {
    return full;
  }
  const projected: DashboardSummary = { ...full };
  for (const field of INTERNAL_DASHBOARD_FIELDS) {
    delete projected[field];
  }
  return projected;
}

/* ----------------------------------------------------------------------------
 * Proyección por rol — APU (FASE 4B.1 — APU_COST_MODEL_FOUNDATION_V1 §10)
 *
 * Campos 🔒 (NUNCA a rol `client`): `laborRoleCode`/`laborRoleName` de cada
 * componente (la información de costos de mano de obra es interna). La omisión
 * es REAL (las claves no existen en el objeto), no un `undefined` cosmético.
 * ------------------------------------------------------------------------- */

/** Campos 🔒 de `ApuComponentView` que sólo ven roles autorizados. */
export const INTERNAL_APU_COMPONENT_FIELDS = [
  'laborRoleCode',
  'laborRoleName',
  // V1B: la justificación del override es interna (NO a rol client).
  'wastePctNote',
] as const satisfies ReadonlyArray<keyof ApuComponentView>;

/**
 * Proyecta un `ApuDetail` COMPLETO según el rol: para `client` OMITE el rol
 * salarial de cada componente antes de serializar.
 *
 * @param full - Detalle completo calculado server-side.
 * @param role - Rol del viewer.
 * @returns Detalle proyectado (sin campos 🔒 para `client`).
 */
export function projectApuDetailForRole(full: ApuDetail, role: ViewerRole): ApuDetail {
  if (role !== 'client') return full;
  const components: ApuComponentView[] = full.components.map((c) => {
    const copy: ApuComponentView = { ...c };
    for (const field of INTERNAL_APU_COMPONENT_FIELDS) {
      delete copy[field];
    }
    return copy;
  });
  return { ...full, components };
}

/* ----------------------------------------------------------------------------
 * Proyección por rol — PLANIFICACIÓN (Oleada 3B — PLANNING_CONTRACT §4)
 *
 * Campos 🔒 (NUNCA a rol `client`): holguras (totalFloatDays/freeFloatDays),
 * ruta crítica (isCritical / criticalPath), avance financiero
 * (financialProgressPct), notas privadas y `externalReference`/responsables
 * (estos últimos ni siquiera se exponen en los DTOs cliente-safe). La omisión
 * es REAL (las claves no existen en el objeto), no un `undefined` cosmético.
 * ------------------------------------------------------------------------- */

/** Campos 🔒 de `ScheduleTaskView` que sólo ven roles autorizados. */
export const INTERNAL_SCHEDULE_TASK_FIELDS = [
  'totalFloatDays',
  'freeFloatDays',
  'isCritical',
] as const satisfies ReadonlyArray<keyof ScheduleTaskView>;

/**
 * Roles autorizados a ver holguras/ruta crítica/avance financiero en planning.
 * `client` NUNCA; el resto (`management`/`internal`/`site`) sí, según el
 * contrato (§4: "nunca a rol client").
 */
const ROLES_WITH_INTERNAL_PLANNING: ReadonlySet<ViewerRole> = new Set<ViewerRole>([
  'management',
  'internal',
  'site',
]);

/**
 * Indica si un rol puede recibir los campos 🔒 de planificación (holguras, ruta
 * crítica, avance financiero, notas). Sólo `client` queda excluido.
 *
 * @param role - Rol del viewer.
 * @returns `true` salvo para `client`.
 */
export function canSeeInternalPlanningFields(role: ViewerRole): boolean {
  return ROLES_WITH_INTERNAL_PLANNING.has(role);
}

/**
 * Proyecta un `ScheduleSummary` COMPLETO según el rol. Para `client` OMITE las
 * holguras/ruta crítica de cada tarea y el bloque `criticalPath` del resumen.
 *
 * @param full - Resumen completo (con campos 🔒 si están presentes).
 * @param role - Rol del viewer.
 * @returns Resumen proyectado.
 */
export function projectScheduleForRole(
  full: ScheduleSummary,
  role: ViewerRole,
): ScheduleSummary {
  if (canSeeInternalPlanningFields(role)) return full;

  const tasks: ScheduleTaskView[] = full.tasks.map((t) => {
    const copy: ScheduleTaskView = { ...t };
    for (const field of INTERNAL_SCHEDULE_TASK_FIELDS) {
      delete copy[field];
    }
    return copy;
  });

  const projected: ScheduleSummary = { ...full, tasks };
  delete projected.criticalPath;
  return projected;
}

/**
 * Proyecta entradas de avance según el rol. Para `client` OMITE
 * `financialProgressPct` y `notes` (🔒).
 *
 * @param entries - Entradas completas.
 * @param role - Rol del viewer.
 * @returns Entradas proyectadas.
 */
export function projectProgressEntriesForRole(
  entries: ProgressEntryView[],
  role: ViewerRole,
): ProgressEntryView[] {
  if (canSeeInternalPlanningFields(role)) return entries;
  return entries.map((e) => {
    const copy: ProgressEntryView = { ...e };
    delete copy.financialProgressPct;
    delete copy.notes;
    return copy;
  });
}

/**
 * Proyecta asignaciones de recursos según el rol. Para `client` OMITE `notes`
 * (🔒 interno).
 *
 * @param assignments - Asignaciones completas.
 * @param role - Rol del viewer.
 * @returns Asignaciones proyectadas.
 */
export function projectResourceAssignmentsForRole(
  assignments: ResourceAssignmentView[],
  role: ViewerRole,
): ResourceAssignmentView[] {
  if (canSeeInternalPlanningFields(role)) return assignments;
  return assignments.map((a) => {
    const copy: ResourceAssignmentView = { ...a };
    delete copy.notes;
    return copy;
  });
}
