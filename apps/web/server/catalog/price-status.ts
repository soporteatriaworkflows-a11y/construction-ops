/**
 * price-status.ts — Resolución PURA del estado de precio de un recurso para la
 * vista de catálogo (CATALOG_PRICE_VISIBILITY_V1).
 *
 * Propiedad: agent-pricing (autorado por el orquestador).
 * Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §5.
 *
 * Reglas:
 *   - Si hay observación APROBADA ⇒ 'approved' + approvedPrice (= precio de
 *     referencia presupuestal, cliente-safe).
 *   - Si no hay aprobada pero hay PENDIENTE ⇒ 'pending' + pendingPrice.
 *   - Si la más reciente es RECHAZADA (y no hay aprobada/pendiente) ⇒ 'rejected'.
 *   - Sin observaciones utilizables ⇒ 'none' ("Sin precio aprobado").
 *   - NO autoaprueba. NO expone descuento negociado, precio neto ni ahorros.
 *   - El proveedor (`supplierName`) lo decide la capa de salida según rol; aquí
 *     se incluye y la proyección por rol se aplica en el read-model/UI.
 */
import type { DecimalString } from '@/lib/utils/types';

export type CatalogPriceStatus = 'approved' | 'pending' | 'rejected' | 'none';

/** Observación mínima necesaria para resolver el estado de precio. */
export interface PriceObservationRow {
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  observedPrice: DecimalString;
  supplierName: string | null;
  /** ISO. Fecha de aprobación si aplica; si no, fecha de observación. */
  effectiveAt: string;
}

export interface CatalogPriceStatusResult {
  priceStatus: CatalogPriceStatus;
  approvedPrice?: DecimalString;
  pendingPrice?: DecimalString;
  supplierName?: string;
  priceDate?: string;
}

function byEffectiveDesc(a: PriceObservationRow, b: PriceObservationRow): number {
  return b.effectiveAt.localeCompare(a.effectiveAt);
}

/**
 * Resuelve el estado de precio cliente-safe a partir de las observaciones de un
 * recurso. Función pura — fuente de verdad de la visibilidad de precios.
 */
export function resolveCatalogPriceStatus(
  observations: readonly PriceObservationRow[],
): CatalogPriceStatusResult {
  const approved = observations
    .filter((o) => o.status === 'approved')
    .sort(byEffectiveDesc);
  if (approved.length > 0) {
    const top = approved[0]!;
    return {
      priceStatus: 'approved',
      approvedPrice: top.observedPrice,
      supplierName: top.supplierName ?? undefined,
      priceDate: top.effectiveAt,
    };
  }

  const pending = observations
    .filter((o) => o.status === 'pending')
    .sort(byEffectiveDesc);
  if (pending.length > 0) {
    const top = pending[0]!;
    return {
      priceStatus: 'pending',
      pendingPrice: top.observedPrice,
      supplierName: top.supplierName ?? undefined,
      priceDate: top.effectiveAt,
    };
  }

  const rejected = observations
    .filter((o) => o.status === 'rejected')
    .sort(byEffectiveDesc);
  if (rejected.length > 0) {
    return { priceStatus: 'rejected' };
  }

  return { priceStatus: 'none' };
}

/** Roles internos que pueden ver el proveedor en el catálogo. */
const SUPPLIER_VISIBLE_ROLES = ['management', 'internal'] as const;

/** Aplica la proyección por rol: oculta el proveedor para client/site. */
export function projectPriceStatusForRole(
  result: CatalogPriceStatusResult,
  role: string,
): CatalogPriceStatusResult {
  if ((SUPPLIER_VISIBLE_ROLES as readonly string[]).includes(role)) return result;
  const { supplierName: _omit, ...rest } = result;
  return rest;
}
