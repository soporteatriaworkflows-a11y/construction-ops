/**
 * Servicio de escritura interna de precios — implementa `PricingApprovalPort`.
 * Responsabilidad EXCLUSIVA de agent-pricing (cost-domain no lo consume).
 *
 * - `recordObservation`: append-only sobre `price_observations` (con fuente y
 *   timestamp obligatorios; nunca UPDATE/DELETE).
 * - `approveObservation`: aprobación humana trazable (aprobador + timestamp);
 *   solo fija `approved`/`approvedBy`, nunca el precio.
 * - `applyManualOverride`: override manual trazable (nueva observación
 *   `source_type='manual'` aprobada en el acto, con razón y aprobador), y marca
 *   `manualOverride=true` en el producto.
 *
 * Todas las construcciones de `ApprovedPriceContext` derivan capas con
 * `derivePriceLayers` (fuente única Q8). No se loguean precios/descuentos.
 */
import type { IsoDateTime, Uuid } from "@/lib/utils/types";

import { derivePriceLayers } from "./price-layers";
import type {
  PriceObservationRecord,
  PricingRepository,
  SupplierProductRecord,
} from "./repository";
import { resolvePercentage } from "./rule-resolution";
import type {
  ApproveObservationInput,
  ApprovedPriceContext,
  ManualOverrideInput,
  PricingApprovalPort,
  RecordObservationInput,
} from "./types";

/** Traza de auditoría de un override manual (para reporting interno). */
export interface ManualOverrideAudit {
  observationId: Uuid;
  supplierProductId: Uuid;
  approvedBy: Uuid;
  approvedAt: IsoDateTime;
  reason: string;
}

export interface ApprovalServiceConfig {
  organizationId: Uuid;
  defaultPreventiveVariationPct?: string;
}

export class PricingApprovalService implements PricingApprovalPort {
  /** Bitácora de overrides aplicados en esta instancia (trazabilidad). */
  readonly overrideAudit: ManualOverrideAudit[] = [];

  constructor(
    private readonly repo: PricingRepository,
    private readonly config: ApprovalServiceConfig,
  ) {}

  async recordObservation(
    input: RecordObservationInput,
  ): Promise<{ observationId: Uuid }> {
    // Fuente y timestamp son obligatorios por tipo; validamos no-vacío.
    if (!input.sourceType) {
      throw new Error("recordObservation: sourceType es obligatorio.");
    }
    if (!input.observedAt) {
      throw new Error("recordObservation: observedAt es obligatorio.");
    }
    const record = await this.repo.insertObservation({
      supplierProductId: input.supplierProductId,
      observedPrice: input.observedPrice,
      sourceType: input.sourceType,
      observedAt: input.observedAt,
      stockStatus: input.stockStatus ?? null,
      sourceReference: input.sourceReference ?? null,
      notes: input.notes ?? null,
      approved: false,
    });
    return { observationId: record.id };
  }

  async approveObservation(
    input: ApproveObservationInput,
  ): Promise<ApprovedPriceContext> {
    const existing = await this.repo.getObservation(input.observationId);
    if (existing === null) {
      throw new Error(
        `approveObservation: observación ${input.observationId} no existe.`,
      );
    }
    const approved = await this.repo.markObservationApproved(
      input.observationId,
      input.approvedBy,
    );
    if (approved === null) {
      throw new Error(
        `approveObservation: no se pudo aprobar ${input.observationId}.`,
      );
    }
    const product = await this.repo.getSupplierProduct(
      approved.supplierProductId,
    );
    if (product === null) {
      throw new Error(
        `approveObservation: producto ${approved.supplierProductId} no existe.`,
      );
    }
    return this.buildContext(approved, product, input.approvedAt, {
      manualOverride: product.manualOverride,
    });
  }

  async applyManualOverride(
    input: ManualOverrideInput,
  ): Promise<ApprovedPriceContext> {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error("applyManualOverride: 'reason' es obligatorio (traza).");
    }

    // Nueva observación manual, aprobada en el acto y trazable.
    const observation = await this.repo.insertObservation({
      supplierProductId: input.supplierProductId,
      observedPrice: input.observedPrice,
      sourceType: "manual",
      observedAt: input.observedAt,
      sourceReference: input.sourceReference ?? null,
      notes: `manual_override: ${input.reason}`,
      approved: true,
      approvedBy: input.approvedBy,
    });

    // Marca el producto como override manual (trazabilidad de estado).
    const product = await this.repo.updateSupplierProduct(
      input.supplierProductId,
      { manualOverride: true },
    );
    if (product === null) {
      throw new Error(
        `applyManualOverride: producto ${input.supplierProductId} no existe.`,
      );
    }

    this.overrideAudit.push({
      observationId: observation.id,
      supplierProductId: input.supplierProductId,
      approvedBy: input.approvedBy,
      approvedAt: input.approvedAt,
      reason: input.reason,
    });

    return this.buildContext(observation, product, input.approvedAt, {
      manualOverride: true,
    });
  }

  /** Arma el `ApprovedPriceContext` derivando capas con las reglas vigentes. */
  private async buildContext(
    observation: PriceObservationRecord,
    product: SupplierProductRecord,
    approvedAt: IsoDateTime,
    opts: { manualOverride: boolean },
  ): Promise<ApprovedPriceContext> {
    const rules = await this.repo.listPricingRules(this.config.organizationId);
    const ruleCtx = {
      resourceId: product.resourceId,
      supplierProductId: product.id,
      asOf: observation.observedAt,
    };

    const preventiveVariationPct = resolvePercentage(
      rules,
      "preventive_variation",
      ruleCtx,
      this.config.defaultPreventiveVariationPct ?? "0.03",
    );
    const negotiatedDiscountPct = resolvePercentage(
      rules,
      "negotiated_discount",
      ruleCtx,
      "0",
    );

    const layers = derivePriceLayers({
      onlinePublicPrice: observation.observedPrice,
      preventiveVariationPct,
      negotiatedDiscountPct,
    });

    const context: ApprovedPriceContext = {
      resourceId: product.resourceId,
      supplierProductId: product.id,
      currency: product.currency,
      observedAt: observation.observedAt,
      approvedAt,
      sourceType: observation.sourceType,
      onlinePublicPrice: observation.observedPrice,
      preventiveVariationPct,
      budgetReferencePrice: layers.budgetReferencePrice,
      negotiatedDiscountPct,
      expectedPurchasePrice: layers.expectedPurchasePrice,
      projectedSaving: layers.projectedSaving,
      manualOverride: opts.manualOverride,
    };

    if (observation.sourceReference != null) {
      context.sourceReference = observation.sourceReference;
    }

    return context;
  }
}
