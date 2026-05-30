/**
 * pricing-read.ts — FUENTE ÚNICA DE CÓDIGO del contrato de lectura de precios.
 *
 * Refleja EXACTAMENTE el contrato congelado `docs/PRICING_READ_CONTRACT.md` (v1).
 * Esta es la única definición de los tipos/puertos compartidos entre dominios:
 *   - `agent-cost-domain` IMPORTA desde aquí (consume `PricingReadPort`).
 *   - `agent-pricing` IMPLEMENTA el puerto definido aquí.
 * No debe haber definiciones duplicadas del contrato en otros módulos.
 *
 * Cambios al contrato pasan por `docs/INTEGRATION_REQUESTS.md` (orchestrator) y
 * se reflejan en `docs/PRICING_READ_CONTRACT.md` + `docs/API_CONTRACTS.md`.
 *
 * REGLAS:
 *  - Todo valor monetario y todo porcentaje viajan como `DecimalString` (string
 *    decimal), NUNCA `number`. Se operan con Decimal.js. Porcentajes en fracción
 *    (3 % → "0.03"). Sin redondeo intermedio (Q9).
 *  - Campos 🔒 INTERNOS (ver `INTERNAL_PRICE_FIELDS`) nunca se serializan a rol
 *    cliente: el backend los OMITE (privacidad backend-first). La proyección
 *    `ClientSafePrice` es la única forma de precio que viaja a cliente.
 */

import type {
  DecimalString,
  IsoDateTime,
  PriceSourceType,
  Uuid,
} from '@/lib/utils/types';

export type { DecimalString, IsoDateTime, PriceSourceType, Uuid } from '@/lib/utils/types';

/* ----------------------------------------------------------------------------
 * 1. ApprovedPriceContext (PRICING_READ_CONTRACT §2)
 * ------------------------------------------------------------------------- */

/**
 * Snapshot aprobado e inmutable del precio de un recurso en un momento dado.
 * DTO que cost-domain recibe para fijar `unit_price_snapshot` (usa
 * `budgetReferencePrice`). Todos los derivados ya vienen calculados por pricing
 * (fórmulas Q8); cost-domain NO los recalcula.
 */
export interface ApprovedPriceContext {
  // --- Identidad ---
  resourceId: Uuid;
  /** 🔒 cuando no aplique exponer el proveedor */
  supplierProductId: Uuid;
  /** ISO-4217, p. ej. 'COP' */
  currency: string;
  observedAt: IsoDateTime;
  approvedAt: IsoDateTime;
  sourceType: PriceSourceType;

  // --- Capa de precio interna (🔒 — nunca a rol cliente) ---
  /** 🔒 base del cálculo (Q8) */
  onlinePublicPrice: DecimalString;
  /** 🔒 variación preventiva (decimal) */
  preventiveVariationPct: DecimalString;
  /** 🔒 precio presupuestado (derivado). Único valor que cruza al BOQ como snapshot. */
  budgetReferencePrice: DecimalString;
  /** 🔒 descuento interno (decimal) */
  negotiatedDiscountPct: DecimalString;
  /** 🔒 precio esperado de compra (derivado) */
  expectedPurchasePrice: DecimalString;
  /** 🔒 precio real (factura/compra), opcional */
  actualPurchasePrice?: DecimalString;
  /** 🔒 ahorro proyectado (derivado) */
  projectedSaving: DecimalString;
  /** 🔒 ahorro realizado (derivado), opcional */
  realizedSaving?: DecimalString;

  // --- Trazabilidad ---
  /** 🔒 URL/SKU/factura interna de origen */
  sourceReference?: string;
  /** true si el contexto proviene de un override manual aprobado */
  manualOverride: boolean;
}

/**
 * Claves 🔒 INTERNAS de `ApprovedPriceContext`. Fuente única para el proyector
 * de privacidad (§5.1): cualquier campo aquí listado se OMITE antes de
 * serializar a rol cliente.
 */
export const INTERNAL_PRICE_FIELDS = [
  'onlinePublicPrice',
  'preventiveVariationPct',
  'budgetReferencePrice',
  'negotiatedDiscountPct',
  'expectedPurchasePrice',
  'actualPurchasePrice',
  'projectedSaving',
  'realizedSaving',
  'sourceReference',
  'supplierProductId',
] as const satisfies ReadonlyArray<keyof ApprovedPriceContext>;

export type InternalPriceField = (typeof INTERNAL_PRICE_FIELDS)[number];

/* ----------------------------------------------------------------------------
 * 2. PricingReadPort (PRICING_READ_CONTRACT §3)
 * ------------------------------------------------------------------------- */

