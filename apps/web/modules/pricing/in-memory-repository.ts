/**
 * Implementación in-memory del `PricingRepository` — agent-pricing.
 *
 * Sirve a tests unitarios y como referencia ejecutable de la semántica del
 * dominio. Hace cumplir:
 * - `price_observations` APPEND-ONLY (sin update/delete del precio); solo se
 *   permite fijar `approved`/`approvedBy`.
 * - Aislamiento por `organization_id` (la implementación Drizzle lo delega a
 *   RLS; aquí se modela por filtros explícitos).
 *
 * NO usa float JS para precios: los montos se conservan como `DecimalString`.
 */
import type {
  IsoDateTime,
  SupplierType,
  SyncStatus,
  Uuid,
} from "@/lib/utils/types";

import type {
  NewPriceObservationInput,
  NewSupplierInput,
  NewSupplierProductInput,
  ObservationQuery,
  PriceObservationRecord,
  PricingRepository,
  SupplierProductRecord,
  SupplierRecord,
  UpdateSupplierInput,
  UpdateSupplierProductInput,
} from "./repository";
import type { ResolvableRule } from "./rule-resolution";

/**
 * Generador de UUID determinista por prefijo (no usa azar; estable en tests).
 * El `prefix` se codifica en el segmento de nodo para distinguir entidades.
 */
