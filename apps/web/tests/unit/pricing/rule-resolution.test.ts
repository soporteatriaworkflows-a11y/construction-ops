import { describe, expect, it } from "vitest";

import {
  resolvePercentage,
  resolveRule,
} from "@/modules/pricing/rule-resolution";

import { makeRule, RESOURCE_1 } from "./fixtures";

const PRODUCT = "00000000-0000-4000-9000-0000000000c1";
const PROJECT = "00000000-0000-4000-9000-0000000000p1";
const SCOPE = "00000000-0000-4000-9000-0000000000s1";

describe("resolución de reglas (precedencia explícita)", () => {
  it("precedencia: supplier_product > resource > scope > project > global", () => {
    const rules = [
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.01",
        scopeType: "global",
      }),
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.02",
        scopeType: "project",
        scopeReferenceId: PROJECT,
      }),
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.03",
        scopeType: "scope",
        scopeReferenceId: SCOPE,
      }),
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.04",
        scopeType: "resource",
        scopeReferenceId: RESOURCE_1,
      }),
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.05",
        scopeType: "supplier_product",
        scopeReferenceId: PRODUCT,
      }),
    ];
    const pct = resolvePercentage(rules, "negotiated_discount", {
      projectId: PROJECT,
      projectScopeId: SCOPE,
      resourceId: RESOURCE_1,
      supplierProductId: PRODUCT,
    });
    expect(pct).toBe("0.05");
  });

  it("cae al siguiente nivel cuando el más específico no aplica", () => {
    const rules = [
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.01",
        scopeType: "global",
      }),
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.04",
        scopeType: "resource",
        scopeReferenceId: RESOURCE_1,
      }),
    ];
    // Sin supplier_product que aplique ⇒ gana resource.
    const pct = resolvePercentage(rules, "negotiated_discount", {
      resourceId: RESOURCE_1,
      supplierProductId: PRODUCT,
    });
    expect(pct).toBe("0.04");
  });

  it("ignora reglas inactivas", () => {
    const rules = [
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.20",
        scopeType: "supplier_product",
        scopeReferenceId: PRODUCT,
        active: false,
      }),
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.05",
        scopeType: "global",
      }),
    ];
    const pct = resolvePercentage(rules, "negotiated_discount", {
      supplierProductId: PRODUCT,
    });
    expect(pct).toBe("0.05");
  });

  it("ignora reglas fuera de vigencia (effectiveFrom/effectiveTo)", () => {
    const rules = [
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.20",
        scopeType: "global",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      }),
      makeRule({
        ruleType: "negotiated_discount",
        percentage: "0.05",
        scopeType: "global",
        effectiveTo: "2026-12-31T00:00:00.000Z",
      }),
    ];
    const pct = resolvePercentage(
      rules,
      "negotiated_discount",
      { asOf: "2026-03-01T00:00:00.000Z" },
      "0",
    );
    // La de 0.20 aún no es vigente (from 2026-06); gana la de 0.05.
    expect(pct).toBe("0.05");
  });

  it("desempate determinista en mismo nivel: gana la más reciente vigente", () => {
    const rules = [
      makeRule({
        id: "rule-old",
        ruleType: "preventive_variation",
        percentage: "0.02",
        scopeType: "global",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      }),
      makeRule({
        id: "rule-new",
        ruleType: "preventive_variation",
        percentage: "0.03",
        scopeType: "global",
        effectiveFrom: "2026-02-01T00:00:00.000Z",
      }),
    ];
    const rule = resolveRule(rules, "preventive_variation", {
      asOf: "2026-03-01T00:00:00.000Z",
    });
    expect(rule?.percentage).toBe("0.03");
  });

  it("sin regla aplicable ⇒ fallback", () => {
    const pct = resolvePercentage(
      [],
      "negotiated_discount",
      { resourceId: RESOURCE_1 },
      "0",
    );
    expect(pct).toBe("0");
  });
});
