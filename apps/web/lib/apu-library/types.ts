/**
 * types.ts — Contrato de la biblioteca APU compacta
 * (APU_LIBRARY_OPERATIONAL_UX_V1). Tipos puros consumidos por la UI.
 */
import type { ApuComponentType, DecimalString, Uuid } from '@/lib/utils/types';
import type { ApuCategory } from './category';

/** Estado agregado de recursos de un APU (componentes no-labor). */
export interface ApuResourceStatus {
  total: number;
  associated: number;
  pending: number; // exact_match + suggested + unresolved + ambiguous
  suggested: number;
  unresolved: number;
  ambiguous: number;
  intentionallyUnresolved: number;
}

/** Fila compacta de la biblioteca APU. */
export interface ApuLibraryItem {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  componentCount: number;
  unitCost: DecimalString;
  boqLinked: boolean;
  origin: string; // nombre del lote de importación o 'Manual'
  importBatchId: Uuid | null;
  resourceStatus: ApuResourceStatus;
  /** Fecha de archivo ISO si el APU está archivado; null/undefined si activo. */
  archivedAt?: string | null;
  /** true si unitCost = '0' o hay componente con totalComponentCost=0. */
  isIncomplete?: boolean;
  /** APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1 (derivados, sin DB nueva): */
  /** Conteo de componentes por tipo (del read-model). */
  typeCounts?: Record<ApuComponentType, number>;
  /** Materiales con precio ausente o ≤ 0. */
  materialsWithoutPrice?: number;
  /** Categoría derivada por palabras clave (fallback visual). */
  category?: ApuCategory;
}

/** Métricas del encabezado de la biblioteca. */
export interface ApuLibraryStats {
  totalApus: number;
  totalComponents: number;
  linkedToBoq: number;
  complete: number; // sin pendientes ni sin-resolver
  withPending: number;
  withUnresolved: number;
}

export type ApuLibraryFilter =
  | 'all'
  | 'linked'
  | 'unlinked'
  | 'complete'
  | 'with_suggestions'
  | 'unresolved'
  | 'ambiguous'
  | 'archived';

export type ApuLibrarySort =
  | 'code'
  | 'name'
  | 'cost'
  | 'components'
  | 'warnings';

export interface ApuLibraryParams {
  page: number;
  pageSize: number; // 25 | 50 | 100
  search: string;
  filter: ApuLibraryFilter;
  sort: ApuLibrarySort;
  origin: string | null; // importBatchId | 'manual' | null
  /**
   * Si es true (o filter='archived') incluye APUs archivados. Por defecto
   * (false) sólo se muestran activos (archived_at IS NULL). El read-model debe
   * exponer `archivedAt` por plantilla para que el filtro tenga efecto real.
   */
  showArchived?: boolean;
  /** APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1 (vista tarjetas; opcionales): */
  /** Filtro por unidad exacta (case-insensitive); null/'' = todas. */
  unit?: string | null;
  /** Filtro por categoría derivada; null/'' = todas. */
  category?: string | null;
  /** Filtro por estado de completitud (ready|review|incomplete|archived); null = todos. */
  completeness?: string | null;
}

export interface ApuLibraryResult {
  items: ApuLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: ApuLibraryStats;
  origins: { id: string; label: string }[];
  /** Unidades distintas presentes (para el filtro de la vista tarjetas). */
  units?: string[];
}
