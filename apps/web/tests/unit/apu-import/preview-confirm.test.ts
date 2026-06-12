/**
 * preview-confirm.test.ts — PREVIEW e IMPORT del importador APU
 * (mandato 4B.2, pruebas 21–36). Servicio con repositorio simulado: NO toca
 * base de datos; valida el contrato server-side (org/usuario server-side,
 * digest, idempotencia, no-sobrescritura, no-autoaprobación).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmApuImport,
  previewApuImport,
} from '@/server/apu-import/service';
import {
  ApuImportDigestMismatchError,
  ApuImportNotImportableError,
  ApuSuggestionRejectedError,
} from '@/server/apu-import/errors';
import type {
  ApuBatchRpcPayload,
  ApuBatchRpcResult,
  DbApuImportRepository,
} from '@/server/apu-import/db-repository';
import type { BoqCandidateItem, ExistingLaborRole } from '@/server/apu-import/preview';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import {
  activitiesHeaderCells,
  resourceIdentifiers,
  salaryBlockCells,
  standardActivityCells,
  workbookFile,
} from './helpers';

const viewer: AuthenticatedViewer = {
  userId: '00000000-0000-4000-8000-00000000aa01',
  profileId: '00000000-0000-4000-8000-00000000aa02',
  organizationId: '00000000-0000-4000-8000-00000000aa03',
  role: 'management',
};

interface MockState {
  identifiers: ResourceIdentifier[];
  laborRoles: ExistingLaborRole[];
  apuCodes: Set<string>;
  boqCandidates: BoqCandidateItem[];
  rpcResult?: Partial<ApuBatchRpcResult>;
}

function makeRepo(state: MockState) {
  const calls: {
    viewers: AuthenticatedViewer[];
    rpcPayloads: ApuBatchRpcPayload[];
    createdRoles: Array<{ codeBase: string; name: string }>;
    methods: string[];
  } = { viewers: [], rpcPayloads: [], createdRoles: [], methods: [] };

  const repo = {
    source: 'db' as const,
    async listResourceIdentifiers(v: AuthenticatedViewer) {
      calls.viewers.push(v);
      calls.methods.push('listResourceIdentifiers');
      return state.identifiers;
    },
    async listLaborRoles(v: AuthenticatedViewer) {
      calls.viewers.push(v);
      calls.methods.push('listLaborRoles');
      return state.laborRoles;
    },
    async listExistingApuCodes(v: AuthenticatedViewer) {
      calls.viewers.push(v);
      calls.methods.push('listExistingApuCodes');
      return state.apuCodes;
    },
    async getApprovedBaselinePrices() {
      calls.methods.push('getApprovedBaselinePrices');
      return new Map<string, string>();
    },
    async listLinkableVersions() {
      calls.methods.push('listLinkableVersions');
      return [];
    },
    async listBoqCandidates() {
      calls.methods.push('listBoqCandidates');
      return state.boqCandidates;
    },
    async createLaborRole(_v: AuthenticatedViewer, input: { codeBase: string; name: string }) {
      calls.methods.push('createLaborRole');
      calls.createdRoles.push({ codeBase: input.codeBase, name: input.name });
      return input.codeBase === 'S-OFICIAL'
        ? '00000000-0000-4000-8000-00000000bb01'
        : '00000000-0000-4000-8000-00000000bb02';
    },
    async importBatch(v: AuthenticatedViewer, payload: ApuBatchRpcPayload) {
      calls.viewers.push(v);
      calls.methods.push('importBatch');
      calls.rpcPayloads.push(payload);
      return {
        duplicate: false,
        batchId: '00000000-0000-4000-8000-00000000cc01',
        importedActivities: payload.templates.length,
        importedComponents: payload.templates.reduce((n, t) => n + t.components.length, 0),
        linkedBoqItems: payload.links.length,
        skippedExisting: 0,
        skippedCodes: [],
        templateIds: {},
        linkedItems: payload.links.map((l) => ({ ...l })),
        ...state.rpcResult,
      } satisfies ApuBatchRpcResult;
    },
  };
  return { repo: repo as unknown as DbApuImportRepository, calls };
}

function standardFile() {
  return workbookFile([
    {
      name: 'APU',
      cells: [
        ...salaryBlockCells(),
        ...activitiesHeaderCells(25),
        ...standardActivityCells(26),
        ...standardActivityCells(40, {
          code: 'P-02',
          description: 'Actividad sin material conocido',
          materialDescription: 'Material inexistente XYZ',
        }),
      ],
    },
  ]);
}

const baseState = (): MockState => ({
  identifiers: resourceIdentifiers() as ResourceIdentifier[],
  laborRoles: [],
  apuCodes: new Set(),
  boqCandidates: [],
});

beforeEach(() => {
  vi.stubEnv('READ_MODEL_SOURCE', 'db');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('apu-import preview (21–25)', () => {
  // (21) conteos correctos.
  it('21. el resumen reporta conteos correctos', async () => {
    const { repo } = makeRepo(baseState());
    const preview = await previewApuImport(viewer, standardFile(), null, { repository: repo });
    expect(preview.totals.activities).toBe(2);
    expect(preview.totals.components).toBe(4);
    expect(preview.totals.suggested).toBe(1); // Cemento gris ⇒ sugerencia
    expect(preview.totals.unresolved).toBe(1); // Material inexistente XYZ
    expect(preview.totals.readyToImport).toBe(2);
    expect(preview.totals.criticalErrors).toBe(0);
    expect(preview.importable).toBe(true);
  });

  // (22) diferencias de costo visibles.
  it('22. la diferencia recalculado vs Excel es visible por actividad', async () => {
    const { repo } = makeRepo(baseState());
    const file = workbookFile([
      {
        name: 'APU',
        cells: [
          ...salaryBlockCells(),
          ...activitiesHeaderCells(25),
          ...standardActivityCells(26, { excelTotalOverride: 99999 }),
        ],
      },
    ]);
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    const activity = preview.activities[0]!;
    expect(activity.excelTotal).toBe('99999');
    expect(activity.recalculatedTotal).toBe('12478.47');
    expect(Number(activity.costDelta)).toBeCloseTo(12478.47 - 99999, 6);
    expect(activity.warnings.some((w) => w.includes('difiere del Excel'))).toBe(true);
  });

  // (23) advertencias visibles.
  it('23. las advertencias del análisis son visibles en preview (totales y por actividad)', async () => {
    const { repo } = makeRepo(baseState());
    const file = workbookFile([
      {
        name: 'APU',
        cells: [
          ...salaryBlockCells(),
          ...activitiesHeaderCells(25),
          ...standardActivityCells(26, { excelTotalOverride: 99999 }),
        ],
      },
    ]);
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    expect(preview.totals.warnings).toBeGreaterThan(0);
    expect(preview.activities[0]!.warnings.length).toBeGreaterThan(0);
    expect(preview.laborRoles.every((r) => Array.isArray(r.warnings))).toBe(true);
  });

  // (24) errores críticos bloquean confirmación.
  it('24. un workbook sin header de actividades bloquea la confirmación', async () => {
    const { repo } = makeRepo(baseState());
    const file = workbookFile([{ name: 'APU', cells: [[1, 'A', 'sin header']] }]);
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    expect(preview.blockingErrors.length).toBeGreaterThan(0);
    expect(preview.importable).toBe(false);
    await expect(
      confirmApuImport(viewer, file, preview.digest, {
        linkVersionId: null,
        acceptedSuggestions: [],
      }, { repository: repo }),
    ).rejects.toThrow(ApuImportNotImportableError);
  });

  // (25) sugerencias no se confirman solas.
  it('25. una sugerencia NO aceptada queda sin recurso; el acepte inválido se rechaza', async () => {
    const { repo, calls } = makeRepo(baseState());
    const file = standardFile();
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    const suggested = preview.activities[0]!.components.find((c) => c.match === 'suggested')!;

    // Confirmación SIN acepte: el componente va sin resourceId.
    await confirmApuImport(viewer, file, preview.digest, {
      linkVersionId: null,
      acceptedSuggestions: [],
    }, { repository: repo });
    const payload = calls.rpcPayloads[0]!;
    const material = payload.templates[0]!.components.find((c) => c.componentType === 'material')!;
    expect(material.resourceId).toBeNull();

    // Acepte que NO coincide con la sugerencia re-derivada ⇒ rechazo.
    await expect(
      confirmApuImport(viewer, file, preview.digest, {
        linkVersionId: null,
        acceptedSuggestions: [
          { componentKey: suggested.key, resourceId: '00000000-0000-4000-8000-0000000000b2' },
        ],
      }, { repository: repo }),
    ).rejects.toThrow(ApuSuggestionRejectedError);

    // Acepte VÁLIDO (== sugerencia del servidor) ⇒ asociado con source resource.
    await confirmApuImport(viewer, file, preview.digest, {
      linkVersionId: null,
      acceptedSuggestions: [
        { componentKey: suggested.key, resourceId: suggested.resourceId! },
      ],
    }, { repository: repo });
    const payload2 = calls.rpcPayloads[calls.rpcPayloads.length - 1]!;
    const material2 = payload2.templates[0]!.components.find(
      (c) => c.componentType === 'material',
    )!;
    expect(material2.resourceId).toBe(suggested.resourceId);
    expect(material2.unitPriceSource).toBe('resource');
  });
});

describe('apu-import confirmación (26–36)', () => {
  // (26/27) organización y usuario server-side.
  it('26/27. organizationId y userId JAMÁS viajan en el payload (derivados server-side por RLS)', async () => {
    const { repo, calls } = makeRepo(baseState());
    const file = standardFile();
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    await confirmApuImport(viewer, file, preview.digest, {
      linkVersionId: null,
      acceptedSuggestions: [],
    }, { repository: repo });
    const payload = calls.rpcPayloads[0]!;
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(viewer.organizationId);
    expect(serialized).not.toContain(viewer.profileId);
    expect(serialized).not.toContain(viewer.userId);
    // Todas las lecturas usaron el viewer resuelto server-side.
    expect(calls.viewers.every((v) => v.organizationId === viewer.organizationId)).toBe(true);
  });

  it('roles no autorizados (site/client) son rechazados', async () => {
    const { repo } = makeRepo(baseState());
    for (const role of ['site', 'client'] as const) {
      await expect(
        previewApuImport({ ...viewer, role }, standardFile(), null, { repository: repo }),
      ).rejects.toThrow(InsufficientRoleError);
    }
  });

  // (28) idempotencia por digest.
  it('28. digest distinto al del preview ⇒ rechazo; RPC duplicate ⇒ resultado idempotente', async () => {
    const state = baseState();
    const { repo } = makeRepo(state);
    const file = standardFile();
    await expect(
      confirmApuImport(viewer, file, 'f'.repeat(64), {
        linkVersionId: null,
        acceptedSuggestions: [],
      }, { repository: repo }),
    ).rejects.toThrow(ApuImportDigestMismatchError);

    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    const dupState = {
      ...state,
      rpcResult: {
        duplicate: true,
        importedActivities: 2,
        importedComponents: 4,
        linkedBoqItems: 0,
        skippedExisting: 0,
      },
    };
    const { repo: dupRepo } = makeRepo(dupState);
    const result = await confirmApuImport(viewer, file, preview.digest, {
      linkVersionId: null,
      acceptedSuggestions: [],
    }, { repository: dupRepo });
    expect(result.duplicate).toBe(true);
    expect(result.rows.every((r) => r.importStatus === 'omitted')).toBe(true);
    expect(result.rows[0]!.messages.some((m) => m.includes('ya fue importado'))).toBe(true);
  });

  // (29/30/31) templates + components creados con raw values.
  it('29/30/31. el payload crea templates y componentes con raw values y provenance', async () => {
    const { repo, calls } = makeRepo(baseState());
    const file = standardFile();
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    const result = await confirmApuImport(viewer, file, preview.digest, {
      linkVersionId: null,
      acceptedSuggestions: [],
    }, { repository: repo });
    const payload = calls.rpcPayloads[0]!;
    expect(payload.templates).toHaveLength(2);
    const template = payload.templates[0]!;
    expect(template.code).toBe('P-01');
    expect(template.defaultToolPct).toBe('0.35');
    expect(template.sourceRow).toBe(26);
    // Cuadrilla expandida: material + 2 filas labor (ayudante/oficial).
    expect(template.components).toHaveLength(3);
    const material = template.components.find((c) => c.componentType === 'material')!;
    expect(material.rawCode).toBe('Insumo');
    expect(material.rawUnit).toBe('Un');
    expect(material.sourceRow).toBe(27);
    const laborRows = template.components.filter((c) => c.componentType === 'labor');
    expect(laborRows).toHaveLength(2);
    expect(laborRows.every((c) => c.laborRoleId !== null)).toBe(true);
    expect(laborRows.every((c) => c.unitPriceSource === 'labor_role')).toBe(true);
    // El payload NO lleva subtotales (los recalcula la RPC server-side).
    expect(JSON.stringify(payload)).not.toContain('totalComponentCost');
    expect(result.importedActivities).toBe(2);
    expect(result.importedComponents).toBe(6);
    // Roles creados desde el bloque salarial (no existían).
    expect(calls.createdRoles.map((r) => r.codeBase).sort()).toEqual([
      'S-AYUDANTE',
      'S-OFICIAL',
    ]);
  });

  // (32) no sobrescribe.
  it('32. un código de plantilla existente queda como skip (jamás update)', async () => {
    const state = baseState();
    state.apuCodes = new Set(['P-01']);
    const { repo, calls } = makeRepo(state);
    const file = standardFile();
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    const activity = preview.activities[0]!;
    expect(activity.importAction).toBe('skip_existing');
    expect(activity.warnings.some((w) => w.includes('no se sobrescribe'))).toBe(true);
    await confirmApuImport(viewer, file, preview.digest, {
      linkVersionId: null,
      acceptedSuggestions: [],
    }, { repository: repo });
    const payload = calls.rpcPayloads[0]!;
    const skipped = payload.templates.find((t) => t.code === 'P-01')!;
    // Va en el payload (la RPC re-verifica bajo transacción) pero SIN componentes.
    expect(skipped.components).toEqual([]);
  });

  // (33) no autoaprueba precios. (34) no cambia BOQ qty. (35) no cambia AIU.
  // (36) no cambia exports históricos.
  it('33–36. el servicio solo usa métodos de lectura + RPC; sin aprobaciones, sin BOQ qty, sin AIU, sin exports', async () => {
    const { repo, calls } = makeRepo(baseState());
    const file = standardFile();
    const preview = await previewApuImport(viewer, file, null, { repository: repo });
    await confirmApuImport(viewer, file, preview.digest, {
      linkVersionId: null,
      acceptedSuggestions: [],
    }, { repository: repo });
    // Métodos permitidos EXACTOS (no hay approve/update/export en el repositorio).
    const allowed = new Set([
      'listResourceIdentifiers',
      'listLaborRoles',
      'listExistingApuCodes',
      'getApprovedBaselinePrices',
      'listLinkableVersions',
      'listBoqCandidates',
      'createLaborRole',
      'importBatch',
    ]);
    expect(calls.methods.every((m) => allowed.has(m))).toBe(true);
    // El payload no contiene campos de cantidades BOQ, AIU ni precios aprobados.
    const serialized = JSON.stringify(calls.rpcPayloads);
    for (const forbidden of [
      'quantity_snapshot',
      'quantitySnapshot',
      'subtotal',
      'aiu',
      'indirect',
      'approved',
      'observed_price',
      'observedPrice',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
