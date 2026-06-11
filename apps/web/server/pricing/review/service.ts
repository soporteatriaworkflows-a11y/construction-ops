/**
 * service.ts — Servicio de aprobación/rechazo masivo del Centro de Revisión
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1).
 *
 * Propiedad: agent-pricing (vía agent-orchestrator).
 * Contrato: docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md §7.
 *
 * Política de aprobación masiva (no negociable):
 *  - Solo observaciones `pending`; approved/rejected/expired se OMITEN.
 *  - Selección EXPLÍCITA de IDs (jamás "aprobar todo" implícito).
 *  - organization_id derivado del viewer server-side; cross-org invisible.
 *  - Roles management|internal en aplicación; RLS admin/gerencia en DB.
 *  - Máximo MAX_BULK_ROWS filas por acción (documentado).
 *  - Idempotencia: UNIQUE (organization_id, idempotency_key) en DB; la doble
 *    confirmación devuelve la acción original sin re-ejecutar.
 *  - Auditoría: quién, cuándo, lote, IDs, conteos y resultado quedan en
 *    price_observation_bulk_actions (INSERT antes de ejecutar, contadores al
 *    completar). Sin DELETE físico de ningún registro.
 *  - NUNCA toca BOQ, AIU, exports históricos ni el monitor.
 */
import { InsufficientRoleError } from '../errors';
import { DbPriceReviewRepository } from './db-repository';
import { BulkActionDuplicateError, BulkRejectionReasonRequiredError } from './errors';
import {
  buildBulkReviewReportCsv,
  REVIEW_LIST_LIMIT,
  validateBulkSelection,
  validateIdempotencyKey,
} from './validation';
import type {
  AuthenticatedViewer,
  BulkReviewInput,
  BulkReviewResult,
  BulkSkippedRow,
  PendingReviewObservationView,
  PriceReviewRepository,
  ReviewSummary,
  ReviewBatchView,
  Uuid,
} from './types';

const REVIEW_ROLES = ['management', 'internal'] as const;

export interface BulkReviewDeps {
  repository?: PriceReviewRepository;
}

function getRepo(deps?: BulkReviewDeps): PriceReviewRepository {
  return deps?.repository ?? new DbPriceReviewRepository();
}

function checkRole(viewer: AuthenticatedViewer): void {
  if (!(REVIEW_ROLES as readonly string[]).includes(viewer.role)) {
    throw new InsufficientRoleError('management|internal', viewer.role);
  }
}

/** Resumen calculado server-side para la cabecera de la pantalla. */
export function computeReviewSummary(
  observations: ReadonlyArray<PendingReviewObservationView>,
  batches: ReadonlyArray<ReviewBatchView>,
): ReviewSummary {
  const suppliers = new Set<string>();
  let withWarnings = 0;
  let monitorPending = 0;
  for (const o of observations) {
    if (o.supplierId) suppliers.add(o.supplierId);
    if (o.warnings.length > 0) withWarnings++;
    if (o.fromMonitor) monitorPending++;
  }
  return {
    pendingCount: observations.length,
    withWarningsCount: withWarnings,
    supplierCount: suppliers.size,
    batchCount: batches.length,
    monitorPendingCount: monitorPending,
  };
}

async function resultFromExistingAction(
  viewer: AuthenticatedViewer,
  repo: PriceReviewRepository,
  idempotencyKey: string,
  actionType: 'approve' | 'reject',
): Promise<BulkReviewResult> {
  const existing = await repo.findBulkActionByKey(viewer, idempotencyKey);
  if (!existing) {
    // Carrera improbable: el UNIQUE disparó pero la fila no es visible.
    throw new BulkActionDuplicateError(idempotencyKey);
  }
  const meta = existing.metadata as {
    succeededIds?: Uuid[];
    skipped?: BulkSkippedRow[];
  };
  return {
    actionId: existing.id,
    actionType: existing.actionType,
    selectedCount: existing.selectedCount,
    succeededCount: existing.succeededCount,
    skippedCount: existing.skippedCount,
    skipped: meta.skipped ?? [],
    alreadyExecuted: true,
    reportCsv: buildBulkReviewReportCsv(
      actionType,
      meta.succeededIds ?? [],
      meta.skipped ?? [],
      new Map(),
    ),
  };
}

