/**
 * Puerto de persistencia del dominio de precios — agent-pricing.
 *
 * Abstrae el acceso a `suppliers`, `supplier_products`, `price_observations` y
 * `pricing_rules` para que los servicios (lectura/aprobación) sean testeables
 * sin DB y la implementación Drizzle viva detrás de esta interfaz. RLS en
 * PostgreSQL garantiza el aislamiento por organización; este puerto opera sobre
 * datos ya filtrados por la sesión.
 *
 * `price_observations` es APPEND-ONLY: el repositorio NO expone update/delete
 * de observaciones; solo `insertObservation` y `markObservationApproved` (que
 * únicamente fija `approved`/`approvedBy`, nunca el precio — espejo de la
 * política RLS de inmutabilidad).
 */
import type {
  DecimalString,
  IsoDateTime,
  PriceSourceType,
  SupplierType,
  SyncStatus,
  Uuid,
} from "@/lib/utils/types";

import type { ResolvableRule } from "./rule-resolution";

/* --- Proveedores --- */

export interface SupplierRecord {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  supplierType: SupplierType;
  contactData?: Record<string, unknown> | null;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface NewSupplierInput {
  organizationId: Uuid;
  name: string;
  supplierType?: SupplierType;
  contactData?: Record<string, unknown> | null;
  active?: boolean;
}

export interface UpdateSupplierInput {
  name?: string;
  supplierType?: SupplierType;
  contactData?: Record<string, unknown> | null;
  active?: boolean;
}

/* --- Productos de proveedor --- */

export interface SupplierProductRecord {
  id: Uuid;
  supplierId: Uuid;
  resourceId: Uuid;
  supplierSku?: string | null;
  supplierProductName?: string | null;
  productUrl?: string | null;
  locationReference?: string | null;
  currency: string;
  active: boolean;
  manualOverride: boolean;
  lastCheckedAt?: IsoDateTime | null;
  syncStatus: SyncStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface NewSupplierProductInput {
  supplierId: Uuid;
  resourceId: Uuid;
  supplierSku?: string | null;
  supplierProductName?: string | null;
  productUrl?: string | null;
  locationReference?: string | null;
  currency?: string;
  active?: boolean;
  manualOverride?: boolean;
  syncStatus?: SyncStatus;
}

export interface UpdateSupplierProductInput {
  supplierSku?: string | null;
  supplierProductName?: string | null;
  productUrl?: string | null;
  locationReference?: string | null;
  currency?: string;
  active?: boolean;
  manualOverride?: boolean;
  lastCheckedAt?: IsoDateTime | null;
  syncStatus?: SyncStatus;
}

/* --- Observaciones de precio (append-only) --- */

export interface PriceObservationRecord {
  id: Uuid;
  supplierProductId: Uuid;
  observedPrice: DecimalString;
  stockStatus?: string | null;
  sourceType: PriceSourceType;
  sourceReference?: string | null;
  observedAt: IsoDateTime;
  approved: boolean;
  approvedBy?: Uuid | null;
  notes?: string | null;
  createdAt: IsoDateTime;
}

export interface NewPriceObservationInput {
  supplierProductId: Uuid;
  observedPrice: DecimalString;
  sourceType: PriceSourceType;
  observedAt: IsoDateTime;
  stockStatus?: string | null;
  sourceReference?: string | null;
  notes?: string | null;
  /** opcional: aprobación inmediata (override manual aprobado) */
  approved?: boolean;
  approvedBy?: Uuid | null;
}

/** Filtro para consultar observaciones (lectura). */
export interface ObservationQuery {
  resourceId?: Uuid;
  supplierId?: Uuid;
  supplierProductId?: Uuid;
  /** solo aprobadas */
  approvedOnly?: boolean;
  /** observadas en o antes de esta fecha de corte */
  observedAtOrBefore?: IsoDateTime;
}

/**
 * Puerto de repositorio. La implementación Drizzle (DB real) y la in-memory
 * (tests/mocks) cumplen esta interfaz.
 */
export interface PricingRepository {
  /* Proveedores */
  createSupplier(input: NewSupplierInput): Promise<SupplierRecord>;
  getSupplier(id: Uuid): Promise<SupplierRecord | null>;
  listSuppliers(organizationId: Uuid): Promise<SupplierRecord[]>;
  updateSupplier(
    id: Uuid,
    input: UpdateSupplierInput,
  ): Promise<SupplierRecord | null>;

  /* Productos de proveedor */
  createSupplierProduct(
    input: NewSupplierProductInput,
  ): Promise<SupplierProductRecord>;
  getSupplierProduct(id: Uuid): Promise<SupplierProductRecord | null>;
  listSupplierProducts(supplierId: Uuid): Promise<SupplierProductRecord[]>;
  listSupplierProductsByResource(
    resourceId: Uuid,
  ): Promise<SupplierProductRecord[]>;
  updateSupplierProduct(
    id: Uuid,
    input: UpdateSupplierProductInput,
  ): Promise<SupplierProductRecord | null>;

  /* Observaciones de precio (APPEND-ONLY) */
  insertObservation(
    input: NewPriceObservationInput,
  ): Promise<PriceObservationRecord>;
  /** Histórico completo de un producto (más reciente primero). */
  listObservations(
    supplierProductId: Uuid,
  ): Promise<PriceObservationRecord[]>;
  /** Consulta observaciones según filtro (para resolución de precio). */
  queryObservations(
    query: ObservationQuery,
  ): Promise<PriceObservationRecord[]>;
  getObservation(id: Uuid): Promise<PriceObservationRecord | null>;
  /**
   * Marca una observación como aprobada. SOLO fija `approved`/`approvedBy`
   * (nunca el precio): espejo de la política RLS de inmutabilidad.
   */
  markObservationApproved(
    id: Uuid,
    approvedBy: Uuid,
  ): Promise<PriceObservationRecord | null>;

  /* Reglas de precio */
  listPricingRules(organizationId: Uuid): Promise<ResolvableRule[]>;
}
