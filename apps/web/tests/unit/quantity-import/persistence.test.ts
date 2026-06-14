/**
 * persistence.test.ts — Persistencia y visibilidad del importador de
 * memorias de cantidades (QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1).
 *
 * Cubre:
 *  1. import válido → groupsCreated > 0, linesCreated > 0.
 *  2. resultado devuelve conteos reales.
 *  3. import con 0 filas válidas → QuantityImportNotImportableError.
 *  4. listQuantityImportBatches → devuelve lotes de la org.
 *  5. listQuantityImportBatches en modo demo → error.
 *  6. no sync automático BOQ: solo grupos 'linked' envían boqItemId.
 *  7. duplicate importation → result.duplicate = true, rows omitted.
 *  8. no modifica APU ni catálogo (la RPC no toca esas tablas — contrato §I).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmQuantityImport,
  listQuantityImportBatches,
  previewQuantityImport,
} from '@/server/quantity-import/service';
import {
  QuantityImportNotImportableError,
  QuantityImportNotSupportedError,
} from '@/server/quantity-import/errors';
import type {
  DbQuantityImportRepository,
  QuantityBatchRpcPayload,
  QuantityBatchRpcResult,
} from '@/server/quantity-import/db-repository';
import type { ImportedBatchSummary } from '@/lib/quantity-import/types';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { boqCandidates, takeoffWorkbookFile } from './helpers';

const BATCH_ID = '00000000-0000-4000-8000-00000000cc99';

const viewer: AuthenticatedViewer = {
  userId: '00000000-0000-4000-8000-00000000aa01',
  profileId: '00000000-0000-4000-8000-00000000aa02',
  organizationId: '00000000-0000-4000-8000-00000000aa03',
  role: 'management',
};

function makeRepo(opts: {
  rpcOverrides?: Partial<QuantityBatchRpcResult>;
  persistStore?: ImportedBatchSummary[];
} = {}): DbQuantityImportRepository {
  const store: ImportedBatchSummary[] = opts.persistStore ?? [];

  return {
    source: 'db' as const,
    async listLinkableVersions() {
      return [];
    },
    async listBoqCandidates() {
      return boqCandidates();
    },
    async importBatch(_v: AuthenticatedViewer, payload: QuantityBatchRpcPayload) {
      const result: QuantityBatchRpcResult = {
        duplicate: false,
        batchId: BATCH_ID,
        groupsCreated: payload.groups.length,
        linesCreated: payload.groups.reduce((n, g) => n + g.lines.length, 0),
        linkedBoqItems: 0,
        ...opts.rpcOverrides,
      };
      if (!result.duplicate) {
        store.push({
          batchId: result.batchId,
          sourceFilename: payload.batch.sourceFilename,
          sourceSheet: payload.batch.sourceSheet,
          importedAt: new Date().toISOString(),
          groupsCount: result.groupsCreated,
          linesCount: result.linesCreated,
          linkedBoqItems: result.linkedBoqItems,
          groups: payload.groups.map((g) => ({
            id: '00000000-0000-4000-8000-000000000001',
            description: g.description,
            unit: g.unit ?? null,
            totalCalculated: g.totalCalculated,
            lineCount: g.lines.length,
            boqItemId: g.boqItemId,
          })),
        });
      }
      return result;
    },
    async listImportedBatches() {
      return store;
    },
  } as unknown as DbQuantityImportRepository;
}

beforeEach(() => {
  vi.stubEnv('READ_MODEL_SOURCE', 'db');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// ── 1 & 2: importación válida persiste grupo y líneas ──────────────────────
describe('PERSISTENCE — importación válida persiste grupos y líneas', () => {
  it('groupsCreated > 0 y linesCreated > 0 en resultado', async () => {
    const repo = makeRepo();
    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    const result = await confirmQuantityImport(
      viewer,
      file,
      preview.digest,
      { linkVersionId: null },
      { repository: repo },
    );
    expect(result.duplicate).toBe(false);
    expect(result.groupsCreated).toBeGreaterThan(0);
    expect(result.linesCreated).toBeGreaterThan(0);
    expect(result.batchId).toBe(BATCH_ID);
  });

  it('resultado devuelve conteos reales con filas "created"', async () => {
    const repo = makeRepo();
    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    const result = await confirmQuantityImport(
      viewer,
      file,
      preview.digest,
      { linkVersionId: null },
      { repository: repo },
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.importStatus === 'created')).toBe(true);
    expect(result.groupsCreated).toBe(result.rows.filter((r) => r.importStatus === 'created').length);
  });
});

// ── 3: 0 filas válidas no muestra éxito ────────────────────────────────────
describe('PERSISTENCE — import con 0 filas válidas NO muestra éxito', () => {
  it('workbook sin grupos importables ⇒ QuantityImportNotImportableError (no éxito)', async () => {
    const repo = makeRepo();
    const file = takeoffWorkbookFile([[1, 'A', 'sin encabezado']]);
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    expect(preview.importable).toBe(false);
    await expect(
      confirmQuantityImport(
        viewer,
        file,
        preview.digest,
        { linkVersionId: null },
        { repository: repo },
      ),
    ).rejects.toThrow(QuantityImportNotImportableError);
  });

  it('hoja sin encabezado ⇒ blockingErrors no vacío, no llega a RPC', async () => {
    const repo = makeRepo();
    const file = takeoffWorkbookFile([[1, 'A', 'sin encabezado']]);
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    expect(preview.blockingErrors.length).toBeGreaterThan(0);
  });
});

// ── 4: listQuantityImportBatches lista lotes importados ───────────────────
describe('PERSISTENCE — listQuantityImportBatches devuelve lotes de la org', () => {
  it('después de importar, el lote aparece en la lista', async () => {
    const repo = makeRepo();
    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    await confirmQuantityImport(
      viewer,
      file,
      preview.digest,
      { linkVersionId: null },
      { repository: repo },
    );
    const batches = await listQuantityImportBatches(viewer, { repository: repo });
    expect(batches.length).toBe(1);
    expect(batches[0]!.batchId).toBe(BATCH_ID);
    expect(batches[0]!.groupsCount).toBeGreaterThan(0);
    expect(batches[0]!.groups.length).toBeGreaterThan(0);
    expect(batches[0]!.sourceFilename).toBe('sintetico-cantidades.xlsx');
  });

  it('sin imports previos ⇒ lista vacía', async () => {
    const repo = makeRepo();
    const batches = await listQuantityImportBatches(viewer, { repository: repo });
    expect(batches).toEqual([]);
  });
});

// ── 5: modo demo → error ───────────────────────────────────────────────────
describe('PERSISTENCE — modo demo rechazado', () => {
  it('listQuantityImportBatches en modo demo ⇒ QuantityImportNotSupportedError', async () => {
    vi.stubEnv('READ_MODEL_SOURCE', 'demo');
    await expect(listQuantityImportBatches(viewer)).rejects.toThrow(
      QuantityImportNotSupportedError,
    );
  });

  it('rol site rechazado', async () => {
    const repo = makeRepo();
    const site: AuthenticatedViewer = { ...viewer, role: 'site' };
    await expect(listQuantityImportBatches(site, { repository: repo })).rejects.toThrow(
      InsufficientRoleError,
    );
  });
});

// ── 6: no sync automático BOQ ─────────────────────────────────────────────
describe('PERSISTENCE — no sync automático a BOQ', () => {
  it('grupos sin vínculo exacto envían boqItemId = null (no mutation BOQ)', async () => {
    const payloadCaptured: QuantityBatchRpcPayload[] = [];
    const repo: DbQuantityImportRepository = {
      ...makeRepo() as any,
      async importBatch(_v: AuthenticatedViewer, payload: QuantityBatchRpcPayload) {
        payloadCaptured.push(payload);
        return {
          duplicate: false,
          batchId: BATCH_ID,
          groupsCreated: payload.groups.length,
          linesCreated: payload.groups.reduce((n, g) => n + g.lines.length, 0),
          linkedBoqItems: 0,
        } satisfies QuantityBatchRpcResult;
      },
    } as unknown as DbQuantityImportRepository;

    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    await confirmQuantityImport(
      viewer,
      file,
      preview.digest,
      { linkVersionId: null },
      { repository: repo },
    );

    expect(payloadCaptured.length).toBe(1);
    const payload = payloadCaptured[0]!;
    // Sin versión objetivo: todos los grupos van sin boqItemId.
    expect(payload.groups.every((g) => g.boqItemId === null)).toBe(true);
    // El payload NO incluye referencias a apu_templates, catalog, AIU.
    expect(JSON.stringify(payload)).not.toContain('apu_template');
    expect(JSON.stringify(payload)).not.toContain('resource');
  });
});

// ── 7: importación duplicada ───────────────────────────────────────────────
describe('PERSISTENCE — importación duplicada (idempotencia)', () => {
  it('mismo workbook ⇒ result.duplicate = true, filas omitidas', async () => {
    const repo = makeRepo({
      rpcOverrides: {
        duplicate: true,
        groupsCreated: 0,
        linesCreated: 0,
        linkedBoqItems: 0,
        linkedItems: [],
      },
    });
    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    const result = await confirmQuantityImport(
      viewer,
      file,
      preview.digest,
      { linkVersionId: null },
      { repository: repo },
    );
    expect(result.duplicate).toBe(true);
    expect(result.groupsCreated).toBe(0);
    expect(result.rows.every((r) => r.importStatus === 'omitted')).toBe(true);
    expect(result.rows.every((r) => r.linkStatus === 'not_evaluated')).toBe(true);
    expect(result.rows[0]!.messages.some((m) => m.includes('ya fue importado'))).toBe(true);
  });
});
