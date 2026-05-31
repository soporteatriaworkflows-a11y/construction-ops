/**
 * read-model.ts — FUENTE ÚNICA DE CÓDIGO del contrato del read-model (Oleada 3A).
 *
 * Refleja EXACTAMENTE el contrato congelado `docs/READ_MODEL_CONTRACT.md` (v1).
 * Es la única definición de los DTOs y del puerto `ReadModelPort` que alimentan
 * las pantallas:
 *   - `agent-db-rls` IMPLEMENTA el puerto en `apps/web/server/read-model/`.
 *   - `agent-frontend-boq` y `agent-dashboard` CONSUMEN sólo estos DTOs (nunca
 *     consultan tablas ni recalculan finanzas).
 *
 * Cambios al contrato pasan por `docs/INTEGRATION_REQUESTS.md` (orchestrator) y
 * se reflejan en `docs/READ_MODEL_CONTRACT.md` + `docs/API_CONTRACTS.md`.
 *
 * REGLAS:
 *  - Dinero/cantidades/porcentajes viajan como `DecimalString` (string decimal),
 *    NUNCA `number`. La UI sólo formatea para mostrar; no opera finanzas.
 *  - IDs `Uuid` (string); fechas `IsoDateTime`/`IsoDate`.
 *  - Los totales financieros provienen de cost-domain (server-side); el
 *    read-model NO reimplementa fórmulas.
 *  - Proyección por rol: los campos 🔒 se OMITEN antes de serializar a rol
 *    `client` (privacidad backend-first). No basta ocultarlos en UI.
 */

import type {
  DecimalString,
  EstimateVersionStatus,
  IsoDateTime,
  ProjectStatus,
  ResourceType,
  ScopeType,
  Uuid,
} from '@/lib/utils/types';

export type {
  DecimalString,
  EstimateVersionStatus,
  IsoDateTime,
  ProjectStatus,
  ResourceType,
  ScopeType,
  Uuid,
} from '@/lib/utils/types';

/* ----------------------------------------------------------------------------
 * 1. Contexto de visualización y privacidad (READ_MODEL_CONTRACT §3)
 * ------------------------------------------------------------------------- */

/**
 * Rol del consumidor del read-model. `client` recibe SOLO campos cliente-safe;
 * `management`/`internal` reciben los campos 🔒 (ahorros, cobertura de precios);
 * `site` es un rol operativo (sin campos financieros internos por defecto).
 */
export type ViewerRole = 'client' | 'management' | 'site' | 'internal';

/**
 * Contexto del visualizador. Se resuelve SIEMPRE server-side. En preview local
 * puede existir un contexto demo explícito (NO es autenticación productiva). En
 * modo `db`, RLS sigue siendo la barrera real de aislamiento por organización.
 */
export interface ViewerContext {
  organizationId: Uuid;
  profileId?: Uuid;
  role: ViewerRole;
}

/* ----------------------------------------------------------------------------
 * 2. DTOs canónicos (READ_MODEL_CONTRACT §4)
 * ------------------------------------------------------------------------- */

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
  /** Resumen de la versión vigente (si existe). */
  currentEstimateVersion?: EstimateSummary;
  /** Totales del presupuesto vigente. */
  budgetSummary: EstimateSummary;
  /** Opcional (Oleada 3B); puede omitirse en 3A. */
  progressSummary?: ProgressSummary;
}

export interface EstimateSummary {
  estimateId: Uuid;
  versionId: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  directCost: DecimalString;
  administration: DecimalString;
  /** imprevistos */
  contingency: DecimalString;
  utility: DecimalString;
  /** IVA sobre utilidad */
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
  /** descriptionSnapshot */
  description: string;
  /** unitSnapshot */
  unit: string;
  /** quantitySnapshot */
  quantity: DecimalString;
  /** unitPriceSnapshot (precio presupuestado, ✅) */
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
  /** ✅ precio presupuestado (no público). Omitido si no hay precio aprobado. */
  budgetReferencePrice?: DecimalString;
}

export interface ChapterDistributionSlice {
  chapterId: Uuid;
  code: string;
  name: string;
  subtotal: DecimalString;
  /** fracción del costo directo (DecimalString) */
  share: DecimalString;
}

export interface DashboardSummary {
  projectId: Uuid;
  /** grandTotal */
  budget: DecimalString;
  directCost: DecimalString;
  indirectCost: DecimalString;
  chapterDistribution: ChapterDistributionSlice[];
  topChapters: ChapterSummary[];
  estimateStatus: EstimateVersionStatus;
  lastUpdatedAt: IsoDateTime;
  // 🔒 solo para roles autorizados (management/internal); omitidos para `client`:
  /** 🔒 ahorro proyectado */
  projectedSaving?: DecimalString;
  /** 🔒 ahorro realizado */
  realizedSaving?: DecimalString;
  /** 🔒 fracción de ítems con precio aprobado */
  pricingCoverage?: DecimalString;
}

/** Opcional (placeholder 3A; se detalla en Oleada 3B). */
export interface ProgressSummary {
  physicalProgress?: DecimalString;
  financialProgress?: DecimalString;
}

/* ----------------------------------------------------------------------------
 * 3. Puerto canónico (READ_MODEL_CONTRACT §5)
 * ------------------------------------------------------------------------- */

/**
 * Única capa server-side que alimenta las pantallas. Dos implementaciones
 * explícitas (`FixtureReadModelRepository` / `DrizzleReadModelRepository`)
 * seleccionadas por `READ_MODEL_SOURCE`. La UI consume estos DTOs; no consulta
 * tablas ni recalcula finanzas. Toda respuesta aplica la proyección por rol.
 */
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
