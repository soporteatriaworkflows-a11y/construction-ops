/**
 * Proyector de privacidad backend-first — agent-pricing (Oleada 2A).
 *
 * Implementa PRICING_READ_CONTRACT §5. Los campos 🔒 INTERNOS NUNCA se
 * serializan a rol cliente: aquí el backend los OMITE (no basta ocultarlos en
 * UI). La proyección `ClientSafePrice` es la única forma de precio que viaja a
 * cliente; expone exclusivamente `resourceId`, `unitPrice`
 * (= `budgetReferencePrice`) y `currency`.
 *
 * No se loguean descuentos/ahorros/precios internos.
 */
import type {
  ApprovedPriceContext,
  ClientSafePrice,
  InternalPriceField,
} from "./types";
import { INTERNAL_PRICE_FIELDS } from "./types";

/**
 * Proyecta un `ApprovedPriceContext` a `ClientSafePrice` (sin campos 🔒).
 * `unitPrice` = `budgetReferencePrice` (precio presupuestado, cliente-safe a
 * nivel de ítem BOQ / total).
 */
export function toClientSafePrice(
  context: ApprovedPriceContext,
): ClientSafePrice {
  return {
    resourceId: context.resourceId,
    unitPrice: context.budgetReferencePrice,
    currency: context.currency,
  };
}

/**
 * Verificación de seguridad: confirma que un objeto serializable hacia cliente
 * NO contiene ninguna clave 🔒 INTERNA. Útil en endpoints/exports y tests de
 * visibilidad. Devuelve las claves filtradas encontradas (vacío = seguro).
 */
export function findInternalLeaks(
  payload: Record<string, unknown>,
): InternalPriceField[] {
  return INTERNAL_PRICE_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field),
  );
}

/** `true` si el payload es seguro para serializar a rol cliente. */
export function isClientSafe(payload: Record<string, unknown>): boolean {
  return findInternalLeaks(payload).length === 0;
}
