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

import type { DashboardSummary, ViewerRole } from '@/lib/contracts/read-model';

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
