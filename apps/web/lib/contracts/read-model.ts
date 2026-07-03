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
  ApuComponentType,
  DecimalString,
  EstimateVersionStatus,
  IsoDate,
  IsoDateTime,
  ProjectStatus,
  ResourceType,
  ScopeType,
  Uuid,
} from '@/lib/utils/types';

export type {
  ApuComponentType,
  DecimalString,
  EstimateVersionStatus,
  IsoDate,
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
 * Alcance de proyectos del viewer (V5.6.4 CLIENT_PROJECT_SCOPE).
 *  - `'all'`  → sin restricción por proyecto (roles internos, demo, o un
 *    interno exportando con proyección client).
 *  - `Uuid[]` → SOLO esos proyectos (usuarios `consulta` → ViewerRole client).
 * SOLO se interpreta cuando `role === 'client'`; para el resto se ignora.
 */
export type ProjectGrants = 'all' | readonly Uuid[];

/**
 * Contexto del visualizador. Se resuelve SIEMPRE server-side. En preview local
 * puede existir un contexto demo explícito (NO es autenticación productiva). En
 * modo `db`, RLS sigue siendo la barrera real de aislamiento por organización.
 *
 * `projectGrants` (V5.6.4): deny-by-default para `client` — si falta o es una
 * lista vacía, un viewer `client` NO ve ningún proyecto (fail-closed). Se
 * resuelve server-side desde `project_access_grants`; jamás del navegador.
 */
export interface ViewerContext {
  organizationId: Uuid;
  profileId?: Uuid;
  role: ViewerRole;
  projectGrants?: ProjectGrants;
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
  /** APU_QUOTE_READINESS_INTEGRATION_V2: plantilla APU vinculada (boq_items.apu_template_id),
   * o null si el ítem no está vinculado a un APU. Aditivo, opcional. */
  apuTemplateId?: Uuid | null;
}

export interface ApuSummary {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  unitCost: DecimalString;
  componentCount: number;
  /** Origen del APU: 'manual' | 'workbook_import'. Nullable por compat retroactiva. */
  originType?: string;
  /** Fecha de archivo ISO si está archivado; null/undefined si activo (READ_MODEL_ARCHIVED_AT). */
  archivedAt?: string | null;
  /** APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1: conteo de componentes por tipo (biblioteca). */
  typeCounts?: Record<ApuComponentType, number>;
  /** Materiales con precio ausente o ≤ 0 (señal de completitud). */
  materialsWithoutPrice?: number;
}

/* --- APU detalle (FASE 4B.1 — APU_COST_MODEL_FOUNDATION_V1_CONTRACT §10) --- */

export interface ApuComponentView {
  id: Uuid;
  componentType: ApuComponentType;
  resourceCode?: string;
  resourceName?: string;
  // 🔒 omitidos para `client` (información de M.O. interna):
  /** 🔒 código del rol salarial vinculado (trazabilidad labor_role_id). */
  laborRoleCode?: string;
  /** 🔒 nombre del rol salarial vinculado. */
  laborRoleName?: string;
  /** Rendimiento/consumo por unidad de actividad del APU. */
  quantity: DecimalString;
  /** Desperdicio como fracción (p. ej. "0.08"). Valor APLICADO (efectivo). */
  wastePct: DecimalString;
  /** APU_SMART_DEFAULTS_V1B: desperdicio recomendado. Ausente ⇒ recommended = wastePct. */
  wastePctRecommended?: DecimalString | null;
  /** Origen del valor de desperdicio: 'recommended' | 'manual' | 'excel'. */
  wastePctSource?: string | null;
  /** 🔒 Justificación interna del ajuste (NO a rol client). */
  wastePctNote?: string | null;
  /* APU_PRODUCTIVITY_CREW_OVERRIDES_V1B — metadata read-only de rendimiento/cuadrilla
   * (filas labor). Opcionales: el repositorio NO las pobla todavía (edición en V1C).
   * NULL/ausente ⇒ heredado; `quantity` sigue siendo la verdad efectiva. */
  /** Consumo laboral recomendado congelado (persona·día/unidad). */
  recommendedLaborQuantity?: DecimalString | null;
  /** Rendimiento recomendado (unidades/día de cuadrilla), si derivable. */
  recommendedProductivity?: DecimalString | null;
  /** Rendimiento aplicado por el experto. */
  appliedProductivity?: DecimalString | null;
  /** Unidad del rendimiento: 'person_day_per_unit' | 'unit_per_crew_day'. */
  productivityUnit?: string | null;
  /** Tamaño de cuadrilla recomendado (personas). */
  recommendedCrewSize?: DecimalString | null;
  /** Tamaño de cuadrilla aplicado (personas). */
  appliedCrewSize?: DecimalString | null;
  /** Origen del valor de rendimiento: 'manual' | 'reset' | null (heredado). */
  productivitySource?: string | null;
  /** 🔒 Justificación interna del ajuste de rendimiento (NO a rol client). */
  productivityNote?: string | null;
  /* APU_MATERIAL_CONSUMPTION_OVERRIDES_V1 — metadata read-only del consumo material
   * (filas material). NULL/ausente ⇒ heredado; `quantity` sigue siendo la verdad. */
  /** Consumo unitario recomendado congelado (material). */
  recommendedMaterialQuantity?: DecimalString | null;
  /** Origen del consumo: 'manual' | 'reset' | 'imported' | 'suggested' | null. */
  materialQuantitySource?: string | null;
  /** 🔒 Justificación interna del ajuste de consumo (NO a rol client). */
  materialQuantityNote?: string | null;
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
  sortOrder: number;
}

export interface ApuDetail {
  id: Uuid;
  code: string;
  name: string;
  /** Unidad RAW tal como fue capturada (preservada; nunca se altera). */
  unit: string;
  /** Unidad canónica para mostrar/comparar (m2/M2/m² → m²). */
  unitCanonical: string;
  version: number;
  /** Fracción [0,1] de herramienta menor derivada sobre la M.O. */
  defaultToolPct: DecimalString;
  components: ApuComponentView[];
  unitCostMaterials: DecimalString;
  unitCostLabor: DecimalString;
  unitCostEquipment: DecimalString;
  /** Herramienta explícita + derivada (defaultToolPct × unitCostLabor). */
  unitCostTools: DecimalString;
  /** Solo la herramienta derivada. */
  unitCostToolDerived: DecimalString;
  unitCostSubcontract: DecimalString;
  unitCostOther: DecimalString;
  unitCostTotal: DecimalString;
  /** Origen del APU: 'manual' | 'workbook_import'. Nullable para compatibilidad retroactiva. */
  originType?: string;
  /** Fecha de archivo ISO si está archivado; null/undefined si activo. */
  archivedAt?: string | null;
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

/** Línea del workspace de cantidades (creación manual, editable). */
export interface WorkspaceLineView {
  id: Uuid;
  description: string;
  formulaType: string;
  resultUnit: string;
  resultGross: DecimalString;
  resultNet: DecimalString;
  apuTemplateId: Uuid | null;
  boqItemId: Uuid | null;
}

/** Grupo del workspace de cantidades (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1). */
export interface WorkspaceGroupView {
  id: Uuid;
  code: string;
  name: string;
  floor: string | null;
  module: string | null;
  space: string | null;
  element: string | null;
  resultUnit: string;
  templateKind: string;
  totalNet: DecimalString;
  lines: WorkspaceLineView[];
}

export interface CatalogResourceView {
  id: Uuid;
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
  /** ✅ precio presupuestado (no público). Omitido si no hay precio aprobado. */
  budgetReferencePrice?: DecimalString;
  /** Estado de precio para visibilidad de catálogo (CATALOG_PRICE_VISIBILITY_V1). */
  priceStatus?: 'approved' | 'pending' | 'rejected' | 'none';
  /** ✅ último precio aprobado (= budgetReferencePrice). */
  approvedPrice?: DecimalString;
  /** Último precio pendiente (si no hay aprobado). No es un descuento. */
  pendingPrice?: DecimalString;
  /** Proveedor del precio mostrado. Solo roles internos (management/internal). */
  supplierName?: string;
  /** Fecha ISO de la observación mostrada. */
  priceDate?: string;
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
 * 2.b DTOs de PLANIFICACIÓN (Oleada 3B — PLANNING_CONTRACT §3)
 *
 * Extienden el read-model sin romper v1. Reglas idénticas: dinero/porcentajes/
 * duraciones como `DecimalString`; fechas ISO. La proyección por rol OMITE los
 * campos 🔒 (holguras/ruta crítica/avance financiero/`externalReference`/
 * responsables/notas) para rol `client`. La ruta crítica/holguras se calculan
 * server-side con `apps/web/modules/planning/` (cero cálculo en React).
 * ------------------------------------------------------------------------- */

/** Estado de una tarea del cronograma. */
export type ScheduleTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled';

/** Tipo de dependencia entre tareas (MS Project: FS/SS/FF/SF). */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface ScheduleTaskView {
  id: Uuid;
  wbsCode: string;
  name: string;
  parentTaskId?: Uuid | null;
  plannedStart: IsoDate;
  plannedEnd: IsoDate;
  plannedDurationDays: DecimalString;
  progressPct: DecimalString;
  status: ScheduleTaskStatus;
  isMilestone: boolean;
  sortOrder: number;
  // 🔒 omitidos para `client` (holguras/ruta crítica/avance financiero):
  /** 🔒 holgura total (días) — solo roles autorizados. */
  totalFloatDays?: DecimalString;
  /** 🔒 holgura libre (días) — solo roles autorizados. */
  freeFloatDays?: DecimalString;
  /** 🔒 pertenece a la ruta crítica — solo roles autorizados. */
  isCritical?: boolean;
}

export interface DependencyView {
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: DependencyType;
  lagDays: DecimalString;
}

export interface MilestoneView {
  id: Uuid;
  name: string;
  date: IsoDate;
  status: ScheduleTaskStatus;
}

export interface ProgressEntryView {
  id: Uuid;
  taskId: Uuid;
  recordedAt: IsoDateTime;
  physicalProgressPct: DecimalString;
  // 🔒 omitidos para `client`:
  /** 🔒 avance financiero derivado server-side. */
  financialProgressPct?: DecimalString | null;
  /** 🔒 observaciones privadas. */
  notes?: string | null;
}

export interface ResourceAssignmentView {
  id: Uuid;
  taskId: Uuid;
  resourceName?: string | null;
  laborRoleName?: string | null;
  quantity?: DecimalString | null;
  unit?: string | null;
  // 🔒 notas internas omitidas para `client`:
  notes?: string | null;
}

/** Resumen de ruta crítica (🔒 management/internal/site). */
export interface CriticalPathSummary {
  criticalTaskIds: Uuid[];
  projectStart: IsoDate;
  projectEnd: IsoDate;
  durationDays: DecimalString;
}

export interface ScheduleSummary {
  projectId: Uuid;
  tasks: ScheduleTaskView[];
  dependencies: DependencyView[];
  milestones: MilestoneView[];
  physicalProgressPct: DecimalString;
  /** 🔒 ruta crítica/holguras (omitida para `client`; opcional hasta cablear el dominio en integración). */
  criticalPath?: CriticalPathSummary;
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
  /** Detalle de un APU con componentes y desglose por tipo (rol 🔒 proyectado). */
  getApuDetail(viewer: ViewerContext, apuTemplateId: Uuid): Promise<ApuDetail>;
  listQuantities(viewer: ViewerContext, projectScopeId?: Uuid): Promise<QuantityGroupView[]>;
  listWorkspaceGroups(viewer: ViewerContext, projectScopeId?: Uuid): Promise<WorkspaceGroupView[]>;
  listCatalogResources(viewer: ViewerContext): Promise<CatalogResourceView[]>;
  getDashboardSummary(viewer: ViewerContext, projectId: Uuid): Promise<DashboardSummary>;

  /* --- Planificación (Oleada 3B — PLANNING_CONTRACT §3) --- */
  /** Cronograma proyectado por rol (tareas/dependencias/hitos; ruta crítica 🔒). */
  getSchedule(viewer: ViewerContext, projectId: Uuid): Promise<ScheduleSummary>;
  /** Histórico de avance físico (append-only) de un proyecto o una tarea. */
  listProgressEntries(
    viewer: ViewerContext,
    projectId: Uuid,
    taskId?: Uuid,
  ): Promise<ProgressEntryView[]>;
  /** Asignaciones de recursos/mano de obra de un proyecto o una tarea. */
  listResourceAssignments(
    viewer: ViewerContext,
    projectId: Uuid,
    taskId?: Uuid,
  ): Promise<ResourceAssignmentView[]>;
}
