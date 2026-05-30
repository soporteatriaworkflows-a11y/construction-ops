/**
 * Tipos del dominio de precios — agent-pricing (Oleada 2A).
 *
 * El contrato de LECTURA (`ApprovedPriceContext`, `PricingReadPort`,
 * `PricingReadQuery`, `PricingReadResult`, `ClientSafePrice`, errores de
 * dominio, `INTERNAL_PRICE_FIELDS`) vive en la FUENTE ÚNICA DE CÓDIGO
 * `@/lib/contracts/pricing-read` (refleja `docs/PRICING_READ_CONTRACT.md`).
 * La integración de Oleada 2A eliminó la definición duplicada que vivía aquí;
 * este módulo la re-exporta para sus consumidores internos.
 *
 * Aquí permanece SÓLO lo específico de la ESCRITURA interna de pricing
 * (`PricingApprovalPort` + entradas), que cost-domain no consume.
 *
 * Reglas del contrato:
 * - Todo valor monetario y todo porcentaje viajan como `DecimalString`
 *   (string decimal), NUNCA `number`. Porcentajes en fracción (3 % → "0.03").
 * - Campos 🔒 INTERNOS nunca se serializan a rol cliente (privacidad
 *   backend-first). `ClientSafePrice` es la única forma que viaja a cliente.
 * - Cambios al contrato pasan por `docs/INTEGRATION_REQUESTS.md`.
 */
import type { DecimalString, IsoDateTime, PriceSourceType, Uuid } from "@/lib/utils/types";

// Alias base (compatibilidad con imports `from "./types"` existentes).
export type {
  DecimalString,
  IsoDateTime,
  PriceSourceType,
  PricingRuleType,
  PricingRuleScopeType,
  SyncStatus,
  Uuid,
} from "@/lib/utils/types";

// Contrato de lectura — FUENTE ÚNICA DE CÓDIGO.
export {
  type ApprovedPriceContext,
  type InternalPriceField,
  type PricingReadQuery,
  type PricingCandidateRef,
  type PricingReadError,
  type PricingReadResult,
  type PricingReadPort,
  type ClientSafePrice,
  INTERNAL_PRICE_FIELDS,
  ApprovedPriceNotFoundError,
  AmbiguousApprovedPriceError,
} from "@/lib/contracts/pricing-read";

import type { ApprovedPriceContext } from "@/lib/contracts/pricing-read";

/* ----------------------------------------------------------------------------
 * PricingApprovalPort (escritura interna — propiedad de agent-pricing)
 * PRICING_READ_CONTRACT §4. cost-domain NO consume esto.
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
