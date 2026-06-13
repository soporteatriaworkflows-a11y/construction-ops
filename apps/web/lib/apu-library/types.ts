/**
 * types.ts — Contrato de la biblioteca APU compacta
 * (APU_LIBRARY_OPERATIONAL_UX_V1). Tipos puros consumidos por la UI.
 */
import type { DecimalString, Uuid } from '@/lib/utils/types';

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
  | 'ambiguous';

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
}

export interface ApuLibraryResult {
  items: ApuLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: ApuLibraryStats;
  origins: { id: string; label: string }[];
}
