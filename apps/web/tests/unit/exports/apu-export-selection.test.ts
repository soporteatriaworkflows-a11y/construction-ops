/**
 * apu-export-selection.test.ts — Dominio de selección de export APU
 * (APU_EXPORTS_V1). Casos 1–11 del mandato. Inyecta deps deterministas y usa el
 * fixture real para los caminos por organización.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveBudgetApuExportSelection,
  getBudgetApuExportSelection,
  type ApuExportSelectionDeps,
} from '@/server/estimates/export/apu-annex';
import { EstimateNotFoundError } from '@/server/estimates';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { ViewerContext, ApuDetail } from '@/lib/contracts/read-model';
import type { EstimateExportPayload } from '@/lib/estimates/export-types';
import type { VersionApuLinkRow } from '@/lib/estimates/apu-export-types';

const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const otherOrg: ViewerContext = { organizationId: '00000000-0000-4000-8000-0000000000ff', role: 'management' };
const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const fixtureOpts = { env: { READ_MODEL_SOURCE: 'fixture' as const } };

function payload(status: EstimateExportPayload['version']['status'] = 'draft'): EstimateExportPayload {
  return {
    organizationName: 'Org',
    project: { id: 'p', name: 'Proyecto', city: null },
    scope: { id: 's', name: 'Alcance' },
    estimate: { id: 'e', code: 'PR-01', name: 'Presupuesto', status: 'active' },
    version: { number: 1, label: 'V01', status },
    generatedAt: '2026-06-13T00:00:00.000Z',
    counts: { chapters: 1, items: 2 },
    chapters: [],
    aiu: { administrationRate: '0', contingencyRate: '0', utilityRate: '0', utilityVatRate: '0' },
    financial: {
      directTotal: '0', administrationAmount: '0', contingencyAmount: '0',
      utilityAmount: '0', utilityVatAmount: '0', indirectTotal: '0', grandTotal: '0',
    } as EstimateExportPayload['financial'],
  };
}

function apu(id: string, opts: Partial<ApuDetail> = {}): ApuDetail {
  return {
    id, code: opts.code ?? `APU-${id}`, name: opts.name ?? `Actividad ${id}`,
    unit: 'm2', unitCanonical: 'm²', version: 1, defaultToolPct: '0',
    components: opts.components ?? [],
    unitCostMaterials: '0', unitCostLabor: '0', unitCostEquipment: '0',
    unitCostTools: '0', unitCostToolDerived: '0', unitCostSubcontract: '0', unitCostOther: '0',
    unitCostTotal: opts.unitCostTotal ?? '1000',
    originType: opts.originType ?? 'workbook_import',
    archivedAt: opts.archivedAt ?? null,
    ...opts,
  };
}

function makeDeps(
  links: VersionApuLinkRow[],
  apus: Record<string, ApuDetail>,
  status: EstimateExportPayload['version']['status'] = 'draft',
  calls?: { detail: string[] },
): ApuExportSelectionDeps {
  return {
    getPayload: async () => payload(status),
    getApuLinks: async () => links,
    getApuDetail: async (_v, id) => {
      calls?.detail.push(id);
      const d = apus[id];
      if (!d) throw new Error('not found');
      return d;
    },
  };
}

function link(ch: number, it: number, apuId: string | null): VersionApuLinkRow {
  return {
    chapterCode: `C${ch}`, chapterName: `Cap ${ch}`, chapterSortOrder: ch,
    itemCode: `I${ch}.${it}`, itemDescription: `Item ${ch}.${it}`, itemSortOrder: it,
    apuTemplateId: apuId,
  };
}

describe('APU export selection — dominio', () => {
  it('1. resuelve versión por organización (fixture)', async () => {
    const sel = await getBudgetApuExportSelection(reader, DEMO_ESTIMATE_ID, undefined, fixtureOpts);
    expect(sel.payload.estimate.id).toBe(DEMO_ESTIMATE_ID);
    expect(sel.payload.version.label).toBe('V01');
  });

  it('2. bloquea cross-org', async () => {
    await expect(
      getBudgetApuExportSelection(otherOrg, DEMO_ESTIMATE_ID, undefined, fixtureOpts),
    ).rejects.toBeInstanceOf(EstimateNotFoundError);
  });

  it('3. lista solo BOQ de la versión (conteo = filas)', async () => {
    const sel = await getBudgetApuExportSelection(reader, DEMO_ESTIMATE_ID, undefined, fixtureOpts);
    expect(sel.counts.boqItems).toBe(131);
  });

  it('4. obtiene solo APU vinculados', async () => {
    const deps = makeDeps([link(1, 1, 'a'), link(1, 2, null)], { a: apu('a') });
    const sel = await resolveBudgetApuExportSelection(reader, 'e', undefined, deps);
    expect(sel.linkedApus.map((x) => x.apuTemplateId)).toEqual(['a']);
    expect(sel.counts.linkedApu).toBe(1);
    expect(sel.counts.unlinkedItems).toBe(1);
  });

  it('5. deduplica APU repetidos', async () => {
    const deps = makeDeps(
      [link(1, 1, 'a'), link(1, 2, 'a'), link(2, 1, 'a')],
      { a: apu('a') },
    );
    const sel = await resolveBudgetApuExportSelection(reader, 'e', undefined, deps);
    expect(sel.linkedApus).toHaveLength(1);
    expect(sel.linkedApus[0]!.boqLinks).toHaveLength(3);
  });

  it('6. preserva el orden BOQ (primera aparición)', async () => {
    const deps = makeDeps(
      [link(1, 1, 'b'), link(1, 2, 'a'), link(2, 1, 'c')],
      { a: apu('a'), b: apu('b'), c: apu('c') },
    );
    const sel = await resolveBudgetApuExportSelection(reader, 'e', undefined, deps);
    expect(sel.linkedApus.map((x) => x.apuTemplateId)).toEqual(['b', 'a', 'c']);
  });

  it('7. excluye APU no usados (solo pide los vinculados)', async () => {
    const calls = { detail: [] as string[] };
    const deps = makeDeps([link(1, 1, 'a')], { a: apu('a'), z: apu('z') }, 'draft', calls);
    await resolveBudgetApuExportSelection(reader, 'e', undefined, deps);
    expect(calls.detail).toEqual(['a']); // jamás pide 'z'
  });

  it('8. maneja presupuesto sin APU vinculados (fixture)', async () => {
    const sel = await getBudgetApuExportSelection(reader, DEMO_ESTIMATE_ID, undefined, fixtureOpts);
    expect(sel.counts.linkedApu).toBe(0);
    expect(sel.linkedApus).toHaveLength(0);
  });

  it('9. APU archivado: excluido en versión editable, incluido en emitida', async () => {
    const archived = { a: apu('a', { archivedAt: '2026-06-10T00:00:00Z' }) };
    const editable = await resolveBudgetApuExportSelection(
      reader, 'e', undefined, makeDeps([link(1, 1, 'a')], archived, 'draft'),
    );
    expect(editable.linkedApus).toHaveLength(0);
    expect(editable.counts.archivedExcluded).toBe(1);

    const issued = await resolveBudgetApuExportSelection(
      reader, 'e', undefined, makeDeps([link(1, 1, 'a')], archived, 'issued'),
    );
    expect(issued.linkedApus).toHaveLength(1);
    expect(issued.counts.archivedIncluded).toBe(1);
    expect(issued.linkedApus[0]!.archived).toBe(true);
  });

  it('10. APU incompleto (costo cero) se incluye con advertencia', async () => {
    const deps = makeDeps([link(1, 1, 'a')], { a: apu('a', { unitCostTotal: '0' }) });
    const sel = await resolveBudgetApuExportSelection(reader, 'e', undefined, deps);
    expect(sel.linkedApus).toHaveLength(1);
    expect(sel.linkedApus[0]!.incomplete).toBe(true);
    expect(sel.counts.incomplete).toBe(1);
  });

  it('11. no muta los datos de entrada', async () => {
    const links = [link(1, 1, 'a'), link(1, 2, 'a')];
    const snapshot = JSON.stringify(links);
    const deps = makeDeps(links, { a: apu('a') });
    await resolveBudgetApuExportSelection(reader, 'e', undefined, deps);
    expect(JSON.stringify(links)).toBe(snapshot);
  });
});
