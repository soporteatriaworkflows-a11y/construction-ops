/**
 * import-service.test.ts — Import batch (T21–T27) y lista de precios (T28–T36)
 * (CATALOG_BULK_ONBOARDING_V1). Sin red ni DB real: Supabase mockeado con un
 * stub thenable que registra tablas, filtros e inserts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  previewCatalogImport,
  confirmCatalogImport,
  previewProviderPriceList,
  confirmProviderPriceList,
  CatalogImportNotSupportedError,
  CatalogImportProviderNotFoundError,
  DbCatalogImportRepository,
} from '@/server/catalog/import';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type { AuthenticatedViewer } from '@/server/catalog/types';

// ---------------------------------------------------------------------------
// Stub de Supabase: chain thenable que registra operaciones.
// ---------------------------------------------------------------------------

interface InsertRecord {
  table: string;
  rows: Array<Record<string, unknown>>;
}

interface MockState {
  resources: Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    external_sku: string | null;
    external_reference: string | null;
  }>;
  suppliers: Array<{ id: string; name: string }>;
  inserts: InsertRecord[];
  eqFilters: Array<{ table: string; column: string; value: unknown }>;
  tablesTouched: Set<string>;
}

function makeState(): MockState {
  return {
    resources: [],
    suppliers: [],
    inserts: [],
    eqFilters: [],
    tablesTouched: new Set(),
  };
}

let idSeq = 0;

function makeMockClient(state: MockState): SupabaseClient {
  function queryFor(table: string, mode: 'select' | 'insert', insertedRows?: Array<Record<string, unknown>>) {
    const result = () => {
      if (mode === 'insert') {
        const data = (insertedRows ?? []).map((r) => ({
          id: `id-${++idSeq}`,
          code: (r as { code?: string }).code,
        }));
        return { data, error: null };
      }
      if (table === 'resources') return { data: state.resources, error: null };
      if (table === 'suppliers') return { data: state.suppliers, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = chain as unknown as PromiseLike<unknown> & Record<string, (...a: unknown[]) => unknown>;
    for (const m of ['select', 'order', 'range']) {
      chain[m] = () => self;
    }
    chain.eq = (column: string, value: unknown) => {
      state.eqFilters.push({ table, column, value });
      return self;
    };
    chain.maybeSingle = () => {
      const { data } = result() as { data: Array<Record<string, unknown>> };
      const match = data.find((d) =>
        state.eqFilters.every((f) => f.table !== table || d[f.column] === undefined || d[f.column] === f.value),
      );
      return Promise.resolve({ data: match ?? null, error: null });
    };
    chain.single = () => {
      const { data } = result() as { data: Array<Record<string, unknown>> };
      return Promise.resolve({ data: data[0] ?? null, error: data[0] ? null : { code: 'PGRST116' } });
    };
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej);
    return self;
  }

  return {
    from(table: string) {
      state.tablesTouched.add(table);
      return {
        select: () => queryFor(table, 'select'),
        insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          state.inserts.push({ table, rows: arr });
          return queryFor(table, 'insert', arr);
        },
      };
    },
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VIEWER: AuthenticatedViewer = {
  userId: 'user-1',
  profileId: 'profile-1',
  organizationId: 'org-A',
  role: 'management',
};

function csvFile(lines: string[], name = 'catalogo.csv'): File {
  return new File([lines.join('\n')], name, { type: 'text/csv' });
}

function setup(state: MockState) {
  const repository = new DbCatalogImportRepository(async () => makeMockClient(state));
  return { repository };
}

async function previewDigest(file: File, repository: DbCatalogImportRepository): Promise<string> {
  const preview = await previewCatalogImport(VIEWER, file, null, { repository });
  return preview.digest;
}

beforeEach(() => {
  vi.stubEnv('READ_MODEL_SOURCE', 'db');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// IMPORT (T21–T27)
// ---------------------------------------------------------------------------

describe('confirmCatalogImport — batch server-side (T21–T27)', () => {
  it('T21 — crea recursos nuevos con los campos normalizados', async () => {
    const state = makeState();
    const { repository } = setup(state);
    const file = csvFile([
      'code,name,resourceType,unit,marca',
      'MAT-1,Cemento,material,saco,Argos',
      'MO-1,Oficial,mano de obra,dia,',
    ]);
    const digest = await previewDigest(file, repository);
    const result = await confirmCatalogImport(VIEWER, file, null, digest, { repository });

    expect(result.createdCount).toBe(2);
    const resourceInsert = state.inserts.find((i) => i.table === 'resources');
    expect(resourceInsert?.rows).toHaveLength(2);
    expect(resourceInsert?.rows[0]).toMatchObject({
      code: 'MAT-1',
      resource_type: 'material',
      brand: 'Argos',
      active: true,
    });
    expect(resourceInsert?.rows[1]).toMatchObject({ code: 'MO-1', resource_type: 'labor' });
  });

  it('T22 — no sobrescribe existentes: código existente queda skip y NO se inserta', async () => {
    const state = makeState();
    state.resources.push({
      id: 'r-1', code: 'EXIST-1', name: 'Ya estaba', unit: 'und',
      external_sku: null, external_reference: null,
    });
    const { repository } = setup(state);
    const file = csvFile([
      'code,name,resourceType,unit',
      'EXIST-1,Intento de sobrescritura,material,und',
      'NEW-1,Nuevo,material,und',
    ]);
    const digest = await previewDigest(file, repository);
    const result = await confirmCatalogImport(VIEWER, file, null, digest, { repository });

    expect(result.createdCount).toBe(1);
    expect(result.skippedExistingCount).toBe(1);
    const inserted = state.inserts.find((i) => i.table === 'resources')!.rows;
    expect(inserted.map((r) => r.code)).toEqual(['NEW-1']);
    // No hubo UPDATE en ningún momento (el stub solo expone select/insert).
  });

  it('T23 — organizationId SIEMPRE server-side (del viewer, nunca del archivo)', async () => {
    const state = makeState();
    const { repository } = setup(state);
    const file = csvFile(['code,name,resourceType,unit', 'A,Uno,material,und']);
    const digest = await previewDigest(file, repository);
    await confirmCatalogImport(VIEWER, file, null, digest, { repository });

    for (const ins of state.inserts) {
      for (const row of ins.rows) {
        expect(row.organization_id).toBe('org-A');
      }
    }
  });

  it('T24 — created_by server-side en observaciones (profileId del viewer)', async () => {
    const state = makeState();
    const { repository } = setup(state);
    const file = csvFile([
      'code,name,resourceType,unit,precio',
      'A,Uno,material,und,5000',
    ]);
    const digest = await previewDigest(file, repository);
    const result = await confirmCatalogImport(VIEWER, file, null, digest, { repository });

    expect(result.observationsCreated).toBe(1);
    const obs = state.inserts.find((i) => i.table === 'resource_price_observations')!.rows[0]!;
    expect(obs.created_by).toBe('profile-1');
    expect(obs.organization_id).toBe('org-A');
    expect(obs.status).toBe('pending');
  });

  it('T25 — tenant isolation: toda lectura filtra por organization_id del viewer', async () => {
    const state = makeState();
    const { repository } = setup(state);
    const file = csvFile(['code,name,resourceType,unit', 'A,Uno,material,und']);
    await previewCatalogImport(VIEWER, file, null, { repository });

    const orgFilters = state.eqFilters.filter((f) => f.column === 'organization_id');
    expect(orgFilters.length).toBeGreaterThan(0);
    expect(orgFilters.every((f) => f.value === 'org-A')).toBe(true);
  });

  it('T26 — cross-org bloqueado: proveedor de otra org no es visible ⇒ error', async () => {
    const state = makeState(); // sin proveedores visibles para el viewer
    const { repository } = setup(state);
    const file = csvFile(['sku,precio', 'X,100']);
    await expect(
      previewProviderPriceList(VIEWER, 'provider-of-other-org', file, null, { repository }),
    ).rejects.toBeInstanceOf(CatalogImportProviderNotFoundError);
  });

  it('T27 — fixture seguro: READ_MODEL_SOURCE≠db rechaza la importación', async () => {
    vi.stubEnv('READ_MODEL_SOURCE', 'fixture');
    const state = makeState();
    const { repository } = setup(state);
    const file = csvFile(['code,name,resourceType,unit', 'A,Uno,material,und']);
    await expect(
      previewCatalogImport(VIEWER, file, null, { repository }),
    ).rejects.toBeInstanceOf(CatalogImportNotSupportedError);
  });

  it('rol sin permiso (client) ⇒ InsufficientRoleError', async () => {
    const state = makeState();
    const { repository } = setup(state);
    const file = csvFile(['code,name,resourceType,unit', 'A,Uno,material,und']);
    await expect(
      previewCatalogImport({ ...VIEWER, role: 'client' as AuthenticatedViewer['role'] }, file, null, { repository }),
    ).rejects.toBeInstanceOf(InsufficientRoleError);
  });

  it('digest distinto ⇒ confirmación bloqueada', async () => {
    const state = makeState();
    const { repository } = setup(state);
    const file = csvFile(['code,name,resourceType,unit', 'A,Uno,material,und']);
    await expect(
      confirmCatalogImport(VIEWER, file, null, 'deadbeef', { repository }),
    ).rejects.toMatchObject({ code: 'catalog_import_digest' });
  });
});

// ---------------------------------------------------------------------------
// LISTA DE PRECIOS DE PROVEEDOR (T28–T36)
// ---------------------------------------------------------------------------

function priceListState(): MockState {
  const state = makeState();
  state.suppliers.push({ id: 'prov-1', name: 'Decorceramica' });
  state.resources.push(
    { id: 'r-sku', code: 'C-SKU', name: 'Por SKU', unit: 'm2', external_sku: 'SKU-9', external_reference: null },
    { id: 'r-ref', code: 'C-REF', name: 'Por referencia', unit: 'm2', external_sku: null, external_reference: 'REF-7' },
    { id: 'r-code', code: 'C-CODE', name: 'Por código', unit: 'und', external_sku: null, external_reference: null },
  );
  return state;
}

const PL_HEADERS = 'sku,referencia,code,precio,descuento';

describe('confirmProviderPriceList — matching y observaciones (T28–T36)', () => {
  it('T28 — match por SKU externo exacto', async () => {
    const state = priceListState();
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, 'SKU-9,,,169000,8']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    expect(preview.matchedCount).toBe(1);
    expect(preview.rows[0]).toMatchObject({ matchType: 'sku', resourceCode: 'C-SKU' });
  });

  it('T29 — match por referencia externa exacta', async () => {
    const state = priceListState();
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, ',REF-7,,80000,0']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    expect(preview.rows[0]).toMatchObject({ matchType: 'reference', resourceCode: 'C-REF' });
  });

  it('T30 — match por code exacto cuando viene en el archivo', async () => {
    const state = priceListState();
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, ',,C-CODE,55000,']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    expect(preview.rows[0]).toMatchObject({ matchType: 'code', resourceCode: 'C-CODE' });
  });

  it('T31 — sin match queda "Sin asociar": no se crea recurso ni observación', async () => {
    const state = priceListState();
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, 'NO-EXISTE,,,9999,', 'SKU-9,,,169000,']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    expect(preview.unmatchedCount).toBe(1);
    expect(preview.matchedCount).toBe(1);

    const result = await confirmProviderPriceList(VIEWER, 'prov-1', file, null, preview.digest, { repository });
    expect(result.observationsCreated).toBe(1);
    expect(result.unmatchedCount).toBe(1);
    // Nunca se crean recursos desde lista de precios:
    expect(state.inserts.some((i) => i.table === 'resources')).toBe(false);
    // El reporte CSV incluye la fila sin asociar para revisión:
    expect(result.reportCsv).toContain('Sin asociar');
  });

  it('coincidencia ambigua ⇒ "Sin asociar" con motivo (nunca se resuelve en silencio)', async () => {
    const state = priceListState();
    state.resources.push({
      id: 'r-dup', code: 'C-DUP', name: 'Duplicado', unit: 'm2',
      external_sku: 'SKU-9', external_reference: null,
    });
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, 'SKU-9,,,169000,']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    expect(preview.rows[0]!.matchType).toBe('ambiguous');
    expect(preview.unmatchedCount).toBe(1);
  });

  it('T32+T33 — cada precio crea observación pending; NUNCA approved', async () => {
    const state = priceListState();
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, 'SKU-9,,,169000,8', ',REF-7,,80000,0']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    const result = await confirmProviderPriceList(VIEWER, 'prov-1', file, null, preview.digest, { repository });

    expect(result.observationsCreated).toBe(2);
    const obsRows = state.inserts.find((i) => i.table === 'resource_price_observations')!.rows;
    expect(obsRows).toHaveLength(2);
    for (const row of obsRows) {
      expect(row.status).toBe('pending');
      expect(row.supplier_id).toBe('prov-1');
      expect(row.source_type).toBe('supplier_csv');
      expect(row.approved_by).toBeUndefined();
      expect(row.approved_at).toBeUndefined();
    }
  });

  it('T34+T35 — nunca toca BOQ ni AIU: solo tablas de catálogo/pricing', async () => {
    const state = priceListState();
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, 'SKU-9,,,169000,']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    await confirmProviderPriceList(VIEWER, 'prov-1', file, null, preview.digest, { repository });

    // REVIEW_CENTER_V1: la importación registra además el lote de procedencia.
    const allowed = new Set([
      'resources',
      'suppliers',
      'resource_price_observations',
      'price_observation_batches',
    ]);
    for (const t of state.tablesTouched) {
      expect(allowed.has(t)).toBe(true);
    }
    // En particular: jamás boq_items, chapters, estimate_versions ni indirect_cost_rules.
  });

  it('T36 — el invariante de precio neto queda en manos del trigger DB', async () => {
    const state = priceListState();
    const { repository } = setup(state);
    const file = csvFile([PL_HEADERS, 'SKU-9,,,169000,8']);
    const preview = await previewProviderPriceList(VIEWER, 'prov-1', file, null, { repository });
    await confirmProviderPriceList(VIEWER, 'prov-1', file, null, preview.digest, { repository });

    const obs = state.inserts.find((i) => i.table === 'resource_price_observations')!.rows[0]!;
    // El cliente NUNCA envía un neto calculado: placeholder que el trigger
    // BEFORE INSERT (app.set_rpo_suggested_net_price) recalcula SIEMPRE.
    expect(obs.suggested_net_price).toBe(0);
    expect(obs.observed_price).toBe('169000');
    expect(obs.discount_percent).toBe('8');
  });
});
