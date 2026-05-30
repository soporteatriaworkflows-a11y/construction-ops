/**
 * pricing-port.ts — Frontera de SÓLO LECTURA hacia el dominio de precios.
 *
 * Propiedad: agent-cost-domain (define el puerto que CONSUME; la
 * IMPLEMENTACIÓN/adapter es propiedad de agent-pricing).
 *
 * Refleja `docs/PRICING_READ_CONTRACT.md` (contrato congelado v1). El motor de
 * costos programa CONTRA esta interfaz y nunca consulta tablas de pricing ni
 * recalcula descuentos/ahorros. En tests se inyecta un stub/fake del puerto.
 *
 * REGLAS DE PRIVACIDAD (Q8, docs/API_CONTRACTS.md §"Capa de precio"):
 *   - `budgetReferencePrice` (precio de referencia presupuestado) es el ÚNICO
 *     valor que cruza al dominio de costos como `unitPriceSnapshot`. Es el
 *     precio cliente-safe (✅).
 *   - `online_public_price`, `negotiated_discount_pct`, `expected_purchase_price`,
 *     `projected_saving`, `realized_saving` y el margen son INTERNOS (🔒) y NO
 *     entran al cálculo del APU visible para cliente; este puerto NO los expone.
 */

import type { DecimalString, Uuid, IsoDateTime } from '@/lib/utils/types';

/**
 * Contexto de precio APROBADO para un recurso, resuelto por el dominio de
 * precios. Sólo contiene el precio de referencia presupuestado (cliente-safe);
 * los campos internos de descuento/ahorro NO se incluyen por diseño.
 */
export interface ApprovedPriceContext {
  /** Recurso al que aplica el precio. */
  resourceId: Uuid;
  /**
   * Precio de referencia presupuestado, cliente-safe (✅). Es el valor que el
   * dominio de costos usa como `unitPriceSnapshot` del componente APU.
   *
   * Canónicamente: `online_public_price × (1 + preventive_variation_pct)`.
   * El dominio de costos NO recalcula esto: lo recibe ya resuelto y aprobado.
   */
  budgetReferencePrice: DecimalString;
  /** Moneda ISO-4217 (p. ej. "COP"). */
  currency: string;
  /** Identificador de la observación/aprobación de precio que respalda el snapshot. */
  approvedPriceObservationId?: Uuid | null;
  /** Momento en que el precio fue aprobado (trazabilidad del snapshot). */
  approvedAt?: IsoDateTime | null;
}

/**
 * Vista cliente-safe del precio (✅). Por contrato NO contiene descuentos,
 * ahorros, precio público ni margen interno.
 */
export interface ClientSafePrice {
  resourceId: Uuid;
  /** Precio presupuestado mostrable a cliente. */
  budgetReferencePrice: DecimalString;
  currency: string;
}

/** Códigos de error de dominio al resolver un precio aprobado. */
export type PricingErrorCode = 'no_approved_price' | 'ambiguous_price';

/**
 * Error de dominio al resolver un precio aprobado vía {@link PricingReadPort}.
 * El dominio de costos NO inventa precios: si no hay precio aprobado, falla.
 */
export class PricingResolutionError extends Error {
  /** Código de error de dominio. */
  readonly code: PricingErrorCode;
  /** Recurso para el que falló la resolución. */
  readonly resourceId: Uuid;

  /**
   * @param code - Código de error (`no_approved_price` | `ambiguous_price`).
   * @param resourceId - Recurso afectado.
   * @param message - Mensaje opcional; si se omite se deriva del código.
   */
  constructor(code: PricingErrorCode, resourceId: Uuid, message?: string) {
    super(message ?? `${code} for resource ${resourceId}`);
    this.name = 'PricingResolutionError';
    this.code = code;
    this.resourceId = resourceId;
  }
}

/**
 * Parámetros de consulta de precio aprobado. Inmutables a nivel de versión:
 * el dominio resuelve el precio CONGELADO de la versión de presupuesto.
 */
export interface ApprovedPriceQuery {
  resourceId: Uuid;
  /** Versión de presupuesto contra la que se congela el precio. */
  estimateVersionId: Uuid;
}

/**
 * Puerto de SÓLO LECTURA hacia el dominio de precios. El motor de costos
 * inyecta una implementación de este puerto; en tests, un fake/stub.
 *
 * La implementación DEBE lanzar {@link PricingResolutionError}:
 *   - `no_approved_price` si no existe precio aprobado para el recurso.
 *   - `ambiguous_price` si hay más de un precio aprobado vigente sin desempate.
 */
export interface PricingReadPort {
  /**
   * Resuelve el precio de referencia presupuestado APROBADO de un recurso para
   * una versión de presupuesto.
   *
   * @param query - Recurso + versión de presupuesto.
   * @returns Contexto de precio aprobado (cliente-safe).
   * @throws PricingResolutionError con `no_approved_price` o `ambiguous_price`.
   */
  getApprovedPrice(query: ApprovedPriceQuery): ApprovedPriceContext;
}

/**
 * Puerto OPCIONAL de aprobación de precios (escritura), propiedad funcional de
 * agent-pricing. El dominio de costos NO lo usa para calcular; se declara aquí
 * sólo para mantener la frontera completa del contrato de lectura/aprobación.
 *
 * Se mantiene mínimo y desacoplado: el motor financiero nunca aprueba precios.
 */
export interface PricingApprovalPort {
  /**
   * Indica si existe (al menos) un precio aprobado para el recurso/versión.
   * @param query - Recurso + versión de presupuesto.
   */
  hasApprovedPrice(query: ApprovedPriceQuery): boolean;
}

/**
 * Proyecta un {@link ApprovedPriceContext} a su vista cliente-safe.
 * No expone ningún campo interno (no hay descuentos/ahorros que filtrar aquí).
 *
 * @param ctx - Contexto de precio aprobado.
 * @returns Vista cliente-safe.
 */
export function toClientSafePrice(ctx: ApprovedPriceContext): ClientSafePrice {
  return {
    resourceId: ctx.resourceId,
    budgetReferencePrice: ctx.budgetReferencePrice,
    currency: ctx.currency,
  };
}
