/**
 * READ_MODEL_CONTRACT v1 — DTOs del read-model de presupuesto.
 *
 * TEMPORAL Oleada 3A: este archivo fue creado por agent-frontend-boq para
 * compilar mientras db-rls implementa @/server/read-model en paralelo.
 * El orquestador deduplicará en integración; la versión canónica es la de db-rls.
 *
 * NO modificar la forma de los DTOs sin aprobación del orquestador.
 * Dinero: DecimalString. IDs: Uuid. Fechas: IsoDateTime.
 */

import type { Uuid, IsoDateTime, DecimalString } from '@/lib/utils/types';

// ---------------------------------------------------------------------------
// DTOs del read-model
// ---------------------------------------------------------------------------

/** Ítem resumen de proyecto para listados. */
export interface ProjectListItem {
  id: Uuid;
  code: string;
  name: string;
  status: 'active' | 'archived' | 'closed';
  location?: string | null;
  startDate?: string | null;
  estimatedEndDate?: string | null;
  /** Alcances raíz asociados (nombre). */
  scopeNames: string[];
}

/** Detalle de un proyecto con sus alcances. */
export interface ProjectOverview {
  id: Uuid;
  code: string;
  name: string;
  status: 'active' | 'archived' | 'closed';
  location?: string | null;
  startDate?: string | null;
  estimatedEndDate?: string | null;
  scopes: {
    id: Uuid;
    code: string;
    name: string;
    scopeType: string;
    parentScopeId?: Uuid | null;
  }[];
}

/** Resumen financiero de una versión de estimado. */
export interface EstimateSummary {
  id: Uuid;
  estimateId: Uuid;
  versionNumber: number;
  status: string;
  notes?: string | null;
  approvedAt?: IsoDateTime | null;
  /** Costos directos totales. */
  directCost: DecimalString;
  /** Administración (A). */
  administration: DecimalString;
  /** Imprevistos (I). */
  contingency: DecimalString;
  /** Utilidad contractual (U). */
  utility: DecimalString;
  /** IVA sobre utilidad. */
  taxOnUtility: DecimalString;
  /** Total presupuesto = directCost + indirectos. */
  grandTotal: DecimalString;
  /** Área construida (opcional). */
  totalArea?: DecimalString | null;
  /** Valor por m² (opcional). */
  costPerSquareMeter?: DecimalString | null;
}

/** Resumen de un capítulo del BOQ. */
export interface ChapterSummary {
  id: Uuid;
  code: string;
  name: string;
  /** Suma de subtotales de ítems del capítulo. */
  subtotal: DecimalString;
  itemCount: number;
}

/** Vista de un ítem BOQ (fila de presupuesto). */
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

/** Resumen de una plantilla APU. */
export interface ApuSummary {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  unitCost: DecimalString;
  componentCount: number;
}

/** Vista de un grupo de cantidades con sus líneas. */
export interface QuantityGroupView {
  id: Uuid;
  name: string;
  unit: string;
  calculationMode: string;
  lines: {
    id: Uuid;
    description?: string | null;
    calculatedQuantity: DecimalString;
  }[];
}

/** Vista de un recurso del catálogo. */
export interface CatalogResourceView {
  id: Uuid;
  code: string;
  name: string;
  resourceType: string;
  unit: string;
  /** Precio de referencia presupuestal (cliente-safe). Omitido si no hay precio aprobado. */
  budgetReferencePrice?: DecimalString | null;
}

// ---------------------------------------------------------------------------
// Puerto del read-model
// ---------------------------------------------------------------------------

export interface ReadModelPort {
  /** Lista resumida de proyectos de la organización. */
  listProjects(): Promise<ProjectListItem[]>;

  /** Detalle de un proyecto con sus alcances. */
  getProjectOverview(projectId: Uuid): Promise<ProjectOverview | null>;

  /** Resúmenes de versiones de estimado asociadas a un alcance. */
  listEstimates(projectScopeId: Uuid): Promise<EstimateSummary[]>;

  /** Detalle de una versión: capítulos, ítems BOQ e ítems de una versión. */
  getEstimateDetail(
    estimateVersionId: Uuid
  ): Promise<{ chapters: ChapterSummary[]; items: BoqItemView[] } | null>;

  /** Lista de APUs del catálogo de la organización. */
  listApus(): Promise<ApuSummary[]>;

  /** Lista de grupos de cantidades de un alcance. */
  listQuantities(projectScopeId: Uuid): Promise<QuantityGroupView[]>;

  /** Lista de recursos del catálogo (cliente-safe). */
  listCatalogResources(): Promise<CatalogResourceView[]>;
}
