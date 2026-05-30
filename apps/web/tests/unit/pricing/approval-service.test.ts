import { describe, expect, it } from "vitest";

import { assessVariation } from "@/modules/pricing/approval-flow";
import { PricingApprovalService } from "@/modules/pricing/approval-service";
import { InMemoryPricingRepository } from "@/modules/pricing/in-memory-repository";

import {
  makeSupplier,
  makeSupplierProduct,
  ORG_A,
  PROFILE_APPROVER,
} from "./fixtures";

const FIXED_NOW = "2026-03-01T00:00:00.000Z";

function setup() {
  const supplier = makeSupplier();
  const product = makeSupplierProduct({ supplierId: supplier.id });
  const repo = new InMemoryPricingRepository(
    { suppliers: [supplier], supplierProducts: [product] },
    () => FIXED_NOW,
  );
  const service = new PricingApprovalService(repo, {
    organizationId: ORG_A,
    defaultPreventiveVariationPct: "0.03",
  });
  return { repo, service, product };
}

describe("PricingApprovalService", () => {
  it("recordObservation: append-only, queda pendiente (approved=false)", async () => {
    const { repo, service, product } = setup();
    const { observationId } = await service.recordObservation({
      supplierProductId: product.id,
      observedPrice: "28000",
      sourceType: "public_web",
      observedAt: "2026-02-01T00:00:00.000Z",
      sourceReference: "https://example.test/p",
    });
    const obs = await repo.getObservation(observationId);
    expect(obs?.approved).toBe(false);
    expect(obs?.sourceType).toBe("public_web");
    expect(obs?.observedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("recordObservation: fuente y timestamp obligatorios", async () => {
    const { service, product } = setup();
    await expect(
      service.recordObservation({
        supplierProductId: product.id,
        observedPrice: "1",
        // @ts-expect-error fuente vacía no permitida
        sourceType: "",
        observedAt: "2026-02-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(/sourceType/);
  });

  it("approveObservation: aprobación humana trazable (aprobador + timestamp)", async () => {
    const { repo, service, product } = setup();
    const { observationId } = await service.recordObservation({
      supplierProductId: product.id,
      observedPrice: "28000",
      sourceType: "public_web",
      observedAt: "2026-02-01T00:00:00.000Z",
    });
    const ctx = await service.approveObservation({
      observationId,
      approvedBy: PROFILE_APPROVER,
      approvedAt: "2026-02-02T00:00:00.000Z",
    });
    expect(ctx.approvedAt).toBe("2026-02-02T00:00:00.000Z");
    expect(ctx.budgetReferencePrice).toBe("28840.0000000000");

    const obs = await repo.getObservation(observationId);
    expect(obs?.approved).toBe(true);
    expect(obs?.approvedBy).toBe(PROFILE_APPROVER);
    // El precio NO cambió al aprobar (append-only / inmutable).
    expect(obs?.observedPrice).toBe("28000");
  });

  it("applyManualOverride: trazable (quién, cuándo, razón) y nueva observación", async () => {
    const { repo, service, product } = setup();
    const ctx = await service.applyManualOverride({
      supplierProductId: product.id,
      observedPrice: "25000",
      observedAt: "2026-02-05T00:00:00.000Z",
      approvedBy: PROFILE_APPROVER,
      approvedAt: "2026-02-05T01:00:00.000Z",
      reason: "Precio pactado por teléfono con el proveedor",
    });
    expect(ctx.manualOverride).toBe(true);
    expect(ctx.onlinePublicPrice).toBe("25000");

    // Traza en la bitácora del servicio.
    expect(service.overrideAudit).toHaveLength(1);
    expect(service.overrideAudit[0]?.approvedBy).toBe(PROFILE_APPROVER);
    expect(service.overrideAudit[0]?.reason).toContain("teléfono");

    // Se generó una observación manual aprobada con la razón en notes.
    const obs = await repo.listObservations(product.id);
    expect(obs).toHaveLength(1);
    expect(obs[0]?.sourceType).toBe("manual");
    expect(obs[0]?.approved).toBe(true);
    expect(obs[0]?.notes).toContain("manual_override");

    // El producto quedó marcado como manualOverride.
    const updated = await repo.getSupplierProduct(product.id);
    expect(updated?.manualOverride).toBe(true);
  });

  it("applyManualOverride: 'reason' es obligatorio", async () => {
    const { service, product } = setup();
    await expect(
      service.applyManualOverride({
        supplierProductId: product.id,
        observedPrice: "25000",
        observedAt: "2026-02-05T00:00:00.000Z",
        approvedBy: PROFILE_APPROVER,
        approvedAt: "2026-02-05T01:00:00.000Z",
        reason: "   ",
      }),
    ).rejects.toThrow(/reason/);
  });

  it("histórico: observaciones se ACUMULAN (no se reemplazan)", async () => {
    const { repo, service, product } = setup();
    await service.recordObservation({
      supplierProductId: product.id,
      observedPrice: "10000",
      sourceType: "public_web",
      observedAt: "2026-01-01T00:00:00.000Z",
    });
    await service.recordObservation({
      supplierProductId: product.id,
      observedPrice: "11000",
      sourceType: "public_web",
      observedAt: "2026-01-15T00:00:00.000Z",
    });
    await service.recordObservation({
      supplierProductId: product.id,
      observedPrice: "12000",
      sourceType: "public_web",
      observedAt: "2026-02-01T00:00:00.000Z",
    });
    const history = await repo.listObservations(product.id);
    expect(history).toHaveLength(3);
    // Orden más reciente primero.
    expect(history[0]?.observedPrice).toBe("12000");
    expect(history[2]?.observedPrice).toBe("10000");
  });
});

describe("assessVariation (flujo de aprobación por umbral)", () => {
  it("variación > umbral ⇒ requiere aprobación (no se auto-aprueba)", () => {
    // 28000 → 35000 = 25 % > 10 %.
    const a = assessVariation("35000", "28000", "0.10");
    expect(a.requiresApproval).toBe(true);
    expect(a.variationPct).toBe("0.2500000000");
  });

  it("variación ≤ umbral ⇒ no requiere aprobación por umbral", () => {
    // 28000 → 29000 ≈ 3.57 % ≤ 10 %.
    const a = assessVariation("29000", "28000", "0.10");
    expect(a.requiresApproval).toBe(false);
  });

  it("primera observación (sin base previa) ⇒ requiere aprobación", () => {
    const a = assessVariation("28000", null, "0.10");
    expect(a.requiresApproval).toBe(true);
    expect(a.variationPct).toBeNull();
  });

  it("precio previo 0 con nuevo precio ⇒ requiere aprobación (sin div/0)", () => {
    const a = assessVariation("5000", "0", "0.10");
    expect(a.requiresApproval).toBe(true);
    expect(a.variationPct).toBeNull();
  });

  it("variación a la baja también se mide en valor absoluto", () => {
    // 28000 → 20000 ≈ 28.57 % > 10 %.
    const a = assessVariation("20000", "28000", "0.10");
    expect(a.requiresApproval).toBe(true);
  });
});
