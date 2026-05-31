/**
 * Fixtures y helpers deterministas para los tests del adaptador de proveedores.
 * Sin datos privados reales. Sin conexión remota.
 */

import type {
  ResourceCatalog,
  RawSupplierItem,
  RecordObservationInput,
  SkuMatchCandidate,
  SkuMatchProposal,
} from "@/modules/pricing/adapters/types";
import type { MinimalApprovalPort } from "@/modules/pricing/adapters/supplier-adapter";
import type { PriceObservationRecord, SupplierProductRecord } from "@/modules/pricing/repository";

/* ----------------------------------------------------------------------------
 * UUIDs deterministas para tests
 * ------------------------------------------------------------------------- */

export const ORG_A = "00000000-0000-4000-9000-0000000000a1";
export const PROFILE_APPROVER = "00000000-0000-4000-9000-0000000000f1";

export const RESOURCE_IDS = {
  cemento: "00000000-0000-4000-9000-000000000r01",
  arena: "00000000-0000-4000-9000-000000000r02",
  gravilla: "00000000-0000-4000-9000-000000000r03",
  ladrillo: "00000000-0000-4000-9000-000000000r04",
  ceramica: "00000000-0000-4000-9000-000000000r05",
  cable: "00000000-0000-4000-9000-000000000r06",
} as const;

export const PRODUCT_IDS = {
  cemento: "00000000-0000-4000-9000-000000000p01",
  arena: "00000000-0000-4000-9000-000000000p02",
} as const;

export const SUPPLIER_ID = "00000000-0000-4000-9000-0000000000s1";

/* ----------------------------------------------------------------------------
 * Catálogos de prueba
 * ------------------------------------------------------------------------- */

export const SAMPLE_CATALOG: ResourceCatalog = {
  resources: [
    {
      resourceId: RESOURCE_IDS.cemento,
      name: "Cemento gris Portland",
      code: "CEM-001",
      unit: "bulto",
    },
    {
      resourceId: RESOURCE_IDS.arena,
      name: "Arena de rio",
      code: "ARE-001",
      unit: "bulto",
    },
    {
      resourceId: RESOURCE_IDS.gravilla,
      name: "Gravilla 3/4",
      code: "GRV-034",
      unit: "bulto",
    },
    {
      resourceId: RESOURCE_IDS.ladrillo,
      name: "Ladrillo prensado",
      code: "LAD-001",
      unit: "und",
    },
    {
      resourceId: RESOURCE_IDS.ceramica,
      name: "Ceramica piso 45x45",
      code: "CER-4545G",
      unit: "m2",
    },
    {
      resourceId: RESOURCE_IDS.cable,
      name: "Cable electrico thhn #12",
      code: "CAB-THHN-12",
      unit: "rollo",
    },
  ],
};

export const EMPTY_CATALOG: ResourceCatalog = { resources: [] };

/* ----------------------------------------------------------------------------
 * CSV de prueba
 * ------------------------------------------------------------------------- */

/** CSV válido con todas las columnas obligatorias y opcionales. */
export const VALID_CSV = `nombre,precio,moneda,sku,url,unidad,fecha,referencia_fuente
Cemento gris Portland 50kg,28000,COP,CEM-001,https://example.test/p/1,bulto,2026-05-30T00:00:00.000Z,cat-2026-05
Arena de rio limpia x bulto,15000,COP,,,bulto,2026-05-30T00:00:00.000Z,
Gravilla 3/4 pulgada x bulto,22000,COP,GRV-034,,bulto,2026-05-30T00:00:00.000Z,cat-2026-05`;

/** CSV mínimo (solo columnas obligatorias). */
export const MINIMAL_CSV = `nombre,precio,moneda
Cemento gris Portland,28000,COP
Arena de rio,15000,COP`;

/** CSV con columna obligatoria faltante. */
export const MISSING_REQUIRED_COLUMN_CSV = `nombre,precio
Cemento gris Portland,28000`;

/** CSV con precio inválido. */
export const INVALID_PRICE_CSV = `nombre,precio,moneda
Cemento gris Portland,NO_ES_PRECIO,COP
Arena de rio,15000,COP`;

/** CSV con precio negativo. */
export const NEGATIVE_PRICE_CSV = `nombre,precio,moneda
Cemento gris Portland,-100,COP`;

/** CSV con precio en formato europeo (puntos como miles, coma como decimal). */
export const EUROPEAN_FORMAT_CSV = `nombre,precio,moneda
Cemento gris Portland,"28.000,50",COP`;

