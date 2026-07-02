/**
 * fixture-repository.ts — Repositorios demo/fixture para Price Intelligence (Fase 3A).
 * Propiedad: agent-pricing.
 * Se usa cuando READ_MODEL_SOURCE=fixture (modo demo).
 */
import type {
  AuthenticatedViewer,
  ProviderView,
  ProviderCreateInput,
  ProviderUpdateInput,
  ResourcePriceObservationView,
  ResourcePriceHistoryRow,
  CreateObservationInput,
  ApproveObservationInput,
  RejectObservationInput,
  ResourcePriceIntelligenceSummary,
  ProviderRepository,
  PriceObservationRepository,
  Uuid,
} from './types';
import {
  ProviderNotFoundError,
  ObservationNotFoundError,
  ObservationAlreadyReviewedError,
  PriceIntelligenceWriteNotSupportedError,
} from './errors';
import { computeIsStale } from './validation';

// ---------------------------------------------------------------------------
// Static demo data
// ---------------------------------------------------------------------------

const DEMO_ORG = '00000000-0000-0000-0000-0000000000a1';
const DEMO_RESOURCE_1 = '00000000-0000-0000-0000-0000000000e1';

const DEMO_PROVIDERS: ProviderView[] = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    name: 'Homecenter Demo',
    supplierType: 'vendor',
    websiteUrl: 'https://www.homecenter.com.co',
    defaultDiscountPercent: '8',
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    name: 'Distribuidora Cemex Demo',
    supplierType: 'distributor',
    websiteUrl: null,
    defaultDiscountPercent: '5',
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const DEMO_OBSERVATIONS: ResourcePriceObservationView[] = [
  {
    id: '00000000-0000-0000-0000-000000001001',
    resourceId: DEMO_RESOURCE_1,
    supplierId: '00000000-0000-0000-0000-000000000101',
    supplierName: 'Homecenter Demo',
    observedPrice: '28000.0000000000',
    discountPercent: '8.0000',
    suggestedNetPrice: '25760.0000000000',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'manual',
    sourceReference: 'Cotización presencial',
    observedAt: '2026-06-01T10:00:00-05:00',
    validUntil: null,
    status: 'approved',
    isStale: computeIsStale('approved', '2026-06-02T09:00:00-05:00', null),
    notes: null,
    createdAt: '2026-06-01T11:00:00-05:00',
    approvedAt: '2026-06-02T09:00:00-05:00',
    rejectionReason: null,
  },
  {
    id: '00000000-0000-0000-0000-000000001002',
    resourceId: DEMO_RESOURCE_1,
    supplierId: '00000000-0000-0000-0000-000000000102',
    supplierName: 'Distribuidora Cemex Demo',
    observedPrice: '29500.0000000000',
    discountPercent: '5.0000',
    suggestedNetPrice: '28025.0000000000',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'quotation',
    sourceReference: 'Cotización #Q-2026-0042',
    observedAt: '2026-06-05T14:30:00-05:00',
    validUntil: '2026-07-05T23:59:59-05:00',
    status: 'pending',
    isStale: false,
    notes: null,
    createdAt: '2026-06-05T15:00:00-05:00',
    approvedAt: null,
    rejectionReason: null,
  },
];