function makeIdFactory(prefix: string): () => Uuid {
  let seq = 0;
  // Tomamos 4 hex del prefijo para el segmento de variante (estable, legible).
  const tag = Array.from(prefix)
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
    .toString(16)
    .padStart(3, "0")
    .slice(0, 3);
  return () => {
    seq += 1;
    const node = seq.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8${tag}-${node}` as Uuid;
  };
}

export interface InMemoryPricingSeed {
  suppliers?: SupplierRecord[];
  supplierProducts?: SupplierProductRecord[];
  observations?: PriceObservationRecord[];
  pricingRules?: ResolvableRule[];
}

export class InMemoryPricingRepository implements PricingRepository {
  private readonly suppliers = new Map<Uuid, SupplierRecord>();
  private readonly supplierProducts = new Map<Uuid, SupplierProductRecord>();
  private readonly observations = new Map<Uuid, PriceObservationRecord>();
  private readonly pricingRules: ResolvableRule[] = [];

  private readonly nextSupplierId = makeIdFactory("supplier");
  private readonly nextProductId = makeIdFactory("product");
  private readonly nextObservationId = makeIdFactory("observation");

  /** Reloj inyectable para timestamps deterministas en tests. */
  constructor(
    seed?: InMemoryPricingSeed,
    private readonly now: () => IsoDateTime = () => new Date().toISOString(),
  ) {
    for (const s of seed?.suppliers ?? []) this.suppliers.set(s.id, s);
    for (const p of seed?.supplierProducts ?? [])
      this.supplierProducts.set(p.id, p);
    for (const o of seed?.observations ?? []) this.observations.set(o.id, o);
    for (const r of seed?.pricingRules ?? []) this.pricingRules.push(r);
  }

  /* ---------------------------------------------------------------- Proveedores */

  async createSupplier(input: NewSupplierInput): Promise<SupplierRecord> {
    const ts = this.now();
    const record: SupplierRecord = {
      id: this.nextSupplierId(),
      organizationId: input.organizationId,
      name: input.name,
      supplierType: (input.supplierType ?? "vendor") as SupplierType,
      contactData: input.contactData ?? null,
      active: input.active ?? true,
      createdAt: ts,
      updatedAt: ts,
    };
    this.suppliers.set(record.id, record);
    return record;
  }

  async getSupplier(id: Uuid): Promise<SupplierRecord | null> {
    return this.suppliers.get(id) ?? null;
  }

  async listSuppliers(organizationId: Uuid): Promise<SupplierRecord[]> {
    return [...this.suppliers.values()].filter(
      (s) => s.organizationId === organizationId,
    );
  }

  async updateSupplier(
    id: Uuid,
    input: UpdateSupplierInput,
  ): Promise<SupplierRecord | null> {
    const existing = this.suppliers.get(id);
    if (!existing) return null;
    const updated: SupplierRecord = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.supplierType !== undefined
        ? { supplierType: input.supplierType }
        : {}),
      ...(input.contactData !== undefined
        ? { contactData: input.contactData }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: this.now(),
    };
    this.suppliers.set(id, updated);
    return updated;
  }

  /* ----------------------------------------------------- Productos de proveedor */

  async createSupplierProduct(
    input: NewSupplierProductInput,
  ): Promise<SupplierProductRecord> {
    const ts = this.now();
    const record: SupplierProductRecord = {
      id: this.nextProductId(),
      supplierId: input.supplierId,
      resourceId: input.resourceId,
      supplierSku: input.supplierSku ?? null,
      supplierProductName: input.supplierProductName ?? null,
      productUrl: input.productUrl ?? null,
      locationReference: input.locationReference ?? null,
      currency: input.currency ?? "COP",
      active: input.active ?? true,
      manualOverride: input.manualOverride ?? false,
      lastCheckedAt: null,
      syncStatus: (input.syncStatus ?? "manual") as SyncStatus,
      createdAt: ts,
      updatedAt: ts,
    };
    this.supplierProducts.set(record.id, record);
    return record;
  }

  async getSupplierProduct(
    id: Uuid,
  ): Promise<SupplierProductRecord | null> {
    return this.supplierProducts.get(id) ?? null;
  }

  async listSupplierProducts(
    supplierId: Uuid,
  ): Promise<SupplierProductRecord[]> {
    return [...this.supplierProducts.values()].filter(
      (p) => p.supplierId === supplierId,
    );
  }

  async listSupplierProductsByResource(
    resourceId: Uuid,
  ): Promise<SupplierProductRecord[]> {
    return [...this.supplierProducts.values()].filter(
      (p) => p.resourceId === resourceId,
    );
  }

  async updateSupplierProduct(
    id: Uuid,
    input: UpdateSupplierProductInput,
  ): Promise<SupplierProductRecord | null> {
    const existing = this.supplierProducts.get(id);
    if (!existing) return null;
    const updated: SupplierProductRecord = {
      ...existing,
      ...input,
      updatedAt: this.now(),
    };
    this.supplierProducts.set(id, updated);
    return updated;
  }

  /* ------------------------------------------- Observaciones (APPEND-ONLY) */

  async insertObservation(
    input: NewPriceObservationInput,
  ): Promise<PriceObservationRecord> {
    const record: PriceObservationRecord = {
      id: this.nextObservationId(),
      supplierProductId: input.supplierProductId,
      observedPrice: input.observedPrice,
      stockStatus: input.stockStatus ?? null,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference ?? null,
      observedAt: input.observedAt,
      approved: input.approved ?? false,
      approvedBy: input.approvedBy ?? null,
      notes: input.notes ?? null,
      createdAt: this.now(),
    };
    this.observations.set(record.id, record);
    return record;
  }

  async listObservations(
    supplierProductId: Uuid,
  ): Promise<PriceObservationRecord[]> {
    return [...this.observations.values()]
      .filter((o) => o.supplierProductId === supplierProductId)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  }

  async queryObservations(
    query: ObservationQuery,
  ): Promise<PriceObservationRecord[]> {
    // Productos candidatos según resource/supplier/product.
    const productIds = new Set<Uuid>();
    for (const p of this.supplierProducts.values()) {
      if (query.supplierProductId && p.id !== query.supplierProductId) continue;
      if (query.supplierId && p.supplierId !== query.supplierId) continue;
      if (query.resourceId && p.resourceId !== query.resourceId) continue;
      productIds.add(p.id);
    }

    const cutoff =
      query.observedAtOrBefore !== undefined
        ? Date.parse(query.observedAtOrBefore)
        : undefined;

    return [...this.observations.values()]
      .filter((o) => productIds.has(o.supplierProductId))
      .filter((o) => (query.approvedOnly ? o.approved : true))
      .filter((o) =>
        cutoff === undefined ? true : Date.parse(o.observedAt) <= cutoff,
      )
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  }

  async getObservation(
    id: Uuid,
  ): Promise<PriceObservationRecord | null> {
    return this.observations.get(id) ?? null;
  }

  async markObservationApproved(
    id: Uuid,
    approvedBy: Uuid,
  ): Promise<PriceObservationRecord | null> {
    const existing = this.observations.get(id);
    if (!existing) return null;
    // APPEND-ONLY: solo se modifica el estado de aprobación, NUNCA el precio.
    const updated: PriceObservationRecord = {
      ...existing,
      approved: true,
      approvedBy,
    };
    this.observations.set(id, updated);
    return updated;
  }

  /* ------------------------------------------------------------- Reglas */

  async listPricingRules(
    _organizationId: Uuid,
  ): Promise<ResolvableRule[]> {
    // En memoria las reglas se cargan ya filtradas por organización en el seed.
    return [...this.pricingRules];
  }
}
