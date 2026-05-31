/**
 * DTOs canónicos del Read Model — contrato congelado v1 (Oleada 3A).
 * Fuente: docs/READ_MODEL_CONTRACT.md
 *
 * PROPIETARIO DE ESTE ARCHIVO: agent-db-rls (implementación server-side).
 * agent-dashboard CREA esta copia temporal para compilar en paralelo.
 * El orquestador deduplica en integración; la versión canónica es la de db-rls.
 *
 * NO inventar campos. NO modificar sin INTEGRATION_REQUESTS.
 */

import type { Uuid, IsoDateTime, DecimalString, EstimateVersionStatus } from '@/lib/utils/types';

// Re-export base types for consumers of this module
export type { Uuid, IsoDateTime, DecimalString, EstimateVersionStatus };

// ---------------------------------------------------------------------------
// ViewerContext — resuelto server-side
// ---------------------------------------------------------------------------

export type ViewerRole = 'client' | 'management' | 'site' | 'internal';

export interface ViewerContext {
  organizationId: Uuid;
  profileId?: Uuid;
  role: ViewerRole;
}

// ---------------------------------------------------------------------------
// DTOs canónicos
// ---------------------------------------------------------------------------

import type { ProjectStatus, ScopeType, ResourceType } from '@/lib/utils/types';

export interface ProjectListItem {
  id: Uuid;
  name: string;
  status: ProjectStatus;
  location?: string | null;
  createdAt: IsoDateTime;
  scopeCount: number;
  estimateCount: number;
}

export interface ProjectOverview {
  project: ProjectListItem;
  scopes: { id: Uuid; code: string; name: string; scopeType: ScopeType }[];
  currentEstimateVersion?: EstimateSummary;
  budgetSummary: EstimateSummary;
  progressSummary?: ProgressSummary;
}

export interface EstimateSummary {
  estimateId: Uuid;
  versionId: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  directCost: DecimalString;
  administration: DecimalString;
  contingency: DecimalString;
  utility: DecimalString;
  taxOnUtility: DecimalString;
  grandTotal: DecimalString;
  totalArea?: DecimalString;
  costPerSquareMeter?: DecimalString;
}

export interface ChapterSummary {
  id: Uuid;
  code: string;
  name: string;
  subtotal: DecimalString;
  itemCount: number;
}

export interface BoqItemView {
  id: Uuid;
  chapterId: Uuid;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  subtotal: DecimalString;
}

export interface ApuSummary {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  unitCost: DecimalString;
  componentCount: number;
}

export interface QuantityLineView {
  id: Uuid;
  description: string;
  calculatedQuantity: DecimalString;
}

export interface QuantityGroupView {
  id: Uuid;
  name: string;
  lines: QuantityLineView[];
}

export interface CatalogResourceView {
  id: Uuid;
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
  budgetReferencePrice?: DecimalString;
}

export interface ChapterDistributionSlice {
  chapterId: Uuid;
  code: string;
  name: string;
  subtotal: DecimalString;
  share: DecimalString;
}

export interface DashboardSummary {
  projectId: Uuid;
  budget: DecimalString;
  directCost: DecimalString;
  indirectCost: DecimalString;
  chapterDistribution: ChapterDistributionSlice[];
  topChapters: ChapterSummary[];
  estimateStatus: EstimateVersionStatus;
  lastUpdatedAt: IsoDateTime;
  // 🔒 solo para roles autorizados (omitidos para `client`):
  projectedSaving?: DecimalString;
  realizedSaving?: DecimalString;
  pricingCoverage?: DecimalString;
}

export interface ProgressSummary {
  physicalProgress?: DecimalString;
  financialProgress?: DecimalString;
}

// ---------------------------------------------------------------------------
// ReadModelPort — interfaz canónica
// ---------------------------------------------------------------------------

export interface ReadModelPort {
  listProjects(viewer: ViewerContext): Promise<ProjectListItem[]>;
  getProjectOverview(viewer: ViewerContext, projectId: Uuid): Promise<ProjectOverview>;
  listEstimates(viewer: ViewerContext, projectId?: Uuid): Promise<EstimateSummary[]>;
  getEstimateDetail(
    viewer: ViewerContext,
    estimateVersionId: Uuid,
  ): Promise<{ estimate: EstimateSummary; chapters: ChapterSummary[]; items: BoqItemView[] }>;
  listApus(viewer: ViewerContext): Promise<ApuSummary[]>;
  listQuantities(viewer: ViewerContext, projectScopeId?: Uuid): Promise<QuantityGroupView[]>;
  listCatalogResources(viewer: ViewerContext): Promise<CatalogResourceView[]>;
  getDashboardSummary(viewer: ViewerContext, projectId: Uuid): Promise<DashboardSummary>;
}