const DEMO_HISTORY: ResourcePriceHistoryRow[] = [
  {
    id: '00000000-0000-0000-0000-000000001006',
    resourceId: DEMO_RESOURCE_1,
    supplierId: null,
    supplierName: null,
    observedPrice: '30500.0000000000',
    discountPercent: '0.0000',
    suggestedNetPrice: '30500.0000000000',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'manual',
    sourceReference: null,
    observedAt: '2026-06-18T10:00:00-05:00',
    validUntil: '2026-06-19T10:00:00-05:00',
    status: 'expired',
    approvedAt: null,
    rejectionReason: null,
    notes: null,
    importBatchId: null,
    importBatchLabel: null,
    importBatchSourceReference: null,
    monitorResultId: null,
    monitorResultStatus: null,
    monitorCheckedAt: null,
    monitorWarnings: [],
    previousApprovedPrice: '29500.0000000000',
    deltaAbs: '1000.00',
    deltaPct: '3.39',
    origin: 'manual',
  },
  {
    id: '00000000-0000-0000-0000-000000001005',
    resourceId: DEMO_RESOURCE_1,
    supplierId: '00000000-0000-0000-0000-000000000102',
    supplierName: 'Distribuidora Cemex Demo',
    observedPrice: '31000.0000000000',
    discountPercent: '5.0000',
    suggestedNetPrice: '29450.0000000000',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'quotation',
    sourceReference: 'Cotizacion rechazada',
    observedAt: '2026-06-14T10:00:00-05:00',
    validUntil: null,
    status: 'rejected',
    approvedAt: '2026-06-14T11:00:00-05:00',
    rejectionReason: null,
    notes: 'Precio no comparable por flete.',
    importBatchId: null,
    importBatchLabel: null,
    importBatchSourceReference: null,
    monitorResultId: null,
    monitorResultStatus: null,
    monitorCheckedAt: null,
    monitorWarnings: [],
    previousApprovedPrice: '29500.0000000000',
    deltaAbs: '-50.00',
    deltaPct: '-0.17',
    origin: 'manual',
  },
  {
    id: '00000000-0000-0000-0000-000000001004',
    resourceId: DEMO_RESOURCE_1,
    supplierId: '00000000-0000-0000-0000-000000000101',
    supplierName: 'Homecenter Demo',
    observedPrice: '32065.2173913043',
    discountPercent: '8.0000',
    suggestedNetPrice: '29500.0000000000',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'public_web',
    sourceReference: 'https://example.test/cemento-monitor',
    observedAt: '2026-06-10T10:00:00-05:00',
    validUntil: null,
    status: 'approved',
    approvedAt: '2026-06-10T12:00:00-05:00',
    rejectionReason: null,
    notes: null,
    importBatchId: null,
    importBatchLabel: null,
    importBatchSourceReference: null,
    monitorResultId: '00000000-0000-0000-0000-000000002302',
    monitorResultStatus: 'pending_created',
    monitorCheckedAt: '2026-06-10T10:03:00-05:00',
    monitorWarnings: ['price_changed'],
    previousApprovedPrice: '25760.0000000000',
    deltaAbs: '3740.00',
    deltaPct: '14.52',
    origin: 'monitor',
  },
  {
    id: '00000000-0000-0000-0000-000000001003',
    resourceId: DEMO_RESOURCE_1,
    supplierId: '00000000-0000-0000-0000-000000000102',
    supplierName: 'Distribuidora Cemex Demo',
    observedPrice: '29500.0000000000',
    discountPercent: '5.0000',
    suggestedNetPrice: '28025.0000000000',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'supplier_csv',
    sourceReference: 'lista-junio.csv',
    observedAt: '2026-06-05T14:30:00-05:00',
    validUntil: '2026-07-05T23:59:59-05:00',
    status: 'pending',
    approvedAt: null,
    rejectionReason: null,
    notes: null,
    importBatchId: '00000000-0000-0000-0000-00000000b001',
    importBatchLabel: 'Lista junio Cemex',
    importBatchSourceReference: 'lista-junio.csv',
    monitorResultId: null,
    monitorResultStatus: null,
    monitorCheckedAt: null,
    monitorWarnings: [],
    previousApprovedPrice: '25760.0000000000',
    deltaAbs: '2265.00',
    deltaPct: '8.79',
    origin: 'batch',
  },
  {
    id: '00000000-0000-0000-0000-000000001001',
    resourceId: DEMO_RESOURCE_1,
    supplierId: '00000000-0000-0000-0000-000000000101',
    supplierName: 'Homecenter Demo',
    observedPrice: '28000.0000000000',
    discountPercent: '8.0000',
    suggestedNetPrice: '25760.0000000000',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'manual',
    sourceReference: 'Cotizacion presencial',
    observedAt: '2026-06-01T10:00:00-05:00',
    validUntil: null,
    status: 'approved',
    approvedAt: '2026-06-02T09:00:00-05:00',
    rejectionReason: null,
    notes: null,
    importBatchId: null,
    importBatchLabel: null,
    importBatchSourceReference: null,
    monitorResultId: null,
    monitorResultStatus: null,
    monitorCheckedAt: null,
    monitorWarnings: [],
    previousApprovedPrice: null,
    deltaAbs: null,
    deltaPct: null,
    origin: 'manual',
  },
];
// ---------------------------------------------------------------------------
// FixtureProviderRepository
// ---------------------------------------------------------------------------

