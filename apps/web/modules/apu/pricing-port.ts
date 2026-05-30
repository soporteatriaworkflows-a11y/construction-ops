/**
 * pricing-port.ts — Re-exporta el contrato de lectura de precios desde la
 * FUENTE ÚNICA DE CÓDIGO `@/lib/contracts/pricing-read`.
 *
 * Propiedad: agent-cost-domain (CONSUMidor del puerto). La integración de
 * Oleada 2A unificó el contrato: cost-domain YA NO define tipos propios del
 * puerto; importa los canónicos. La implementación es de agent-pricing.
 *
 * El motor de costos programa CONTRA `PricingReadPort` y nunca consulta tablas
 * de pricing ni recalcula descuentos/ahorros. Sólo usa `budgetReferencePrice`
 * del `ApprovedPriceContext` como `unitPriceSnapshot` (cliente-safe a nivel BOQ).
 */

export {
  type ApprovedPriceContext,
  type PricingReadQuery,
  type PricingCandidateRef,
  type PricingReadError,
  type PricingReadResult,
  type PricingReadPort,
  type ClientSafePrice,
  type InternalPriceField,
  INTERNAL_PRICE_FIELDS,
  ApprovedPriceNotFoundError,
  AmbiguousApprovedPriceError,
  throwOnPricingError,
  toClientSafePrice,
} from '@/lib/contracts/pricing-read';
