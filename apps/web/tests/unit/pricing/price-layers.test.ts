import { describe, expect, it } from "vitest";

import { PriceDecimal, toDecimalString } from "@/modules/pricing/decimal";
import { derivePriceLayers } from "@/modules/pricing/price-layers";

/**
 * Fórmulas canónicas Q8 (base = onlinePublicPrice), con Decimal.js y sin
 * redondeo intermedio. Pruebas: variación preventiva, descuento, ahorro
 * proyectado y ahorro realizado.
 */
describe("derivePriceLayers (fórmulas Q8)", () => {
  it("variación preventiva: budgetReferencePrice = public × (1 + preventive)", () => {
    const r = derivePriceLayers({
      onlinePublicPrice: "28000",
      preventiveVariationPct: "0.03",
      negotiatedDiscountPct: "0",
    });
    // 28000 × 1.03 = 28840
    expect(r.budgetReferencePrice).toBe("28840.0000000000");
  });

  it("descuento: expectedPurchasePrice = public × (1 − discount)", () => {
    const r = derivePriceLayers({
      onlinePublicPrice: "28000",
      preventiveVariationPct: "0.03",
      negotiatedDiscountPct: "0.10",
    });
    // 28000 × 0.90 = 25200
    expect(r.expectedPurchasePrice).toBe("25200.0000000000");
  });

  it("ahorro proyectado = budgetReference − expectedPurchase", () => {
    const r = derivePriceLayers({
      onlinePublicPrice: "28000",
      preventiveVariationPct: "0.03",
      negotiatedDiscountPct: "0.10",
    });
    // 28840 − 25200 = 3640
    expect(r.projectedSaving).toBe("3640.0000000000");
  });

  it("ahorro realizado = budgetReference − actualPurchase (cuando hay real)", () => {
    const r = derivePriceLayers({
      onlinePublicPrice: "28000",
      preventiveVariationPct: "0.03",
      negotiatedDiscountPct: "0.10",
      actualPurchasePrice: "24000",
    });
    // 28840 − 24000 = 4840
    expect(r.realizedSaving).toBe("4840.0000000000");
  });

  it("ahorro realizado ausente cuando no hay precio real", () => {
    const r = derivePriceLayers({
      onlinePublicPrice: "28000",
      preventiveVariationPct: "0.03",
      negotiatedDiscountPct: "0.10",
    });
    expect(r.realizedSaving).toBeUndefined();
  });

  it("ahorro realizado ausente cuando actualPurchasePrice es null", () => {
    const r = derivePriceLayers({
      onlinePublicPrice: "28000",
      preventiveVariationPct: "0.03",
      negotiatedDiscountPct: "0.10",
      actualPurchasePrice: null,
    });
    expect(r.realizedSaving).toBeUndefined();
  });

  it("precisión: no redondea pasos intermedios (decimales finos)", () => {
    const publicPrice = "33608.4479936907";
    const preventive = "0.035";
    const discount = "0.1234";
    const r = derivePriceLayers({
      onlinePublicPrice: publicPrice,
      preventiveVariationPct: preventive,
      negotiatedDiscountPct: discount,
    });
    // Oráculo independiente con la misma instancia Decimal (precisión completa).
    const p = new PriceDecimal(publicPrice);
    const expectedBudget = toDecimalString(
      p.times(new PriceDecimal(1).plus(preventive)),
    );
    const expectedExpected = toDecimalString(
      p.times(new PriceDecimal(1).minus(discount)),
    );
    expect(r.budgetReferencePrice).toBe(expectedBudget);
    expect(r.expectedPurchasePrice).toBe(expectedExpected);
    // El ahorro proyectado es coherente con los derivados.
    expect(r.projectedSaving).toBe(
      toDecimalString(
        new PriceDecimal(expectedBudget).minus(expectedExpected),
      ),
    );
  });

  it("descuento 0 ⇒ expectedPurchase = onlinePublic", () => {
    const r = derivePriceLayers({
      onlinePublicPrice: "12345.6789",
      preventiveVariationPct: "0",
      negotiatedDiscountPct: "0",
    });
    expect(r.expectedPurchasePrice).toBe("12345.6789000000");
    expect(r.budgetReferencePrice).toBe("12345.6789000000");
    expect(r.projectedSaving).toBe("0.0000000000");
  });
});