export interface PricingReadQuery {
  /** obligatorio */
  resourceId: Uuid;
  /** fecha de corte (default: ahora) → snapshot vigente a esa fecha */
  asOf?: IsoDateTime;
  /**
   * Versión de presupuesto contra la que se congela el precio (opcional).
   * Añadido en la integración de Oleada 2A para soportar el congelamiento por
   * versión que requiere cost-domain; pricing puede ignorarlo si resuelve por
   * `asOf`. Cambio documentado en `docs/INTEGRATION_REQUESTS.md`.
   */
  estimateVersionId?: Uuid;
  /** contexto de proyecto cuando aplique precedencia */
  projectId?: Uuid;
  /** contexto de alcance cuando aplique */
  projectScopeId?: Uuid;
  /** desambiguar por proveedor */
  supplierId?: Uuid;
  /** desambiguar por producto de proveedor */
  supplierProductId?: Uuid;
}

export interface PricingCandidateRef {
  /** 🔒 si no aplica exponer */
  supplierProductId: Uuid;
  observedAt: IsoDateTime;
  sourceType: PriceSourceType;
}

export type PricingReadError =
  | { kind: 'no_approved_price'; resourceId: Uuid; asOf?: IsoDateTime }
  | { kind: 'ambiguous_price'; resourceId: Uuid; candidates: PricingCandidateRef[] };

export type PricingReadResult =
  | { ok: true; value: ApprovedPriceContext }
  | { ok: false; error: PricingReadError };

/**
 * Puerto de SÓLO LECTURA hacia el dominio de precios. cost-domain inyecta una
 * implementación; en tests, un fake. Determinista y sin efectos secundarios.
 *
 * Devuelve un `PricingReadResult`:
 *  - `{ ok: true, value }` con el `ApprovedPriceContext` aprobado;
 *  - `{ ok: false, error }` con `no_approved_price` o `ambiguous_price`.
 *
 * Consumidores que prefieran estilo excepción pueden usar
 * {@link throwOnPricingError} para convertir un resultado `!ok` en la clase de
 * error de dominio correspondiente.
 */
export interface PricingReadPort {
  getApprovedPrice(query: PricingReadQuery): Promise<PricingReadResult>;
}

/* ----------------------------------------------------------------------------
 * 3. Errores de dominio explícitos (PRICING_READ_CONTRACT §3)
 * ------------------------------------------------------------------------- */

/** No existe precio aprobado para el recurso (a la fecha de corte). */
export class ApprovedPriceNotFoundError extends Error {
  readonly code = 'no_approved_price' as const;
  readonly resourceId: Uuid;
  readonly asOf?: IsoDateTime;

  constructor(resourceId: Uuid, asOf?: IsoDateTime, message?: string) {
    super(message ?? `no_approved_price for resource ${resourceId}`);
    this.name = 'ApprovedPriceNotFoundError';
    this.resourceId = resourceId;
    if (asOf !== undefined) this.asOf = asOf;
  }
}

/** Hay más de un precio aprobado vigente y la consulta no desambigua. */
export class AmbiguousApprovedPriceError extends Error {
  readonly code = 'ambiguous_price' as const;
  readonly resourceId: Uuid;
  readonly candidates: PricingCandidateRef[];

  constructor(resourceId: Uuid, candidates: PricingCandidateRef[], message?: string) {
    super(message ?? `ambiguous_price for resource ${resourceId}`);
    this.name = 'AmbiguousApprovedPriceError';
    this.resourceId = resourceId;
    this.candidates = candidates;
  }
}

/**
 * Lanza la clase de error de dominio correspondiente a partir de un
 * `PricingReadError`. Útil para consumidores con estilo de excepción.
 *
 * @param error - Error de dominio (discriminado por `kind`).
 * @throws ApprovedPriceNotFoundError | AmbiguousApprovedPriceError
 */
export function throwOnPricingError(error: PricingReadError): never {
  switch (error.kind) {
    case 'no_approved_price':
      throw new ApprovedPriceNotFoundError(error.resourceId, error.asOf);
    case 'ambiguous_price':
      throw new AmbiguousApprovedPriceError(error.resourceId, error.candidates);
    default: {
      const exhaustive: never = error;
      throw new Error(`PricingReadError no soportado: ${String(exhaustive)}`);
    }
  }
}

/* ----------------------------------------------------------------------------
 * 4. Proyección cliente-safe (PRICING_READ_CONTRACT §5.2)
 * ------------------------------------------------------------------------- */

/**
 * Proyección SIN campos 🔒. Única forma de precio que viaja a rol cliente.
 * `unitPrice` = `budgetReferencePrice` (precio presupuestado).
 */
export interface ClientSafePrice {
  resourceId: Uuid;
  /** = budgetReferencePrice (precio presupuestado) */
  unitPrice: DecimalString;
  currency: string;
}

/**
 * Proyecta un `ApprovedPriceContext` a su vista cliente-safe (omite los 🔒).
 *
 * @param ctx - Contexto de precio aprobado.
 * @returns Vista cliente-safe (`resourceId`, `unitPrice`, `currency`).
 */
export function toClientSafePrice(ctx: ApprovedPriceContext): ClientSafePrice {
  return {
    resourceId: ctx.resourceId,
    unitPrice: ctx.budgetReferencePrice,
    currency: ctx.currency,
  };
}
