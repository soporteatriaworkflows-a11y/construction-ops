/**
 * Tipos del dominio de precios — agent-pricing (Oleada 2A).
 *
 * Implementan EXACTAMENTE el contrato congelado v1 de
 * `docs/PRICING_READ_CONTRACT.md` (`ApprovedPriceContext`, `PricingReadPort`,
 * `PricingApprovalPort`, proyección `ClientSafePrice`) y reusan los alias base
 * de `docs/API_CONTRACTS.md` (`@/lib/utils/types`).
 *
 * Reglas del contrato:
 * - Todo valor monetario y todo porcentaje viajan como `DecimalString`
 *   (string decimal), NUNCA `number`. Se operan con Decimal.js. Los porcentajes
 *   son fracciones (3 % → "0.03").
 * - Campos 🔒 INTERNOS nunca se serializan a rol cliente: el backend los OMITE
 *   antes de serializar (privacidad backend-first). La proyección
 *   `ClientSafePrice` es la única forma que viaja a cliente.
 * - Cambios al contrato congelado pasan por `docs/INTEGRATION_REQUESTS.md`.
 */
import type {
  DecimalString,
  IsoDateTime,
  PriceSourceType,
  Uuid,
} from "@/lib/utils/types";

export type {
  DecimalString,
  IsoDateTime,
  PriceSourceType,
  PricingRuleType,
  PricingRuleScopeType,
  SyncStatus,
  Uuid,
} from "@/lib/utils/types";

/* ----------------------------------------------------------------------------
 * 2. ApprovedPriceContext (PRICING_READ_CONTRACT §2)
 * ------------------------------------------------------------------------- */

/**
 * Snapshot aprobado e inmutable del precio de un recurso en un momento dado.
 * DTO que cost-domain recibe para fijar `unit_price_snapshot`. Todos los
 * derivados ya vienen calculados por pricing (fórmulas Q8).
 */
export interface ApprovedPriceContext {
  // --- Identidad / cliente-safe ---
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
  /** 🔒 precio presupuestado (derivado) */
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

  // --- Trazabilidad (🔒) ---
  /** 🔒 URL/SKU/factura interna de origen */
  sourceReference?: string;
  /** true si el contexto proviene de un override manual aprobado */
  manualOverride: boolean;
}

/**
 * Conjunto de claves 🔒 INTERNAS de `ApprovedPriceContext`. Fuente única de
 * verdad para el proyector de privacidad (§5.1 del contrato). Cualquier campo
 * aquí listado se OMITE antes de serializar a rol cliente.
 */
export const INTERNAL_PRICE_FIELDS = [
  "onlinePublicPrice",
  "preventiveVariationPct",
  "budgetReferencePrice",
  "negotiatedDiscountPct",
  "expectedPurchasePrice",
  "actualPurchasePrice",
  "projectedSaving",
  "realizedSaving",
  "sourceReference",
  "supplierProductId",
] as const satisfies ReadonlyArray<keyof ApprovedPriceContext>;

export type InternalPriceField = (typeof INTERNAL_PRICE_FIELDS)[number];

/* ----------------------------------------------------------------------------
 * 3. PricingReadPort (PRICING_READ_CONTRACT §3)
 * ------------------------------------------------------------------------- */

export interface PricingReadQuery {
  /** obligatorio */
  resourceId: Uuid;
  /** fecha de corte (default: ahora) → snapshot vigente a esa fecha */
  asOf?: IsoDateTime;
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
  | { kind: "no_approved_price"; resourceId: Uuid; asOf?: IsoDateTime }
  | {
      kind: "ambiguous_price";
      resourceId: Uuid;
      candidates: PricingCandidateRef[];
    };

export type PricingReadResult =
  | { ok: true; value: ApprovedPriceContext }
  | { ok: false; error: PricingReadError };

export interface PricingReadPort {
  getApprovedPrice(query: PricingReadQuery): Promise<PricingReadResult>;
}

/* ----------------------------------------------------------------------------
 * 4. PricingApprovalPort (PRICING_READ_CONTRACT §4)
 * ------------------------------------------------------------------------- */

/**
 * Entrada para registrar una observación de precio (append-only).
 * `observedPrice` es el precio público observado (`onlinePublicPrice`).
 */
export interface RecordObservationInput {
  supplierProductId: Uuid;
  /** precio público observado (DecimalString) */
  observedPrice: DecimalString;
  sourceType: PriceSourceType;
  observedAt: IsoDateTime;
  stockStatus?: string | null;
  sourceReference?: string | null;
  notes?: string | null;
}

/** Entrada para la aprobación humana de una observación. */
export interface ApproveObservationInput {
  observationId: Uuid;
  /** identidad del aprobador interno (profiles.id) */
  approvedBy: Uuid;
  approvedAt: IsoDateTime;
}

/** Entrada para un override manual aprobado y trazable. */
export interface ManualOverrideInput {
  supplierProductId: Uuid;
  /** precio público fijado manualmente (DecimalString) */
  observedPrice: DecimalString;
  observedAt: IsoDateTime;
  /** identidad del aprobador interno (profiles.id) */
  approvedBy: Uuid;
  approvedAt: IsoDateTime;
  /** razón del override (trazabilidad) */
  reason: string;
  sourceReference?: string | null;
}

export interface PricingApprovalPort {
  /** Registrar una observación de precio (append-only; nunca UPDATE/DELETE). */
  recordObservation(
    input: RecordObservationInput,
  ): Promise<{ observationId: Uuid }>;
  /** Aprobación humana de una observación (trazable, con aprobador y timestamp). */
  approveObservation(
    input: ApproveObservationInput,
  ): Promise<ApprovedPriceContext>;
  /** Override manual aprobado y trazable (genera nueva observación + aprobación). */
  applyManualOverride(input: ManualOverrideInput): Promise<ApprovedPriceContext>;
}

/* ----------------------------------------------------------------------------
 * 5. Proyección cliente-safe (PRICING_READ_CONTRACT §5.2)
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
