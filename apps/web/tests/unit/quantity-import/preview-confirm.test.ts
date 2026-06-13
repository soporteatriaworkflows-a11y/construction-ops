/**
 * preview-confirm.test.ts — PREVIEW y CONFIRMACIÓN del importador de
 * cantidades (QUANTITY_TAKEOFF_IMPORT_V1, contrato §9–§11). Servicio con
 * repositorio simulado: NO toca base de datos; valida el contrato server-side
 * (digest, idempotencia, vínculos solo exactos, provenance, CSV sanitizado).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildQuantityReportCsv,
  confirmQuantityImport,
  listQuantityLinkableVersions,
  previewQuantityImport,
} from '@/server/quantity-import/service';
import {
  QuantityImportDigestMismatchError,
  QuantityImportFileError,
  QuantityImportNotImportableError,
  QuantityImportNotSupportedError,
} from '@/server/quantity-import/errors';
import type {
  DbQuantityImportRepository,
  QuantityBatchRpcPayload,
  QuantityBatchRpcResult,
} from '@/server/quantity-import/db-repository';
import type { BoqTakeoffCandidate } from '@/server/quantity-import/matching';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { InsufficientRoleError } from '@/server/pricing/errors';
import {
  boqCandidates,
  standardTakeoffCells,
  takeoffWorkbookFile,
  type CellSpec,
} from './helpers';

const viewer: AuthenticatedViewer = {
  userId: '00000000-0000-4000-8000-00000000aa01',
  profileId: '00000000-0000-4000-8000-00000000aa02',
  organizationId: '00000000-0000-4000-8000-00000000aa03',
  role: 'management',
};

const VERSION_ID = '00000000-0000-4000-8000-00000000ee01';

interface MockState {
  boqCandidates: BoqTakeoffCandidate[];
  rpcResult?: Partial<QuantityBatchRpcResult>;
}

function makeRepo(state: MockState) {
  const calls: {
    viewers: AuthenticatedViewer[];
    methods: string[];
    rpcPayloads: QuantityBatchRpcPayload[];
  } = { viewers: [], methods: [], rpcPayloads: [] };

  const repo = {
    source: 'db' as const,
    async listLinkableVersions(v: AuthenticatedViewer) {
      calls.viewers.push(v);
      calls.methods.push('listLinkableVersions');
      return [
        { versionId: VERSION_ID, label: 'Sintético — V01', status: 'draft', itemCount: 5 },
      ];
    },
    async listBoqCandidates(v: AuthenticatedViewer) {
      calls.viewers.push(v);
      calls.methods.push('listBoqCandidates');
      return state.boqCandidates;
    },
    async importBatch(v: AuthenticatedViewer, payload: QuantityBatchRpcPayload) {
      calls.viewers.push(v);
      calls.methods.push('importBatch');
      calls.rpcPayloads.push(payload);
      const linked = payload.groups.filter((g) => g.boqItemId !== null);
      return {
        duplicate: false,
        batchId: '00000000-0000-4000-8000-00000000cc01',
        groupsCreated: payload.groups.length,
        linesCreated: payload.groups.reduce((n, g) => n + g.lines.length, 0),
        linkedBoqItems: linked.length,
        linkedItems: linked.map((g) => ({
          groupSourceRow: String(g.sourceRow),
          boqItemId: g.boqItemId!,
        })),
        ...state.rpcResult,
      } satisfies QuantityBatchRpcResult;
    },
  };
  return { repo: repo as unknown as DbQuantityImportRepository, calls };
}

const baseState = (): MockState => ({ boqCandidates: boqCandidates() });

beforeEach(() => {
  vi.stubEnv('READ_MODEL_SOURCE', 'db');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('previewQuantityImport — paso A sin escritura (§9)', () => {
  it('reporta conteos correctos con versión objetivo (vínculos solo exactos)', async () => {
    const { repo, calls } = makeRepo(baseState());
    const preview = await previewQuantityImport(viewer, takeoffWorkbookFile(), VERSION_ID, {
      repository: repo,
    });
    expect(preview.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.totals.groups).toBe(6);
    expect(preview.totals.lines).toBe(11);
    expect(preview.totals.linked).toBe(4); // P-01, BC-01, 9.01×2
    expect(preview.totals.suggested).toBe(1); // MT-01 (unidad Z1 ⇒ null)
    expect(preview.totals.unresolved).toBe(1); // BC-02 sin candidato
    expect(preview.totals.deductions).toBe(1);
    expect(preview.totals.skippedNoLines).toBe(1); // AC-01
    expect(preview.importable).toBe(true);
    // NUNCA escribe: la RPC no se invoca en preview.
    expect(calls.methods).not.toContain('importBatch');
    expect(calls.methods).toContain('listBoqCandidates');
  });

  it('sin versión objetivo: todos not_evaluated y sin leer candidatos BOQ', async () => {
    const { repo, calls } = makeRepo(baseState());
    const preview = await previewQuantityImport(viewer, takeoffWorkbookFile(), null, {
      repository: repo,
    });
    expect(preview.totals.notEvaluated).toBe(6);
    expect(preview.totals.linked).toBe(0);
    expect(preview.groups.every((g) => g.boqItemId === null)).toBe(true);
    expect(calls.methods).not.toContain('listBoqCandidates');
  });

  it('las sugerencias jamás portan boqItemId (solo informativas, §6)', async () => {
    const { repo } = makeRepo(baseState());
    const preview = await previewQuantityImport(viewer, takeoffWorkbookFile(), VERSION_ID, {
      repository: repo,
    });
    const suggested = preview.groups.find((g) => g.linkStatus === 'suggested')!;
    expect(suggested.boqItemId).toBeNull();
    expect(suggested.boqItemCode).toBe('2.01'); // informativo para la UI
  });

  it('rechaza roles distintos de management|internal', async () => {
    const { repo } = makeRepo(baseState());
    const site: AuthenticatedViewer = { ...viewer, role: 'site' };
    await expect(
      previewQuantityImport(site, takeoffWorkbookFile(), null, { repository: repo }),
    ).rejects.toThrow(InsufficientRoleError);
    await expect(listQuantityLinkableVersions(site, { repository: repo })).rejects.toThrow(
      InsufficientRoleError,
    );
  });

  it('rechaza el modo demo (READ_MODEL_SOURCE ≠ db)', async () => {
    vi.stubEnv('READ_MODEL_SOURCE', 'demo');
    const { repo } = makeRepo(baseState());
    await expect(
      previewQuantityImport(viewer, takeoffWorkbookFile(), null, { repository: repo }),
    ).rejects.toThrow(QuantityImportNotSupportedError);
  });

  it('rechaza archivos con extensión no admitida', async () => {
    const { repo } = makeRepo(baseState());
    const csv = new File(['a,b,c'], 'cantidades.csv', { type: 'text/csv' });
    await expect(
      previewQuantityImport(viewer, csv, null, { repository: repo }),
    ).rejects.toThrow(QuantityImportFileError);
  });
});

describe('confirmQuantityImport — paso B atómico e idempotente (§9–§11)', () => {
  it('digest distinto al de la vista previa ⇒ rechazo sin escribir', async () => {
    const { repo, calls } = makeRepo(baseState());
    await expect(
      confirmQuantityImport(viewer, takeoffWorkbookFile(), 'f'.repeat(64), {
        linkVersionId: null,
      }, { repository: repo }),
    ).rejects.toThrow(QuantityImportDigestMismatchError);
    expect(calls.methods).not.toContain('importBatch');
  });

  it('workbook sin grupos importables ⇒ rechazo sin escribir', async () => {
    const { repo, calls } = makeRepo(baseState());
    const file = takeoffWorkbookFile([[1, 'A', 'sin encabezado']]);
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    expect(preview.importable).toBe(false);
    await expect(
      confirmQuantityImport(viewer, file, preview.digest, { linkVersionId: null }, {
        repository: repo,
      }),
    ).rejects.toThrow(QuantityImportNotImportableError);
    expect(calls.methods).not.toContain('importBatch');
  });

  it('el payload RPC re-derivado preserva provenance y vincula SOLO exactos', async () => {
    const { repo, calls } = makeRepo(baseState());
    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, VERSION_ID, { repository: repo });

    const result = await confirmQuantityImport(viewer, file, preview.digest, {
      linkVersionId: VERSION_ID,
    }, { repository: repo });

    const payload = calls.rpcPayloads[0]!;
    expect(payload.batch.digestSha256).toBe(preview.digest);
    expect(payload.batch.sourceSheet).toBe('CANTIDADES 1 PISO');
    expect(payload.batch.unresolvedCount).toBe(2); // suggested + unresolved
    expect(payload.versionId).toBe(VERSION_ID);

    // Vínculo SOLO en grupos linked; suggested/unresolved van sin boqItemId.
    const byDesc = (d: string) => payload.groups.find((g) => g.description.includes(d))!;
    expect(byDesc('Demolición').boqItemId).toBe('00000000-0000-4000-8000-0000000000c1');
    expect(byDesc('Excavación').boqItemId).toBeNull(); // suggested
    expect(byDesc('Viga').boqItemId).toBeNull(); // unresolved

    // Provenance §11: fila de origen, occurrence, raw_values con fórmula.
    const p01 = byDesc('Demolición');
    expect(p01.sourceRow).toBe(5);
    expect(p01.occurrenceIndex).toBe(1);
    expect(p01.totalCalculated).toBe('19.68');
    expect(p01.lines.map((l) => l.sortOrder)).toEqual([0, 1]);
    expect(p01.lines[0]!.sourceRow).toBe(5);
    expect(p01.lines[0]!.formulaType).toBe('length_height_count');
    expect(p01.lines[0]!.subtotalCalculated).toBe('10.08');
    expect(p01.lines[0]!.rawValues['formula']).toBe('(E5*G5)*H5');

    // Occurrence index 1-based en duplicados (9.01×2 → c4 y c5).
    const aseos = payload.groups.filter((g) => g.description.includes('Aseo'));
    expect(aseos.map((g) => g.occurrenceIndex)).toEqual([1, 2]);
    expect(new Set(aseos.map((g) => g.boqItemId)).size).toBe(2);

    expect(result.duplicate).toBe(false);
    expect(result.groupsCreated).toBe(6);
    expect(result.linesCreated).toBe(11);
    expect(result.linkedBoqItems).toBe(4);
    expect(result.rows.every((r) => r.importStatus === 'created')).toBe(true);
  });

  it('digest repetido ⇒ duplicate informativo, filas omitidas sin re-vincular', async () => {
    const { repo } = makeRepo({
      ...baseState(),
      rpcResult: {
        duplicate: true,
        groupsCreated: 0,
        linesCreated: 0,
        linkedBoqItems: 0,
        linkedItems: [],
      },
    });
    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, VERSION_ID, { repository: repo });
    const result = await confirmQuantityImport(viewer, file, preview.digest, {
      linkVersionId: VERSION_ID,
    }, { repository: repo });
    expect(result.duplicate).toBe(true);
    expect(result.groupsCreated).toBe(0);
    expect(result.rows.every((r) => r.importStatus === 'omitted')).toBe(true);
    expect(result.rows.every((r) => r.linkStatus === 'not_evaluated')).toBe(true);
    expect(result.rows[0]!.messages.some((m) => m.includes('ya fue importado'))).toBe(true);
  });

  it('vínculo decidido pero no aplicado por la RPC ⇒ skipped_existing (carrera)', async () => {
    // La RPC re-verifica bajo transacción: simula que el ítem de P-01 (fila 5)
    // fue tomado por otro batch entre preview y confirmación.
    const { repo } = makeRepo({
      ...baseState(),
      rpcResult: {
        linkedBoqItems: 3,
        linkedItems: [
          { groupSourceRow: '11', boqItemId: '00000000-0000-4000-8000-0000000000c3' },
          { groupSourceRow: '21', boqItemId: '00000000-0000-4000-8000-0000000000c4' },
          { groupSourceRow: '23', boqItemId: '00000000-0000-4000-8000-0000000000c5' },
        ],
      },
    });
    const file = takeoffWorkbookFile();
    const preview = await previewQuantityImport(viewer, file, VERSION_ID, { repository: repo });
    const result = await confirmQuantityImport(viewer, file, preview.digest, {
      linkVersionId: VERSION_ID,
    }, { repository: repo });
    const p01 = result.rows.find((r) => r.description.includes('Demolición'))!;
    expect(p01.linkStatus).toBe('skipped_existing');
    const bc01 = result.rows.find((r) => r.description.includes('Contrapiso'))!;
    expect(bc01.linkStatus).toBe('linked');
  });
});

describe('buildQuantityReportCsv — reporte sanitizado (§9)', () => {
  it('neutraliza prefijos peligrosos y escapa separadores (anti formula-injection)', async () => {
    const { repo } = makeRepo({ boqCandidates: [] });
    const cells: CellSpec[] = [
      ...standardTakeoffCells(),
      // Grupo con descripción hostil que intenta inyectar una fórmula.
      [26, 'A', 'X-01'], [26, 'B', 11.01], [26, 'C', '=HYPERLINK("http://x", "ver")'],
      [26, 'D', 'M²'], [26, 'E', 2], [26, 'H', 1], [26, 'I', 2, 'E26*H26'],
      [27, 'I', 2, 'SUM(I26)'],
    ];
    const file = takeoffWorkbookFile(cells);
    const preview = await previewQuantityImport(viewer, file, null, { repository: repo });
    const result = await confirmQuantityImport(viewer, file, preview.digest, {
      linkVersionId: null,
    }, { repository: repo });

    const lines = result.reportCsv.split('\r\n');
    expect(lines[0]).toContain('Vínculo BOQ');
    const hostile = lines.find((l) => l.includes('HYPERLINK'))!;
    expect(hostile).toBeDefined();
    // El prefijo "=" queda neutralizado con apóstrofo y el campo va entrecomillado.
    expect(hostile).toContain(`"'=HYPERLINK`);
    expect(result.reportCsv).toBe(buildQuantityReportCsv(result.rows));
  });
});