export class FixtureProviderRepository implements ProviderRepository {
  readonly source = 'fixture' as const;

  async listProviders(viewer: AuthenticatedViewer): Promise<ProviderView[]> {
    if (viewer.organizationId !== DEMO_ORG) return [];
    return [...DEMO_PROVIDERS];
  }

  async createProvider(
    _viewer: AuthenticatedViewer,
    _input: ProviderCreateInput,
  ): Promise<ProviderView> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async updateProvider(
    _viewer: AuthenticatedViewer,
    _providerId: Uuid,
    _input: ProviderUpdateInput,
  ): Promise<ProviderView> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async getProviderById(_viewer: AuthenticatedViewer, providerId: Uuid): Promise<ProviderView> {
    const found = DEMO_PROVIDERS.find((p) => p.id === providerId);
    if (!found) throw new ProviderNotFoundError(providerId);
    return { ...found };
  }
}

// ---------------------------------------------------------------------------
// FixtureObservationRepository
// ---------------------------------------------------------------------------

export class FixtureObservationRepository implements PriceObservationRepository {
  readonly source = 'fixture' as const;

  async listResourcePriceObservations(
    _viewer: AuthenticatedViewer,
    resourceId: Uuid,
  ): Promise<ResourcePriceObservationView[]> {
    return DEMO_OBSERVATIONS.filter((o) => o.resourceId === resourceId);
  }

  async listResourcePriceHistory(
    viewer: AuthenticatedViewer,
    resourceId: Uuid,
    limit: number,
  ): Promise<ResourcePriceHistoryRow[]> {
    if (viewer.organizationId !== DEMO_ORG) return [];
    return DEMO_HISTORY.filter((o) => o.resourceId === resourceId).slice(0, limit);
  }
  async countPendingResourcePriceObservations(viewer: AuthenticatedViewer): Promise<number> {
    if (viewer.organizationId !== DEMO_ORG) return 0;
    return DEMO_OBSERVATIONS.filter((o) => o.status === 'pending').length;
  }

  async createResourcePriceObservation(
    _viewer: AuthenticatedViewer,
    _input: CreateObservationInput,
  ): Promise<ResourcePriceObservationView> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async approveResourcePriceObservation(
    _viewer: AuthenticatedViewer,
    input: ApproveObservationInput,
  ): Promise<ResourcePriceObservationView> {
    const obs = DEMO_OBSERVATIONS.find((o) => o.id === input.observationId);
    if (!obs) throw new ObservationNotFoundError(input.observationId);
    if (obs.status !== 'pending') throw new ObservationAlreadyReviewedError(input.observationId, obs.status);
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async rejectResourcePriceObservation(
    _viewer: AuthenticatedViewer,
    input: RejectObservationInput,
  ): Promise<ResourcePriceObservationView> {
    const obs = DEMO_OBSERVATIONS.find((o) => o.id === input.observationId);
    if (!obs) throw new ObservationNotFoundError(input.observationId);
    if (obs.status !== 'pending') throw new ObservationAlreadyReviewedError(input.observationId, obs.status);
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async getResourcePriceIntelligenceSummary(
    _viewer: AuthenticatedViewer,
    resourceId: Uuid,
  ): Promise<ResourcePriceIntelligenceSummary | null> {
    if (resourceId !== DEMO_RESOURCE_1) return null;
    const obs = DEMO_OBSERVATIONS.filter((o) => o.resourceId === resourceId);
    const approved = obs.filter((o) => o.status === 'approved');
    const latest = approved.at(0);
    return {
      resourceId,
      resourceCode: 'MAT-001',
      resourceName: 'Cemento gris 50kg',
      resourceUnit: 'saco',
      approvedCount: approved.length,
      pendingCount: obs.filter((o) => o.status === 'pending').length,
      latestApprovedPrice: latest?.observedPrice ?? null,
      latestApprovedAt: latest?.approvedAt ?? null,
      latestApprovedIsStale: latest?.isStale ?? false,
    };
  }
}
