/**
 * types.ts — Tipos del servidor para Price Intelligence Foundation (Fase 3A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_INTELLIGENCE_FOUNDATION_CONTRACT.md §4.
 *
 * Reglas:
 *  - Todo valor monetario y porcentaje viajan como DecimalString (string decimal).
 *  - Campos 🔒 nunca se serializan a rol cliente.
 *  - organization_id, created_by, approved_by SIEMPRE server-side.
 */
import type { Uuid, IsoDateTime, DecimalString, PriceSourceType } from '@/lib/utils/types';
import type { SupplierType } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';

export type { Uuid, IsoDateTime, DecimalString, PriceSourceType, SupplierType, AuthenticatedViewer };

export type ObservationStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type PriceHistoryOrigin = 'manual' | 'batch' | 'monitor';

// ---------------------------------------------------------------------------
// Providers (Suppliers — extended view)
// ---------------------------------------------------------------------------

/** Vista de proveedor (campos públicos + campos 🔒 para roles internos). */
export interface ProviderView {
  id: Uuid;
  name: string;
  supplierType: SupplierType;
  websiteUrl: string | null;
  /** 🔒 solo admin/gerencia/compras */
  defaultDiscountPercent: DecimalString;
  /** 🔒 solo admin/gerencia */
  notes: string | null;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ProviderCreateInput {
  name: string;
  supplierType?: SupplierType;
  websiteUrl?: string | null;
  /** porcentaje 0–100 como DecimalString (ej. "10" = 10%) */
  defaultDiscountPercent?: DecimalString;
  notes?: string | null;
}

export interface ProviderUpdateInput {
  name?: string;
  websiteUrl?: string | null;
  /** porcentaje 0–100 como DecimalString */
  defaultDiscountPercent?: DecimalString;
  notes?: string | null;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Resource Price Observations
// ---------------------------------------------------------------------------

/** Vista de observación de precio de recurso. */
export interface ResourcePriceObservationView {
  id: Uuid;
  resourceId: Uuid;
  supplierId: Uuid | null;
  supplierName: string | null;
  /** 🔒 precio público observado */
  observedPrice: DecimalString;
  /** 🔒 descuento % (0–100) */
  discountPercent: DecimalString;
  /** 🔒 precio neto sugerido (DB-computed) */
  suggestedNetPrice: DecimalString;
  unit: string;
  currency: string;
  sourceType: PriceSourceType;
  sourceReference: string | null;
  observedAt: IsoDateTime;
  validUntil: IsoDateTime | null;
  status: ObservationStatus;
  /** runtime: true si approved y expiró (30d o valid_until) */
  isStale: boolean;
  notes: string | null;
  createdAt: IsoDateTime;
  /** 🔒 timestamp de revisión */
  approvedAt: IsoDateTime | null;
  rejectionReason: string | null;
}

export interface ResourcePriceHistoryRow {
  id: Uuid;
  resourceId: Uuid;
  supplierId: Uuid | null;
  supplierName: string | null;
  observedPrice: DecimalString | null;
  discountPercent: DecimalString | null;
  suggestedNetPrice: DecimalString | null;
  currency: string | null;
  unit: string | null;
  status: ObservationStatus;
  sourceType: PriceSourceType | null;
  sourceReference: string | null;
  observedAt: IsoDateTime;
  validUntil: IsoDateTime | null;
  approvedAt: IsoDateTime | null;
  rejectionReason: string | null;
  notes: string | null;
  importBatchId: Uuid | null;
  importBatchLabel: string | null;
  importBatchSourceReference: string | null;
  monitorResultId: Uuid | null;
  monitorResultStatus: string | null;
  monitorCheckedAt: IsoDateTime | null;
  monitorWarnings: string[];
  previousApprovedPrice: DecimalString | null;
  deltaAbs: DecimalString | null;
  deltaPct: DecimalString | null;
  origin: PriceHistoryOrigin;
}
/** Input de creación de observación (campos que acepta el cliente). */
export interface CreateObservationInput {
  resourceId: Uuid;
  supplierId?: Uuid | null;
  /** precio público observado (DecimalString, >= 0) */
  observedPrice: DecimalString;
  /** descuento % 0–100 (DecimalString, default "0") */
  discountPercent?: DecimalString;
  unit: string;
  /** ISO-4217, default 'COP' */
  currency?: string;
  sourceType: PriceSourceType;
  sourceReference?: string | null;
  observedAt: IsoDateTime;
  validUntil?: IsoDateTime | null;
  notes?: string | null;
}

/** Input de aprobación (approved_by y approved_at son server-side). */
export interface ApproveObservationInput {
  observationId: Uuid;
}

/** Input de rechazo. */
export interface RejectObservationInput {
  observationId: Uuid;
  rejectionReason: string;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface ResourcePriceIntelligenceSummary {
  resourceId: Uuid;
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  approvedCount: number;
  pendingCount: number;
  /** 🔒 null si no hay approved */
  latestApprovedPrice: DecimalString | null;
  latestApprovedAt: IsoDateTime | null;
  latestApprovedIsStale: boolean;
}

// ---------------------------------------------------------------------------
// Repository ports
// ---------------------------------------------------------------------------

export interface ProviderRepository {
  readonly source: 'db' | 'fixture';
  listProviders(viewer: AuthenticatedViewer): Promise<ProviderView[]>;
  createProvider(viewer: AuthenticatedViewer, input: ProviderCreateInput): Promise<ProviderView>;
  updateProvider(viewer: AuthenticatedViewer, providerId: Uuid, input: ProviderUpdateInput): Promise<ProviderView>;
  getProviderById(viewer: AuthenticatedViewer, providerId: Uuid): Promise<ProviderView>;
}

export interface PriceObservationRepository {
  readonly source: 'db' | 'fixture';
  listResourcePriceObservations(
    viewer: AuthenticatedViewer,
    resourceId: Uuid,
  ): Promise<ResourcePriceObservationView[]>;
  listResourcePriceHistory(
    viewer: AuthenticatedViewer,
    resourceId: Uuid,
    limit: number,
  ): Promise<ResourcePriceHistoryRow[]>;
  createResourcePriceObservation(
    viewer: AuthenticatedViewer,
    input: CreateObservationInput,
  ): Promise<ResourcePriceObservationView>;
  approveResourcePriceObservation(
    viewer: AuthenticatedViewer,
    input: ApproveObservationInput,
  ): Promise<ResourcePriceObservationView>;
  rejectResourcePriceObservation(
    viewer: AuthenticatedViewer,
    input: RejectObservationInput,
  ): Promise<ResourcePriceObservationView>;
  getResourcePriceIntelligenceSummary(
    viewer: AuthenticatedViewer,
    resourceId: Uuid,
  ): Promise<ResourcePriceIntelligenceSummary | null>;
  /**
   * Conteo org-wide de observaciones `pending` (KPI del dashboard operativo,
   * Oleada OPERATIONAL BUDGET UX V1). 🔒 solo roles internal/management.
   */
  countPendingResourcePriceObservations(viewer: AuthenticatedViewer): Promise<number>;
}
