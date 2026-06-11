/**
 * service.test.ts — Dominio de la aprobación masiva del Centro de Revisión
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1). Mandato: pruebas 7–22.
 *
 * Sin red ni DB: repositorio en memoria que implementa PriceReviewRepository.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  bulkApproveObservations,
  bulkRejectObservations,
  computeReviewSummary,
} from '@/server/pricing/review/service';
import {
  validateBulkSelection,
  computeReviewWarnings,
  buildBulkReviewReportCsv,
  MAX_BULK_ROWS,
  BULK_UPDATE_CHUNK,
} from '@/server/pricing/review/validation';
import {
  BulkActionDuplicateError,
  BulkRejectionReasonRequiredError,
  BulkSelectionInvalidError,
  BulkSelectionTooLargeError,
} from '@/server/pricing/review/errors';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type {
  AuthenticatedViewer,
  BulkActionRecord,
  PendingReviewObservationView,
  PriceReviewRepository,
  ReviewBatchView,
  Uuid,
} from '@/server/pricing/review/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VIEWER: AuthenticatedViewer = {
  userId: 'user-1',
  profileId: '00000000-0000-0000-0000-0000000000b1',
  organizationId: '00000000-0000-0000-0000-0000000000a1',
  role: 'management',
};

const SITE_VIEWER: AuthenticatedViewer = { ...VIEWER, role: 'site' };
const CLIENT_VIEWER: AuthenticatedViewer = { ...VIEWER, role: 'client' };

const uuid = (n: number): Uuid =>
  `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

interface MemRow {
  id: Uuid;
  status: string;
  importBatchId: Uuid | null;
  sourceType: PendingReviewObservationView['sourceType'];
  approvedAt: string | null;
  rejectionReason: string | null;
  fromMonitor: boolean;
}

function makeView(row: MemRow): PendingReviewObservationView {
  return {
    id: row.id,
    resourceId: uuid(900),
    resourceCode: `RC-${row.id.slice(-3)}`,
    resourceName: 'Recurso demo',
    resourceUnit: 'und',
    supplierId: null,
    supplierName: 'Proveedor demo',
    observedPrice: '1000',
    discountPercent: '0',
    suggestedNetPrice: '1000',
    unit: 'und',
    currency: 'COP',
    sourceType: row.sourceType,
    sourceReference: null,
    observedAt: '2026-06-10T00:00:00.000Z',
    createdAt: '2026-06-10T00:00:00.000Z',
    status: 'pending',
    notes: null,
    importBatchId: row.importBatchId,
    batchLabel: row.importBatchId ? 'Lote demo' : null,
    fromMonitor: row.fromMonitor,
    warnings: [],
  };
}

class MemRepo implements PriceReviewRepository {
  readonly source = 'db' as const;
  rows = new Map<Uuid, MemRow>();
  actions = new Map<string, BulkActionRecord & { initiatedBy: string; organizationId: string }>();
  updateCalls: Uuid[][] = [];

  addRow(partial: Partial<MemRow> & { id: Uuid }): void {
    this.rows.set(partial.id, {
      status: 'pending',
      importBatchId: null,
      sourceType: 'supplier_csv',
      approvedAt: null,
      rejectionReason: null,
      fromMonitor: false,
      ...partial,
    });
  }

  async listPendingObservations(): Promise<PendingReviewObservationView[]> {
    return [...this.rows.values()].filter((r) => r.status === 'pending').map(makeView);
  }

  async listBatches(): Promise<ReviewBatchView[]> {
    return [];
  }

  async getObservationStatuses(
    _viewer: AuthenticatedViewer,
    ids: Uuid[],
  ): Promise<Array<{ id: Uuid; status: string; importBatchId: Uuid | null }>> {
    return ids
      .filter((id) => this.rows.has(id))
      .map((id) => {
        const r = this.rows.get(id)!;
        return { id, status: r.status, importBatchId: r.importBatchId };
      });
  }

  async findBulkActionByKey(
    _viewer: AuthenticatedViewer,
    key: string,
  ): Promise<BulkActionRecord | null> {
    return this.actions.get(key) ?? null;
  }

  async createBulkAction(
    viewer: AuthenticatedViewer,
    input: {
      actionType: 'approve' | 'reject';
      importBatchId: Uuid | null;
      selectedCount: number;
      idempotencyKey: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<Uuid> {
    if (this.actions.has(input.idempotencyKey)) {
      throw new BulkActionDuplicateError(input.idempotencyKey);
    }
    const id = uuid(7000 + this.actions.size);
    this.actions.set(input.idempotencyKey, {
      id,
      actionType: input.actionType,
      importBatchId: input.importBatchId,
      createdAt: new Date().toISOString(),
      selectedCount: input.selectedCount,
      succeededCount: 0,
      skippedCount: 0,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      initiatedBy: viewer.profileId,
      organizationId: viewer.organizationId,
    });
    return id;
  }

  async completeBulkAction(
    _viewer: AuthenticatedViewer,
    actionId: Uuid,
    update: { succeededCount: number; skippedCount: number; metadata: Record<string, unknown> },
  ): Promise<void> {
    for (const a of this.actions.values()) {
      if (a.id === actionId) {
        a.succeededCount = update.succeededCount;
        a.skippedCount = update.skippedCount;
        a.metadata = update.metadata;
      }
    }
  }

  async bulkUpdateStatus(
    _viewer: AuthenticatedViewer,
    ids: Uuid[],
    update: { status: 'approved' } | { status: 'rejected'; rejectionReason: string },
  ): Promise<Uuid[]> {
    this.updateCalls.push([...ids]);
    const updated: Uuid[] = [];
    for (const id of ids) {
      const row = this.rows.get(id);
      if (!row || row.status !== 'pending') continue;
      row.status = update.status;
      row.approvedAt = new Date().toISOString();
      if (update.status === 'rejected') row.rejectionReason = update.rejectionReason;
      updated.push(id);
    }
    return updated;
  }
}

let repo: MemRepo;

beforeEach(() => {
  repo = new MemRepo();
});

const input = (ids: Uuid[], key = 'key-0001-test') => ({
  observationIds: ids,
  idempotencyKey: key,
});

// ---------------------------------------------------------------------------
// T7-T9 — solo pending aprobable; approved/rejected se omiten
// ---------------------------------------------------------------------------

describe('T7-T9 — solo pending es aprobable', () => {
  it('T7: una observación pending se aprueba y queda como baseline', async () => {
    repo.addRow({ id: uuid(1) });
    const result = await bulkApproveObservations(VIEWER, input([uuid(1)]), { repository: repo });
    expect(result.succeededCount).toBe(1);
    expect(repo.rows.get(uuid(1))!.status).toBe('approved');
    expect(repo.rows.get(uuid(1))!.approvedAt).not.toBeNull();
  });

  it('T8: approved se omite (no se sobrescribe)', async () => {
    repo.addRow({ id: uuid(1), status: 'approved' });
    repo.addRow({ id: uuid(2) });
    const result = await bulkApproveObservations(VIEWER, input([uuid(1), uuid(2)]), { repository: repo });
    expect(result.succeededCount).toBe(1);
    expect(result.skipped).toContainEqual({ observationId: uuid(1), reason: 'not_pending' });
  });

  it('T9: rejected se omite', async () => {
    repo.addRow({ id: uuid(1), status: 'rejected' });
    const result = await bulkApproveObservations(VIEWER, input([uuid(1)]), { repository: repo });
    expect(result.succeededCount).toBe(0);
    expect(result.skipped).toContainEqual({ observationId: uuid(1), reason: 'not_pending' });
  });
});

// ---------------------------------------------------------------------------
// T10-T13 — selección explícita, inválidas y advertencias
// ---------------------------------------------------------------------------

describe('T10-T13 — selección explícita y validez', () => {
  it('T10: selección vacía rechazada (jamás "aprobar todo" implícito)', async () => {
    await expect(
      bulkApproveObservations(VIEWER, input([]), { repository: repo }),
    ).rejects.toBeInstanceOf(BulkSelectionInvalidError);
  });

  it('T11: fila inexistente/cross-org se excluye como not_found', async () => {
    repo.addRow({ id: uuid(1) });
    const result = await bulkApproveObservations(VIEWER, input([uuid(1), uuid(99)]), { repository: repo });
    expect(result.succeededCount).toBe(1);
    expect(result.skipped).toContainEqual({ observationId: uuid(99), reason: 'not_found' });
  });

  it('T12: advertencia no crítica visible (unit mismatch / monitor / precio 0)', () => {
    const warnings = computeReviewWarnings({
      unit: 'kg',
      resourceUnit: 'm²',
      observedPrice: '0',
      currency: 'USD',
      fromMonitor: true,
    });
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain('unit_mismatch');
    expect(codes).toContain('zero_price');
    expect(codes).toContain('monitor_origin');
    expect(codes).toContain('foreign_currency');
    // m2 vs m² NO genera warning falso (UNIT_ALIAS_NORMALIZATION_V1)
    const ok = computeReviewWarnings({
      unit: 'm2',
      resourceUnit: 'm²',
      observedPrice: '100',
      currency: 'COP',
      fromMonitor: false,
    });
    expect(ok).toHaveLength(0);
  });

  it('T13: selección con ID malformado bloquea la acción completa (crítico)', async () => {
    repo.addRow({ id: uuid(1) });
    await expect(
      bulkApproveObservations(
        VIEWER,
        input([uuid(1), 'DROP TABLE resource_price_observations']),
        { repository: repo },
      ),
    ).rejects.toBeInstanceOf(BulkSelectionInvalidError);
    // Nada se aprobó: la acción crítica bloquea TODO.
    expect(repo.rows.get(uuid(1))!.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// T14-T15 — preservación de datos y baseline
// ---------------------------------------------------------------------------

describe('T14-T15 — source_type preservado y baseline disponible', () => {
  it('T14: la aprobación NO modifica source_type', async () => {
    repo.addRow({ id: uuid(1), sourceType: 'public_web' });
    await bulkApproveObservations(VIEWER, input([uuid(1)]), { repository: repo });
    expect(repo.rows.get(uuid(1))!.sourceType).toBe('public_web');
  });

  it('T15: tras aprobar, la observación queda approved con approved_at (baseline)', async () => {
    repo.addRow({ id: uuid(1) });
    await bulkApproveObservations(VIEWER, input([uuid(1)]), { repository: repo });
    const row = repo.rows.get(uuid(1))!;
    expect(row.status).toBe('approved');
    expect(row.approvedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T16 — idempotencia
// ---------------------------------------------------------------------------

describe('T16 — idempotencia evita doble aprobación', () => {
  it('la segunda confirmación con la misma clave NO re-ejecuta', async () => {
    repo.addRow({ id: uuid(1) });
    const first = await bulkApproveObservations(VIEWER, input([uuid(1)], 'key-dup-0001'), { repository: repo });
    expect(first.alreadyExecuted).toBe(false);
    expect(repo.updateCalls).toHaveLength(1);

    const second = await bulkApproveObservations(VIEWER, input([uuid(1)], 'key-dup-0001'), { repository: repo });
    expect(second.alreadyExecuted).toBe(true);
    expect(second.actionId).toBe(first.actionId);
    // Sin nuevas escrituras sobre observaciones.
    expect(repo.updateCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T17-T20 — auditoría completa
// ---------------------------------------------------------------------------

describe('T17-T20 — auditoría', () => {
  it('T17-T20: registra actor, lote, IDs y conteos', async () => {
    const batchId = uuid(500);
    repo.addRow({ id: uuid(1), importBatchId: batchId });
    repo.addRow({ id: uuid(2), importBatchId: batchId });
    repo.addRow({ id: uuid(3), status: 'approved', importBatchId: batchId });

    const result = await bulkApproveObservations(
      VIEWER,
      input([uuid(1), uuid(2), uuid(3)], 'key-audit'),
      { repository: repo },
    );

    const action = repo.actions.get('key-audit')!;
    expect(action.initiatedBy).toBe(VIEWER.profileId); // T17 actor
    expect(action.organizationId).toBe(VIEWER.organizationId);
    expect(action.importBatchId).toBe(batchId); // T18 lote
    expect(action.metadata.selectedIds).toEqual([uuid(1), uuid(2), uuid(3)]); // T19 IDs
    expect(action.metadata.succeededIds).toEqual([uuid(1), uuid(2)]);
    expect(action.selectedCount).toBe(3); // T20 conteos
    expect(action.succeededCount).toBe(2);
    expect(action.skippedCount).toBe(1);
    expect(result.succeededCount).toBe(2);
    expect(result.skippedCount).toBe(1);
  });

  it('selección que mezcla lotes registra import_batch_id = null', async () => {
    repo.addRow({ id: uuid(1), importBatchId: uuid(500) });
    repo.addRow({ id: uuid(2), importBatchId: uuid(501) });
    await bulkApproveObservations(VIEWER, input([uuid(1), uuid(2)], 'key-mixed'), { repository: repo });
    expect(repo.actions.get('key-mixed')!.importBatchId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T21-T22 — máximo de filas y estrategia por chunks
// ---------------------------------------------------------------------------

describe('T21-T22 — límites y chunks', () => {
  it('T21: selección mayor a MAX_BULK_ROWS rechazada', async () => {
    const ids = Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => uuid(i + 1));
    await expect(
      bulkApproveObservations(VIEWER, input(ids), { repository: repo }),
    ).rejects.toBeInstanceOf(BulkSelectionTooLargeError);
  });

  it('T22: MAX_BULK_ROWS y BULK_UPDATE_CHUNK documentados y coherentes', () => {
    expect(MAX_BULK_ROWS).toBe(500);
    expect(BULK_UPDATE_CHUNK).toBe(100);
    expect(BULK_UPDATE_CHUNK).toBeLessThanOrEqual(MAX_BULK_ROWS);
  });

  it('T22b: duplicados dentro de la selección se reportan como skip', () => {
    const { validIds, duplicates } = validateBulkSelection([uuid(1), uuid(1), uuid(2)]);
    expect(validIds).toEqual([uuid(1), uuid(2)]);
    expect(duplicates).toContainEqual({
      observationId: uuid(1),
      reason: 'duplicate_in_selection',
    });
  });
});

// ---------------------------------------------------------------------------
// Reject + roles + CSV
// ---------------------------------------------------------------------------

describe('rechazo masivo', () => {
  it('exige motivo de rechazo', async () => {
    repo.addRow({ id: uuid(1) });
    await expect(
      bulkRejectObservations(VIEWER, input([uuid(1)]), { repository: repo }),
    ).rejects.toBeInstanceOf(BulkRejectionReasonRequiredError);
  });

  it('aplica el motivo a todas las filas rechazadas', async () => {
    repo.addRow({ id: uuid(1) });
    repo.addRow({ id: uuid(2) });
    const result = await bulkRejectObservations(
      VIEWER,
      { ...input([uuid(1), uuid(2)]), rejectionReason: 'Precio desactualizado' },
      { repository: repo },
    );
    expect(result.succeededCount).toBe(2);
    expect(repo.rows.get(uuid(1))!.status).toBe('rejected');
    expect(repo.rows.get(uuid(1))!.rejectionReason).toBe('Precio desactualizado');
  });
});

describe('roles (defensa de aplicación)', () => {
  it.each([
    ['site', SITE_VIEWER],
    ['client', CLIENT_VIEWER],
  ] as const)('rol %s bloqueado', async (_label, viewer) => {
    repo.addRow({ id: uuid(1) });
    await expect(
      bulkApproveObservations(viewer, input([uuid(1)]), { repository: repo }),
    ).rejects.toBeInstanceOf(InsufficientRoleError);
    expect(repo.rows.get(uuid(1))!.status).toBe('pending');
  });
});

describe('reporte CSV sanitizado', () => {
  it('incluye aprobadas y omitidas con neutralización de fórmulas', () => {
    const view = makeView({
      id: uuid(1),
      status: 'pending',
      importBatchId: null,
      sourceType: 'supplier_csv',
      approvedAt: null,
      rejectionReason: null,
      fromMonitor: false,
    });
    const dangerous = { ...view, resourceCode: '=SUM(A1:A9)' };
    const csv = buildBulkReviewReportCsv(
      'approve',
      [uuid(1)],
      [{ observationId: uuid(2), reason: 'not_pending' }],
      new Map([[uuid(1), dangerous]]),
    );
    expect(csv).toContain("'=SUM(A1:A9)"); // fórmula neutralizada
    expect(csv).toContain('Aprobada');
    expect(csv).toContain('Omitida (ya revisada)');
  });
});

describe('resumen de revisión', () => {
  it('cuenta pendientes, advertencias, proveedores, lotes y monitor', () => {
    const base = makeView({
      id: uuid(1),
      status: 'pending',
      importBatchId: null,
      sourceType: 'supplier_csv',
      approvedAt: null,
      rejectionReason: null,
      fromMonitor: false,
    });
    const summary = computeReviewSummary(
      [
        { ...base, id: uuid(1), supplierId: uuid(801) },
        { ...base, id: uuid(2), supplierId: uuid(801), warnings: [{ code: 'zero_price', message: 'x' }] },
        { ...base, id: uuid(3), supplierId: uuid(802), fromMonitor: true },
      ],
      [
        {
          id: uuid(500),
          sourceType: 'supplier_csv',
          sourceReference: null,
          label: 'Lote',
          importedAt: '2026-06-10T00:00:00.000Z',
          totalRows: 3,
          pendingCount: 3,
        },
      ],
    );
    expect(summary.pendingCount).toBe(3);
    expect(summary.withWarningsCount).toBe(1);
    expect(summary.supplierCount).toBe(2);
    expect(summary.batchCount).toBe(1);
    expect(summary.monitorPendingCount).toBe(1);
  });
});
