import { describe, expect, it } from "vitest";

import { PricingApprovalService } from "@/modules/pricing/approval-service";
import { InMemoryPricingRepository } from "@/modules/pricing/in-memory-repository";
import { PricingReadService } from "@/modules/pricing/read-service";
import type { ApprovedPriceContext } from "@/modules/pricing/types";

import {
  makeSupplier,
  makeSupplierProduct,
  ORG_A,
  PROFILE_APPROVER,
  RESOURCE_1,
} from "./fixtures";

const FIXED_NOW = "2026-03-01T00:00:00.000Z";

/**
 * No mutación de snapshots emitidos: el `ApprovedPriceContext` que cost-domain
 * congela como `unit_price_snapshot` NO debe alterarse cuando, más adelante,
 * llega y se aprueba una nueva observación con otro precio. El catálogo se
 * actualiza; el snapshot previo permanece.
 */
describe("no mutación de snapshots emitidos", () => {
  it("un nuevo precio aprobado no altera un contexto ya emitido", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplier],
        supplierProducts: [product],
        observations: [
          // Precio aprobado inicial (base del snapshot).
          {
            id: "obs-initial",
            supplierProductId: product.id,
            observedPrice: "28000",
            stockStatus: null,
            sourceType: "public_web",
            sourceReference: null,
            observedAt: "2026-02-01T00:00:00.000Z",
            approved: true,
            approvedBy: PROFILE_APPROVER,
            notes: null,
            createdAt: "2026-02-01T01:00:00.000Z",
          },
        ],
      },
      () => FIXED_NOW,
    );

    const read = new PricingReadService(repo, {
      organizationId: ORG_A,
      defaultPreventiveVariationPct: "0.03",
    });

    // 1) Se emite/congela el snapshot a partir del precio aprobado vigente.
    const emitted = await read.getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: "2026-02-10T00:00:00.000Z",
    });
    expect(emitted.ok).toBe(true);
    const snapshot: ApprovedPriceContext | null = emitted.ok
      ? structuredClone(emitted.value)
      : null;
    expect(snapshot?.budgetReferencePrice).toBe("28840.0000000000");

    // 2) Llega y se aprueba una NUEVA observación con otro precio.
    const approval = new PricingApprovalService(repo, {
      organizationId: ORG_A,
      defaultPreventiveVariationPct: "0.03",
    });
    const { observationId } = await approval.recordObservation({
      supplierProductId: product.id,
      observedPrice: "40000",
      sourceType: "public_web",
      observedAt: "2026-03-01T00:00:00.000Z",
    });
    await approval.approveObservation({
      observationId,
      approvedBy: PROFILE_APPROVER,
      approvedAt: "2026-03-01T02:00:00.000Z",
    });

    // 3) El snapshot emitido NO cambió.
    expect(snapshot?.onlinePublicPrice).toBe("28000");
    expect(snapshot?.budgetReferencePrice).toBe("28840.0000000000");

    // 4) Una nueva lectura a la fecha posterior SÍ refleja el precio nuevo
    //    (catálogo actualizado), sin haber mutado el snapshot anterior.
    const fresh = await read.getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: "2026-03-02T00:00:00.000Z",
    });
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      expect(fresh.value.onlinePublicPrice).toBe("40000");
      expect(fresh.value.budgetReferencePrice).toBe("41200.0000000000");
    }
    // El histórico conserva ambas observaciones (append-only).
    const history = await repo.listObservations(product.id);
    expect(history).toHaveLength(2);
  });
});
