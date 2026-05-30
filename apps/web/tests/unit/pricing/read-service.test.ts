import { describe, expect, it } from "vitest";

import { InMemoryPricingRepository } from "@/modules/pricing/in-memory-repository";
import { PricingReadService } from "@/modules/pricing/read-service";

import {
  makeObservation,
  makeRule,
  makeSupplier,
  makeSupplierProduct,
  ORG_A,
  PROFILE_APPROVER,
  RESOURCE_1,
} from "./fixtures";

const FIXED_NOW = "2026-03-01T00:00:00.000Z";

function service(repo: InMemoryPricingRepository) {
  return new PricingReadService(repo, {
    organizationId: ORG_A,
    defaultPreventiveVariationPct: "0.03",
  });
}

describe("PricingReadService.getApprovedPrice", () => {
  it("error no_approved_price cuando no hay observación aprobada", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplier],
        supplierProducts: [product],
        // observación PENDIENTE (approved=false)
        observations: [
          makeObservation({
            supplierProductId: product.id,
            approved: false,
            approvedBy: null,
          }),
        ],
      },
      () => FIXED_NOW,
    );

    const res = await service(repo).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: FIXED_NOW,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("no_approved_price");
  });

  it("observación aprobada: arma ApprovedPriceContext con derivados Q8", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplier],
        supplierProducts: [product],
        observations: [
          makeObservation({
            supplierProductId: product.id,
            observedPrice: "28000",
            approved: true,
          }),
        ],
        pricingRules: [
          makeRule({ ruleType: "preventive_variation", percentage: "0.03" }),
          makeRule({ ruleType: "negotiated_discount", percentage: "0.10" }),
        ],
      },
      () => FIXED_NOW,
    );

    const res = await service(repo).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: FIXED_NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.onlinePublicPrice).toBe("28000");
      expect(res.value.budgetReferencePrice).toBe("28840.0000000000");
      expect(res.value.expectedPurchasePrice).toBe("25200.0000000000");
      expect(res.value.projectedSaving).toBe("3640.0000000000");
      expect(res.value.currency).toBe("COP");
      expect(res.value.supplierProductId).toBe(product.id);
    }
  });

  it("múltiples observaciones del mismo producto: gana la más reciente aprobada", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplier],
        supplierProducts: [product],
        observations: [
          makeObservation({
            supplierProductId: product.id,
            observedPrice: "20000",
            observedAt: "2026-01-10T00:00:00.000Z",
            approved: true,
          }),
          makeObservation({
            supplierProductId: product.id,
            observedPrice: "30000",
            observedAt: "2026-02-15T00:00:00.000Z",
            approved: true,
          }),
        ],
      },
      () => FIXED_NOW,
    );

    const res = await service(repo).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: FIXED_NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.onlinePublicPrice).toBe("30000");
  });

  it("asOf respeta la fecha de corte (ignora observaciones futuras)", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplier],
        supplierProducts: [product],
        observations: [
          makeObservation({
            supplierProductId: product.id,
            observedPrice: "20000",
            observedAt: "2026-01-10T00:00:00.000Z",
            approved: true,
          }),
          makeObservation({
            supplierProductId: product.id,
            observedPrice: "99000",
            observedAt: "2026-06-01T00:00:00.000Z",
            approved: true,
          }),
        ],
      },
      () => FIXED_NOW,
    );

    const res = await service(repo).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: "2026-02-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.onlinePublicPrice).toBe("20000");
  });

  it("múltiples proveedores ⇒ ambiguous_price con candidatos deterministas", async () => {
    const supplierA = makeSupplier({ name: "Prov A" });
    const supplierB = makeSupplier({ name: "Prov B" });
    const productA = makeSupplierProduct({ supplierId: supplierA.id });
    const productB = makeSupplierProduct({ supplierId: supplierB.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplierA, supplierB],
        supplierProducts: [productA, productB],
        observations: [
          makeObservation({
            supplierProductId: productA.id,
            observedPrice: "28000",
            observedAt: "2026-02-01T00:00:00.000Z",
            approved: true,
          }),
          makeObservation({
            supplierProductId: productB.id,
            observedPrice: "27000",
            observedAt: "2026-02-10T00:00:00.000Z",
            approved: true,
          }),
        ],
      },
      () => FIXED_NOW,
    );

    const res = await service(repo).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: FIXED_NOW,
    });
    expect(res.ok).toBe(false);
    if (!res.ok && res.error.kind === "ambiguous_price") {
      expect(res.error.candidates).toHaveLength(2);
      // Orden determinista: observedAt desc ⇒ productB (2026-02-10) primero.
      expect(res.error.candidates[0]?.supplierProductId).toBe(productB.id);
    } else {
      throw new Error("se esperaba ambiguous_price");
    }
  });

  it("ambigüedad resuelta por supplierId en la query", async () => {
    const supplierA = makeSupplier({ name: "Prov A" });
    const supplierB = makeSupplier({ name: "Prov B" });
    const productA = makeSupplierProduct({ supplierId: supplierA.id });
    const productB = makeSupplierProduct({ supplierId: supplierB.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplierA, supplierB],
        supplierProducts: [productA, productB],
        observations: [
          makeObservation({
            supplierProductId: productA.id,
            observedPrice: "28000",
            approved: true,
          }),
          makeObservation({
            supplierProductId: productB.id,
            observedPrice: "27000",
            approved: true,
          }),
        ],
      },
      () => FIXED_NOW,
    );

    const res = await service(repo).getApprovedPrice({
      resourceId: RESOURCE_1,
      supplierId: supplierB.id,
      asOf: FIXED_NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.supplierProductId).toBe(productB.id);
      expect(res.value.onlinePublicPrice).toBe("27000");
    }
  });

  it("precedencia: regla por supplier_product gana sobre la global", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplier],
        supplierProducts: [product],
        observations: [
          makeObservation({
            supplierProductId: product.id,
            observedPrice: "10000",
            approved: true,
          }),
        ],
        pricingRules: [
          makeRule({
            ruleType: "negotiated_discount",
            percentage: "0.05",
            scopeType: "global",
          }),
          makeRule({
            ruleType: "negotiated_discount",
            percentage: "0.20",
            scopeType: "supplier_product",
            scopeReferenceId: product.id,
          }),
        ],
      },
      () => FIXED_NOW,
    );

    const res = await service(repo).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: FIXED_NOW,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Gana descuento 0.20 ⇒ expected = 10000 × 0.80 = 8000.
      expect(res.value.negotiatedDiscountPct).toBe("0.20");
      expect(res.value.expectedPurchasePrice).toBe("8000.0000000000");
    }
  });

  it("es determinista: misma query + datos ⇒ mismo resultado", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const seed = {
      suppliers: [supplier],
      supplierProducts: [product],
      observations: [
        makeObservation({
          supplierProductId: product.id,
          observedPrice: "15000",
          approved: true,
        }),
      ],
    };
    const repo1 = new InMemoryPricingRepository(seed, () => FIXED_NOW);
    const repo2 = new InMemoryPricingRepository(seed, () => FIXED_NOW);
    const r1 = await service(repo1).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: FIXED_NOW,
    });
    const r2 = await service(repo2).getApprovedPrice({
      resourceId: RESOURCE_1,
      asOf: FIXED_NOW,
    });
    expect(r1).toEqual(r2);
  });

  it("aprobador presente en la observación aprobada", async () => {
    const supplier = makeSupplier();
    const product = makeSupplierProduct({ supplierId: supplier.id });
    const repo = new InMemoryPricingRepository(
      {
        suppliers: [supplier],
        supplierProducts: [product],
        observations: [
          makeObservation({
            supplierProductId: product.id,
            approved: true,
            approvedBy: PROFILE_APPROVER,
          }),
        ],
      },
      () => FIXED_NOW,
    );
    const obs = await repo.listObservations(product.id);
    expect(obs[0]?.approvedBy).toBe(PROFILE_APPROVER);
  });
});
