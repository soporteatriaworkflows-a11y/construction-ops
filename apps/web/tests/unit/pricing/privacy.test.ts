import { describe, expect, it } from "vitest";

import {
  findInternalLeaks,
  isClientSafe,
  toClientSafePrice,
} from "@/modules/pricing/privacy";
import {
  INTERNAL_PRICE_FIELDS,
  type ApprovedPriceContext,
} from "@/modules/pricing/types";

import { RESOURCE_1 } from "./fixtures";

const SAMPLE: ApprovedPriceContext = {
  resourceId: RESOURCE_1,
  supplierProductId: "00000000-0000-4000-9000-0000000000c1",
  currency: "COP",
  observedAt: "2026-02-01T00:00:00.000Z",
  approvedAt: "2026-02-02T00:00:00.000Z",
  sourceType: "public_web",
  onlinePublicPrice: "28000.0000000000",
  preventiveVariationPct: "0.03",
  budgetReferencePrice: "28840.0000000000",
  negotiatedDiscountPct: "0.10",
  expectedPurchasePrice: "25200.0000000000",
  actualPurchasePrice: "24000.0000000000",
  projectedSaving: "3640.0000000000",
  realizedSaving: "4840.0000000000",
  sourceReference: "https://internal.test/sku/001",
  manualOverride: false,
};

describe("privacidad backend-first", () => {
  it("toClientSafePrice expone solo resourceId, unitPrice (=budget) y currency", () => {
    const safe = toClientSafePrice(SAMPLE);
    expect(safe).toEqual({
      resourceId: RESOURCE_1,
      unitPrice: "28840.0000000000",
      currency: "COP",
    });
  });

  it("ClientSafePrice NO contiene ningún campo 🔒 interno", () => {
    const safe = toClientSafePrice(SAMPLE) as unknown as Record<
      string,
      unknown
    >;
    for (const field of INTERNAL_PRICE_FIELDS) {
      expect(safe).not.toHaveProperty(field);
    }
    expect(isClientSafe(safe)).toBe(true);
  });

  it("serialización JSON del cliente no filtra descuentos/ahorros/precios internos", () => {
    const safe = toClientSafePrice(SAMPLE);
    const json = JSON.stringify(safe);
    expect(json).not.toContain("negotiatedDiscountPct");
    expect(json).not.toContain("expectedPurchasePrice");
    expect(json).not.toContain("projectedSaving");
    expect(json).not.toContain("realizedSaving");
    expect(json).not.toContain("onlinePublicPrice");
    expect(json).not.toContain("sourceReference");
    // El valor del descuento tampoco aparece como string suelto.
    expect(json).not.toContain("0.10");
  });

  it("findInternalLeaks detecta un payload que filtra campos internos", () => {
    const leaky = {
      resourceId: RESOURCE_1,
      unitPrice: "28840.0000000000",
      currency: "COP",
      negotiatedDiscountPct: "0.10", // fuga deliberada
      projectedSaving: "3640", // fuga deliberada
    };
    const leaks = findInternalLeaks(leaky);
    expect(leaks).toContain("negotiatedDiscountPct");
    expect(leaks).toContain("projectedSaving");
    expect(isClientSafe(leaky)).toBe(false);
  });

  it("la lista INTERNAL_PRICE_FIELDS cubre los campos prohibidos del contrato", () => {
    // Campos que el contrato (§5.1) prohíbe a cliente.
    const required = [
      "onlinePublicPrice",
      "preventiveVariationPct",
      "negotiatedDiscountPct",
      "expectedPurchasePrice",
      "actualPurchasePrice",
      "projectedSaving",
      "realizedSaving",
      "sourceReference",
    ];
    for (const f of required) {
      expect(INTERNAL_PRICE_FIELDS).toContain(f);
    }
  });
});