async function executeBulkReview(
  viewer: AuthenticatedViewer,
  actionType: 'approve' | 'reject',
  input: BulkReviewInput,
  deps?: BulkReviewDeps,
): Promise<BulkReviewResult> {
  checkRole(viewer);
  const repo = getRepo(deps);

  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const { validIds, duplicates } = validateBulkSelection(input.observationIds);

  let rejectionReason = '';
  if (actionType === 'reject') {
    rejectionReason = (input.rejectionReason ?? '').trim();
    if (!rejectionReason) throw new BulkRejectionReasonRequiredError();
  }

  // Detalles para reporte y advertencias (antes del UPDATE: luego dejan de
  // ser pending). La lista está acotada a REVIEW_LIST_LIMIT.
  const pendingViews = await repo.listPendingObservations(viewer, REVIEW_LIST_LIMIT);
  const byId = new Map(pendingViews.map((o) => [o.id, o]));

  // Clasificación contra el estado REAL en DB (org del viewer; cross-org y
  // no existentes son invisibles por RLS ⇒ not_found).
  const statuses = await repo.getObservationStatuses(viewer, validIds);
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const skipped: BulkSkippedRow[] = [...duplicates];
  const executableIds: Uuid[] = [];
  for (const id of validIds) {
    const st = statusById.get(id);
    if (!st) {
      skipped.push({ observationId: id, reason: 'not_found' });
    } else if (st.status !== 'pending') {
      skipped.push({ observationId: id, reason: 'not_pending' });
    } else {
      executableIds.push(id);
    }
  }

  // Lote dominante para la auditoría (NULL si la selección mezcla lotes).
  const batchIds = new Set(
    executableIds.map((id) => statusById.get(id)?.importBatchId ?? null),
  );
  const importBatchId =
    batchIds.size === 1 ? ([...batchIds][0] ?? null) : null;

  // Barrera de idempotencia: INSERT primero. Doble confirmación ⇒ 23505 ⇒
  // se devuelve la acción original sin re-ejecutar.
  let actionId: Uuid;
  try {
    actionId = await repo.createBulkAction(viewer, {
      actionType,
      importBatchId,
      selectedCount: input.observationIds.length,
      idempotencyKey,
      metadata: { selectedIds: validIds },
    });
  } catch (e) {
    if (e instanceof BulkActionDuplicateError) {
      return resultFromExistingAction(viewer, repo, idempotencyKey, actionType);
    }
    throw e;
  }

  // UPDATE masivo por chunks; el filtro status='pending' en cada statement
  // garantiza que nada ya revisado se sobrescriba (carrera ⇒ update_failed).
  const updatedIds =
    executableIds.length > 0
      ? await repo.bulkUpdateStatus(
          viewer,
          executableIds,
          actionType === 'approve'
            ? { status: 'approved' }
            : { status: 'rejected', rejectionReason },
        )
      : [];
  const updatedSet = new Set(updatedIds);
  for (const id of executableIds) {
    if (!updatedSet.has(id)) {
      skipped.push({ observationId: id, reason: 'update_failed' });
    }
  }

  await repo.completeBulkAction(viewer, actionId, {
    succeededCount: updatedIds.length,
    skippedCount: skipped.length,
    metadata: {
      selectedIds: validIds,
      succeededIds: updatedIds,
      skipped,
      ...(actionType === 'reject' ? { rejectionReason } : {}),
    },
  });

  return {
    actionId,
    actionType,
    selectedCount: input.observationIds.length,
    succeededCount: updatedIds.length,
    skippedCount: skipped.length,
    skipped,
    alreadyExecuted: false,
    reportCsv: buildBulkReviewReportCsv(actionType, updatedIds, skipped, byId),
  };
}

/** Aprueba en bloque las observaciones pending seleccionadas explícitamente. */
export async function bulkApproveObservations(
  viewer: AuthenticatedViewer,
  input: BulkReviewInput,
  deps?: BulkReviewDeps,
): Promise<BulkReviewResult> {
  return executeBulkReview(viewer, 'approve', input, deps);
}

/** Rechaza en bloque (motivo obligatorio, aplicado a todas las filas). */
export async function bulkRejectObservations(
  viewer: AuthenticatedViewer,
  input: BulkReviewInput,
  deps?: BulkReviewDeps,
): Promise<BulkReviewResult> {
  return executeBulkReview(viewer, 'reject', input, deps);
}
