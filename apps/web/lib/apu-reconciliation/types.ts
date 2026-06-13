/**
 * types.ts — Contrato de datos de la reconciliación componente↔recurso
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1). Consumido por el centro de
 * reconciliación, el detalle APU y las server actions.
 *
 * Dinero/cantidades viajan como DecimalString (nunca number); la UI solo formatea.
 */
import type {
  ApuComponentType,
  DecimalString,
  IsoDateTime,
  Uuid,
} from '@/lib/utils/types';

/** Estado operativo derivado de un componente (dinámico salvo los persistentes). */
export type ReconciliationState =
  | 'exact_match'
  | 'suggested'
  | 'ambiguous'
  | 'unresolved'
  | 'associated'
  | 'intentionally_unresolved';

/** Vía del matching exacto o sugerido. */
export type MatchVia = 'code' | 'reference' | 'sku' | 'name';

/** Recurso candidato para asociar a un componente. */
export interface ReconciliationCandidate {
  resourceId: Uuid;
  code: string;
  name: string;
  unit: string;
  via: MatchVia;
  /** La unidad del recurso difiere de la unidad raw del componente. */
  unitMismatch: boolean;
  /** Precio baseline aprobado del recurso (si existe), DecimalString. */
  approvedBaselinePrice: DecimalString | null;
}

/** Fila de reconciliación de un componente APU. */
export interface ReconciliationRow {
  componentId: Uuid;
  apuTemplateId: Uuid;
  apuCode: string;
  apuName: string;
  componentType: ApuComponentType;
  rawCode: string | null;
  rawUnit: string | null;
  /** Descripción derivada de notes (o raw_code como fallback). */
  description: string;
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
  state: ReconciliationState;
  /** Recurso ya asociado (si state = associated). */
  associatedResourceId: Uuid | null;
  associatedResourceCode: string | null;
  associatedResourceName: string | null;
  /** Sugerencia/candidato principal (si pendiente con coincidencia). */
  primaryCandidate: ReconciliationCandidate | null;
  /** Candidatos múltiples cuando state = ambiguous. */
  candidates: ReconciliationCandidate[];
  /** Razón legible del matching (para la columna "razón"). */
  matchReason: string;
  importBatchId: Uuid | null;
}

/** Resumen agregado del universo de reconciliación (componentes no-labor). */
export interface ReconciliationSummary {
  totalComponents: number;
  associated: number;
  exactPending: number;
  suggested: number;
  ambiguous: number;
  unresolved: number;
  intentionallyUnresolved: number;
}

/** Filtros del centro de reconciliación. */
export type ReconciliationFilter =
  | 'all'
  | 'exact'
  | 'suggested'
  | 'ambiguous'
  | 'unresolved'
  | 'associated'
  | 'pending'
  | 'intentionally_unresolved';

/** Resultado de una búsqueda manual de recurso (inline). */
export interface ResourceSearchResult {
  resourceId: Uuid;
  code: string;
  name: string;
  unit: string;
  resourceType: string;
  approvedBaselinePrice: DecimalString | null;
}

/** Resultado de la acción individual de asociación/confirmación. */
export interface ReconcileActionResult {
  componentId: Uuid;
  resourceId?: Uuid;
  previousResourceId?: Uuid | null;
  newTotal?: DecimalString;
  status:
    | 'reconciled'
    | 'replaced'
    | 'already_reconciled'
    | 'labor_component'
    | 'not_found'
    | 'resource_not_found';
}

/** Resultado de la acción masiva. */
export interface BulkReconcileResult {
  selected: number;
  succeeded: number;
  skipped: number;
  rows: ReconcileActionResult[];
}

/** Entrada de un par para la asociación masiva. */
export interface BulkReconcilePair {
  componentId: Uuid;
  resourceId: Uuid;
}

/** Vínculo BOQ de una plantilla APU (pestaña Vínculo BOQ del detalle). */
export interface ApuBoqLinkView {
  boqItemId: Uuid;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  subtotal: DecimalString;
  estimateName: string;
  versionNumber: number;
  versionStatus: string;
}

/** Metadatos de un lote de importación APU (origen/trazabilidad). */
export interface ApuImportBatchInfo {
  id: Uuid;
  sourceFilename: string;
  sourceSheet: string;
  importedAt: IsoDateTime;
  importedByName: string | null;
}
