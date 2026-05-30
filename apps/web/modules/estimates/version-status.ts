/**
 * version-status.ts — Reglas de inmutabilidad de versiones de presupuesto.
 *
 * Propiedad: agent-cost-domain.
 *
 * Invariante de dominio (docs/PROJECT_MASTER.md §4.3, docs/API_CONTRACTS.md):
 * una `EstimateVersion` con `status ∈ {approved, issued, archived}` y sus hijos
 * son INMUTABLES: no se recalculan ni se mutan. Para cambiar precios/cantidades
 * se CLONA a una nueva versión `draft`.
 *
 * Estas funciones son guardas PURAS del dominio; complementan (no reemplazan)
 * la protección RLS de db-rls a nivel de base de datos.
 */

import type { EstimateVersionStatus } from '@/lib/utils/types';

/** Estados en los que la versión queda CONGELADA (no recalculable, no mutable). */
export const LOCKED_VERSION_STATUSES: readonly EstimateVersionStatus[] = [
  'approved',
  'issued',
  'archived',
] as const;

/** Estados editables (recalculables). */
export const EDITABLE_VERSION_STATUSES: readonly EstimateVersionStatus[] = [
  'draft',
  'review',
] as const;

/**
 * Indica si una versión está congelada (inmutable) por su estado.
 *
 * @param status - Estado de la versión.
 * @returns `true` si el estado es `approved`, `issued` o `archived`.
 */
export function isVersionLocked(status: EstimateVersionStatus): boolean {
  return LOCKED_VERSION_STATUSES.includes(status);
}

/**
 * Indica si una versión es editable/recalculable por su estado.
 *
 * @param status - Estado de la versión.
 * @returns `true` si el estado es `draft` o `review`.
 */
export function isVersionEditable(status: EstimateVersionStatus): boolean {
  return !isVersionLocked(status);
}

/** Error de dominio al intentar mutar/recalcular una versión congelada. */
export class ImmutableVersionError extends Error {
  readonly status: EstimateVersionStatus;
  /**
   * @param status - Estado de la versión que se intentó mutar.
   * @param action - Acción bloqueada (para el mensaje).
   */
  constructor(status: EstimateVersionStatus, action = 'modificar') {
    super(
      `No se puede ${action} una versión en estado '${status}': las versiones ` +
        `approved/issued/archived son inmutables. Clone a una nueva versión draft.`,
    );
    this.name = 'ImmutableVersionError';
    this.status = status;
  }
}

/**
 * Lanza {@link ImmutableVersionError} si la versión está congelada. Úsese antes
 * de cualquier recálculo o mutación del dominio.
 *
 * @param status - Estado de la versión.
 * @param action - Etiqueta de la acción para el mensaje de error.
 * @throws ImmutableVersionError si la versión está congelada.
 */
export function assertVersionEditable(
  status: EstimateVersionStatus,
  action = 'recalcular',
): void {
  if (isVersionLocked(status)) {
    throw new ImmutableVersionError(status, action);
  }
}
