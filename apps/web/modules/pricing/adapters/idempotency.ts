/**
 * Lógica de idempotencia para importaciones de proveedores.
 *
 * Contrato congelado v1 — `docs/PRICING_ADAPTER_CONTRACT.md` §4.
 *
 * Clave conceptual de una observación importada:
 *   providerKey + supplierProductId + observedAt + sourceType + (hash de fila)
 *
 * Reglas:
 * - No se duplican observaciones idénticas (misma clave) → `duplicates`.
 * - Re-ejecutar el mismo import produce el mismo resultado.
 * - La idempotencia se resuelve ANTES de llamar a `recordObservation`.
 * - `price_observations` permanece append-only (sin UPDATE/DELETE).
 */

import type { IsoDateTime, Uuid } from "@/lib/utils/types";
import type { PriceSourceType } from "@/lib/utils/types";

/* ----------------------------------------------------------------------------
 * Clave de idempotencia
 * ------------------------------------------------------------------------- */

export interface IdempotencyKey {
  providerKey: string;
  supplierProductId: Uuid;
  observedAt: IsoDateTime;
  sourceType: PriceSourceType;
  /** Hash opcional del contenido normalizado (para mayor unicidad). */
  contentHash?: string;
}

/** Serializa la clave a un string estable para comparación. */
export function serializeIdempotencyKey(key: IdempotencyKey): string {
  const parts = [
    key.providerKey,
    key.supplierProductId,
    key.observedAt,
    key.sourceType,
  ];
  if (key.contentHash) {
    parts.push(key.contentHash);
  }
  return parts.join("|");
}

/* ----------------------------------------------------------------------------
 * Hash de contenido normalizado (djb2 simple, sin dependencias)
 * ------------------------------------------------------------------------- */

/**
 * Hash djb2 de un string normalizado (lowercase, sin espacios extras).
 * No criptográfico; solo para detectar duplicados dentro de un import.
 */
export function hashRowContent(content: string): string {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h * 33) ^ normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Genera un hash de contenido a partir de los campos relevantes de una fila.
 * Usado para distinguir ítems cuando `observedAt`/`supplierProductId` coinciden
 * pero el precio difiere (p. ej. dos importaciones del mismo archivo con precios distintos).
 */
export function buildContentHash(fields: {
  name: string;
  onlinePublicPrice: string;
  currency: string;
  sku?: string;
}): string {
  const content = [
    fields.name,
    fields.onlinePublicPrice,
    fields.currency,
    fields.sku ?? "",
  ].join("|");
  return hashRowContent(content);
}

/* ----------------------------------------------------------------------------
 * Registry de idempotencia en memoria
 * ------------------------------------------------------------------------- */

/**
 * Registro en memoria de claves de idempotencia ya vistas en el import actual.
 * Permite detectar duplicados sin consultar la DB durante el parse.
 *
 * Para idempotencia cross-session (re-ejecutar el mismo CSV dos veces),
 * el llamador debe consultar las observaciones existentes en la DB antes
 * de llamar a `recordObservation`, y saltear si ya existe la clave.
 */
export class IdempotencyRegistry {
  private readonly seen = new Set<string>();

  /** Registra una clave. Retorna `true` si era nueva; `false` si es duplicado. */
  register(key: IdempotencyKey): boolean {
    const k = serializeIdempotencyKey(key);
    if (this.seen.has(k)) {
      return false;
    }
    this.seen.add(k);
    return true;
  }

  /** Verifica si una clave ya fue registrada. */
  has(key: IdempotencyKey): boolean {
    return this.seen.has(serializeIdempotencyKey(key));
  }

  /** Número de claves únicas registradas. */
  get size(): number {
    return this.seen.size;
  }

  /** Limpia el registro (útil entre imports). */
  clear(): void {
    this.seen.clear();
  }
}