/** CSV con separador punto y coma. */
export const SEMICOLON_CSV = `nombre;precio;moneda;sku
Cemento gris Portland;28000;COP;CEM-001
Arena de rio;15000;COP;`;

/** CSV con nombre vacío. */
export const EMPTY_NAME_CSV = `nombre,precio,moneda
,28000,COP
Arena de rio,15000,COP`;

/** CSV vacío. */
export const EMPTY_CSV = ``;

/** CSV con solo encabezado. */
export const HEADER_ONLY_CSV = `nombre,precio,moneda`;

/** CSV idempotente (igual que VALID_CSV — para test de re-importación). */
export const DUPLICATE_CSV = VALID_CSV;

/* ----------------------------------------------------------------------------
 * Builders de propuestas
 * ------------------------------------------------------------------------- */

export function makeRawItem(over: Partial<RawSupplierItem> = {}): RawSupplierItem {
  return {
    name: "Cemento gris Portland",
    onlinePublicPrice: "28000.0000000000",
    currency: "COP",
    observedAt: "2026-05-30T00:00:00.000Z",
    rawRowIndex: 0,
    ...over,
  };
}

export function makeCandidate(
  over: Partial<SkuMatchCandidate> = {},
): SkuMatchCandidate {
  return {
    resourceId: RESOURCE_IDS.cemento,
    supplierProductId: PRODUCT_IDS.cemento,
    score: 0.8,
    reason: "Similitud de nombre: 80%",
    ...over,
  };
}

export function makeApprovedProposal(
  over: Partial<SkuMatchProposal> = {},
): SkuMatchProposal {
  const candidate = makeCandidate();
  return {
    rawItem: makeRawItem(),
    candidates: [candidate],
    chosen: candidate,
    status: "approved",
    requiresManualReview: false,
    ...over,
  };
}

export function makePendingProposal(
  over: Partial<SkuMatchProposal> = {},
): SkuMatchProposal {
  return {
    rawItem: makeRawItem(),
    candidates: [makeCandidate({ score: 0.3 }), makeCandidate({ score: 0.31, resourceId: RESOURCE_IDS.arena })],
    status: "pending",
    requiresManualReview: true,
    ...over,
  };
}

export function makeRejectedProposal(
  over: Partial<SkuMatchProposal> = {},
): SkuMatchProposal {
  return {
    rawItem: makeRawItem(),
    candidates: [],
    status: "rejected",
    requiresManualReview: false,
    ...over,
  };
}

/* ----------------------------------------------------------------------------
 * Builders de records de pricing
 * ------------------------------------------------------------------------- */

export function makeSupplierProduct(
  over: Partial<SupplierProductRecord> = {},
): SupplierProductRecord {
  return {
    id: PRODUCT_IDS.cemento,
    supplierId: SUPPLIER_ID,
    resourceId: RESOURCE_IDS.cemento,
    supplierSku: "CEM-001",
    supplierProductName: "Cemento gris Portland",
    productUrl: "https://example.test/p/1",
    locationReference: null,
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

export function makePriceObservation(
  over: Partial<PriceObservationRecord> = {},
): PriceObservationRecord {
  return {
    id: "00000000-0000-4000-9000-000000000o01",
    supplierProductId: PRODUCT_IDS.cemento,
    observedPrice: "28000.0000000000",
    stockStatus: null,
    sourceType: "supplier_csv",
    sourceReference: null,
    observedAt: "2026-05-30T00:00:00.000Z",
    approved: false,
    approvedBy: null,
    notes: null,
    createdAt: "2026-05-30T01:00:00.000Z",
    ...over,
  };
}

/* ----------------------------------------------------------------------------
 * Mock de PricingApprovalPort
 * ------------------------------------------------------------------------- */

export interface MockApprovalPort extends MinimalApprovalPort {
  recordedObservations: Array<{ observationId: string; input: unknown }>;
  approvedObservations: string[];
}

/** Crea un mock del PricingApprovalPort que no conecta a la DB. */
export function createMockApprovalPort(): MockApprovalPort {
  let obsCounter = 0;
  const recordedObservations: Array<{ observationId: string; input: unknown }> = [];
  const approvedObservations: string[] = [];

  return {
    recordedObservations,
    approvedObservations,
    async recordObservation(input: RecordObservationInput) {
      obsCounter++;
      const observationId = `obs-${obsCounter.toString().padStart(4, "0")}`;
      recordedObservations.push({ observationId, input });
      return { observationId };
    },
    async approveObservation(input) {
      approvedObservations.push(input.observationId);
      return {};
    },
  };
}
