/**
 * Fixtures y builders deterministas para los tests del módulo de precios.
 * Respetan las interfaces congeladas (DecimalString como string, sin float).
 */
import type {
  PriceObservationRecord,
  SupplierProductRecord,
  SupplierRecord,
} from "@/modules/pricing/repository";
import type { ResolvableRule } from "@/modules/pricing/rule-resolution";

export const ORG_A = "00000000-0000-4000-9000-0000000000a1";
export const ORG_B = "00000000-0000-4000-9000-0000000000b1";
export const RESOURCE_1 = "00000000-0000-4000-9000-000000000r01";
export const RESOURCE_2 = "00000000-0000-4000-9000-000000000r02";
export const PROFILE_APPROVER = "00000000-0000-4000-9000-0000000000f1";

let counter = 0;
function id(tag: string): string {
  counter += 1;
  return `${tag}-${counter.toString().padStart(4, "0")}`;
}

export function makeSupplier(
  over: Partial<SupplierRecord> = {},
): SupplierRecord {
  return {
    id: id("supplier"),
    organizationId: ORG_A,
    name: "Proveedor A",
    supplierType: "vendor",
    contactData: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function makeSupplierProduct(
  over: Partial<SupplierProductRecord> = {},
): SupplierProductRecord {
  return {
    id: id("product"),
    supplierId: "supplier-seed",
    resourceId: RESOURCE_1,
    supplierSku: "SKU-001",
    supplierProductName: "Cemento gris",
    productUrl: "https://example.test/p/001",
    locationReference: "Bodega 1",
    currency: "COP",
    active: true,
    manualOverride: false,
    lastCheckedAt: null,
    syncStatus: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function makeObservation(
  over: Partial<PriceObservationRecord> = {},
): PriceObservationRecord {
  return {
    id: id("observation"),
    supplierProductId: "product-seed",
    observedPrice: "28000.0000000000",
    stockStatus: "in_stock",
    sourceType: "public_web",
    sourceReference: "https://example.test/p/001",
    observedAt: "2026-02-01T00:00:00.000Z",
    approved: true,
    approvedBy: PROFILE_APPROVER,
    notes: null,
    createdAt: "2026-02-01T01:00:00.000Z",
    ...over,
  };
}

export function makeRule(over: Partial<ResolvableRule> = {}): ResolvableRule {
  return {
    id: id("rule"),
    ruleType: "preventive_variation",
    percentage: "0.03",
    scopeType: "global",
    scopeReferenceId: null,
    active: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}
