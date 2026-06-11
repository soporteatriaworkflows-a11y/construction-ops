/**
 * types.ts — Tipos del Centro de Revisión de Precios
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1).
 *
 * Propiedad: agent-pricing (vía agent-orchestrator).
 * Contrato: docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md §6.
 *
 * Reglas:
 *  - organization_id SIEMPRE derivado server-side del viewer (nunca del navegador).
 *  - Solo observaciones `pending` son candidatas a acción masiva.
 *  - La acción masiva exige selección explícita + idempotency_key + confirmación.
 */
import type {
  Uuid,
  IsoDateTime,
  DecimalString,
  PriceSourceType,
  AuthenticatedViewer,
} from '../types';

export type { Uuid, IsoDateTime, DecimalString, PriceSourceType, AuthenticatedViewer };

/** Advertencia no crítica de una observación pendiente (visible, no bloquea). */
export interface ReviewWarning {
  code: 'unit_mismatch' | 'zero_price' | 'monitor_origin' | 'foreign_currency';
  message: string;
}

/** Observación pendiente enriquecida para la pantalla de revisión. */
export interface PendingReviewObservationView {
  id: Uuid;
  resourceId: Uuid;
  resourceCode: string;
  resourceName: string;
  /** Unidad canónica del recurso en el catálogo. */
  resourceUnit: string;
  supplierId: Uuid | null;
  supplierName: string | null;
  /** 🔒 precio público observado */
  observedPrice: DecimalString;
  /** 🔒 descuento % (0–100) */
  discountPercent: DecimalString;
  /** 🔒 precio neto sugerido (DB-computed) */
  suggestedNetPrice: DecimalString;
  /** Unidad RAW de la observación (se preserva siempre). */
  unit: string;
  currency: string;
  sourceType: PriceSourceType;
  sourceReference: string | null;
  observedAt: IsoDateTime;
  createdAt: IsoDateTime;
  status: 'pending';
  notes: string | null;
  /** Lote de importación (NULL = manual, histórica o del monitor). */
  importBatchId: Uuid | null;
  batchLabel: string | null;
  /** true si la observación fue creada por el monitor automático. */
  fromMonitor: boolean;
  /** Advertencias no críticas calculadas server-side. */
  warnings: ReviewWarning[];
}

/** Lote de importación visible en filtros y resumen. */
export interface ReviewBatchView {
  id: Uuid;
  sourceType: PriceSourceType;
  sourceReference: string | null;
  label: string | null;
  importedAt: IsoDateTime;
  totalRows: number;
  /** Conteos calculados en lectura (no almacenados). */
  pendingCount: number;
}

/** Resumen superior de la pantalla de revisión. */
export interface ReviewSummary {
  pendingCount: number;
  withWarningsCount: number;
  supplierCount: number;
  batchCount: number;
  monitorPendingCount: number;
}

/** Input de acción masiva (la selección SIEMPRE es explícita). */
export interface BulkReviewInput {
  /** IDs seleccionados explícitamente por el usuario (1..MAX_BULK_ROWS). */
  observationIds: Uuid[];
  /** Clave de idempotencia generada al abrir el modal de confirmación. */
  idempotencyKey: string;
  /** Obligatoria para reject; ignorada en approve. */
  rejectionReason?: string;
}

/** Detalle de una fila omitida en la acción masiva. */
export interface BulkSkippedRow {
  observationId: Uuid;
  reason:
    | 'not_pending'
    | 'not_found'
    | 'duplicate_in_selection'
    | 'update_failed';
}

/** Resultado de la acción masiva (auditado en price_observation_bulk_actions). */
export interface BulkReviewResult {
  actionId: Uuid;
  actionType: 'approve' | 'reject';
  selectedCount: number;
  succeededCount: number;
  skippedCount: number;
  skipped: BulkSkippedRow[];
  /** true si la acción ya había sido ejecutada (idempotencia). */
  alreadyExecuted: boolean;
  /** Reporte CSV sanitizado descargable. */
  reportCsv: string;
}

/** Registro auditado de una acción masiva existente. */
export interface BulkActionRecord {
  id: Uuid;
  actionType: 'approve' | 'reject';
  importBatchId: Uuid | null;
  createdAt: IsoDateTime;
  selectedCount: number;
  succeededCount: number;
  skippedCount: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

/** Repositorio del centro de revisión (DB con RLS; fixture solo lectura). */
export interface PriceReviewRepository {
  readonly source: 'db' | 'fixture';

  /** Observaciones pending de la org del viewer, enriquecidas. */
  listPendingObservations(
    viewer: AuthenticatedViewer,
    limit: number,
  ): Promise<PendingReviewObservationView[]>;

  /** Lotes con observaciones de la org del viewer. */
  listBatches(viewer: AuthenticatedViewer): Promise<ReviewBatchView[]>;

  /** Lee estado actual de los IDs seleccionados (solo de la org del viewer). */
  getObservationStatuses(
    viewer: AuthenticatedViewer,
    observationIds: Uuid[],
  ): Promise<Array<{ id: Uuid; status: string; importBatchId: Uuid | null }>>;

  /** Busca acción previa por idempotency_key (org del viewer). */
  findBulkActionByKey(
    viewer: AuthenticatedViewer,
    idempotencyKey: string,
  ): Promise<BulkActionRecord | null>;

  /**
   * Inserta el registro de acción ANTES de ejecutar (barrera de idempotencia).
   * Lanza BulkActionDuplicateError si (org, idempotency_key) ya existe.
   */
  createBulkAction(
    viewer: AuthenticatedViewer,
    input: {
      actionType: 'approve' | 'reject';
      importBatchId: Uuid | null;
      selectedCount: number;
      idempotencyKey: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<Uuid>;

  /** Completa contadores y metadata del registro tras ejecutar. */
  completeBulkAction(
    viewer: AuthenticatedViewer,
    actionId: Uuid,
    update: {
      succeededCount: number;
      skippedCount: number;
      metadata: Record<string, unknown>;
    },
  ): Promise<void>;

  /**
   * UPDATE masivo por chunks: solo filas `pending` de la org del viewer cuyo
   * id esté en la selección. Devuelve los IDs efectivamente actualizados.
   */
  bulkUpdateStatus(
    viewer: AuthenticatedViewer,
    observationIds: Uuid[],
    update:
      | { status: 'approved' }
      | { status: 'rejected'; rejectionReason: string },
  ): Promise<Uuid[]>;
}
