/**
 * version-compare.test.ts — Comparación PURA de versiones (4E.3B) + fuente UI.
 *
 * Cubre resumen financiero/deltas, clasificación de capítulos e ítems, matching
 * por ocurrencia con desempate determinístico y duplicateCodeWarning, base cero.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeVersionComparison } from '@/server/estimates';
import type { VersionSnapshot, CompareItemInput } from '@/server/estimates/compare';
import type { FinancialSummary } from '@/lib/estimates/aiu-types';

function fin(direct: string, grand: string, admin = '0', cont = '0', util = '0', vat = '0', indirect = '0'): FinancialSummary {
  return {
    directTotal: direct, administrationAmount: admin, contingencyAmount: cont,
    utilityAmount: util, utilityVatAmount: vat, indirectTotal: indirect, grandTotal: grand,
  };
}
function item(p: Partial<CompareItemInput> & { id: string; chapterCode: string; code: string }): CompareItemInput {
  return {
    description: 'd', unit: 'm3', quantity: '1', unitPrice: '1', subtotal: '1',
    archived: false, sortOrder: 0, ...p,
  };
}
function snap(versionNumber: number, chapters: VersionSnapshot['chapters'], items: CompareItemInput[], financial: FinancialSummary): VersionSnapshot {
  return { ref: { id: `v${versionNumber}`, versionNumber, status: 'draft' }, financial, chapters, items };
}

const CH = (code: string, subtotal: string, extra: Partial<VersionSnapshot['chapters'][number]> = {}) => ({
  code, name: `Cap ${code}`, archived: false, subtotal, sortOrder: Number(code) || 0, ...extra,
});

describe('4E.3B — comparación financiera', () => {
  it('totales iguales ⇒ delta cero y % "0"', () => {
    const base = snap(1, [CH('11', '100')], [item({ id: 'a', chapterCode: '11', code: '11.01', subtotal: '100', quantity: '1', unitPrice: '100' })], fin('100', '100'));
    const r = computeVersionComparison('e1', base, base);
    expect(r.financial.directTotal.delta).toBe('0');
    expect(r.financial.grandTotal.delta).toBe('0');
    expect(r.chapters[0]!.status).toBe('unchanged');
  });
  it('cambio de cantidad ⇒ delta correcto', () => {
    const base = snap(1, [CH('11', '100')], [item({ id: 'a', chapterCode: '11', code: '11.01', quantity: '1', unitPrice: '100', subtotal: '100' })], fin('100', '119'));
    const target = snap(2, [CH('11', '200')], [item({ id: 'a', chapterCode: '11', code: '11.01', quantity: '2', unitPrice: '100', subtotal: '200' })], fin('200', '238'));
    const r = computeVersionComparison('e1', base, target);
    expect(r.financial.directTotal.delta).toBe('100');
    expect(r.financial.grandTotal.delta).toBe('119');
    expect(r.chapters[0]!.items[0]!.status).toBe('changed');
    expect(r.chapters[0]!.items[0]!.subtotalDelta).toBe('100');
  });
  it('base cero ⇒ deltaPct null (sin división por cero)', () => {
    const base = snap(1, [], [], fin('0', '0'));
    const target = snap(2, [CH('11', '50')], [item({ id: 'a', chapterCode: '11', code: '11.01', subtotal: '50' })], fin('50', '50'));
    const r = computeVersionComparison('e1', base, target);
    expect(r.financial.directTotal.deltaPct).toBeNull();
    expect(r.financial.directTotal.delta).toBe('50');
  });
  it('% calculado cuando base != 0', () => {
    const base = snap(1, [CH('11', '100')], [item({ id: 'a', chapterCode: '11', code: '11.01', subtotal: '100' })], fin('100', '100'));
    const target = snap(2, [CH('11', '150')], [item({ id: 'a', chapterCode: '11', code: '11.01', subtotal: '150' })], fin('150', '150'));
    const r = computeVersionComparison('e1', base, target);
    expect(r.financial.directTotal.deltaPct).toBe('50');
  });
});

describe('4E.3B — capítulos', () => {
  const baseItems = [item({ id: 'a', chapterCode: '11', code: '11.01', subtotal: '100' })];
  it('added / removed / unchanged / changed', () => {
    const base = snap(1, [CH('11', '100')], baseItems, fin('100', '100'));
    const target = snap(2, [CH('11', '100'), CH('12', '50')], [...baseItems, item({ id: 'b', chapterCode: '12', code: '12.01', subtotal: '50' })], fin('150', '150'));
    const r = computeVersionComparison('e1', base, target);
    const byCode = Object.fromEntries(r.chapters.map((c) => [c.code, c]));
    expect(byCode['11']!.status).toBe('unchanged');
    expect(byCode['12']!.status).toBe('added');
    expect(byCode['12']!.subtotalDelta).toBe('50');
    // Inverso ⇒ removed.
    const r2 = computeVersionComparison('e1', target, base);
    expect(Object.fromEntries(r2.chapters.map((c) => [c.code, c]))['12']!.status).toBe('removed');
  });
});

describe('4E.3B — ítems + ocurrencia', () => {
  it('added/removed/changed por qty/price/desc/unit + archived', () => {
    const base = snap(1, [CH('11', '10')], [
      item({ id: 'a', chapterCode: '11', code: '11.01', quantity: '1', unitPrice: '10', subtotal: '10', description: 'X', unit: 'm3' }),
      item({ id: 'b', chapterCode: '11', code: '11.02', subtotal: '5', archived: false }),
    ], fin('10', '10'));
    const target = snap(2, [CH('11', '20')], [
      item({ id: 'a', chapterCode: '11', code: '11.01', quantity: '2', unitPrice: '10', subtotal: '20', description: 'Y', unit: 'un' }),
      item({ id: 'c', chapterCode: '11', code: '11.03', subtotal: '7' }),
    ], fin('20', '20'));
    const r = computeVersionComparison('e1', base, target);
    const items = r.chapters[0]!.items;
    const byCode = Object.fromEntries(items.map((i) => [i.code, i]));
    expect(byCode['11.01']!.status).toBe('changed');
    expect(byCode['11.01']!.quantity).toEqual({ base: '1', target: '2' });
    expect(byCode['11.01']!.description).toEqual({ base: 'X', target: 'Y' });
    expect(byCode['11.01']!.unit).toEqual({ base: 'm3', target: 'un' });
    expect(byCode['11.02']!.status).toBe('removed');
    expect(byCode['11.03']!.status).toBe('added');
  });
  it('archived cambia ⇒ archivedChanged + changed', () => {
    const base = snap(1, [CH('11', '10')], [item({ id: 'a', chapterCode: '11', code: '11.01', subtotal: '10', archived: false })], fin('10', '10'));
    const target = snap(2, [CH('11', '0')], [item({ id: 'a', chapterCode: '11', code: '11.01', subtotal: '10', archived: true })], fin('0', '0'));
    const r = computeVersionComparison('e1', base, target);
    const it = r.chapters[0]!.items[0]!;
    expect(it.archivedChanged).toBe(true);
    expect(it.archived).toEqual({ base: false, target: true });
    expect(it.status).toBe('changed');
  });
  it('códigos repetidos ⇒ matching por sort_order, occurrenceIndex y duplicateCodeWarning', () => {
    const base = snap(1, [CH('11', '30')], [
      item({ id: 'b2', chapterCode: '11', code: '11.01', sortOrder: 1, subtotal: '20', quantity: '2', unitPrice: '10' }),
      item({ id: 'a1', chapterCode: '11', code: '11.01', sortOrder: 0, subtotal: '10', quantity: '1', unitPrice: '10' }),
    ], fin('30', '30'));
    const target = snap(2, [CH('11', '40')], [
      item({ id: 'd2', chapterCode: '11', code: '11.01', sortOrder: 1, subtotal: '30', quantity: '3', unitPrice: '10' }),
      item({ id: 'c1', chapterCode: '11', code: '11.01', sortOrder: 0, subtotal: '10', quantity: '1', unitPrice: '10' }),
    ], fin('40', '40'));
    const r = computeVersionComparison('e1', base, target);
    expect(r.duplicateCodeWarning).toBe(true);
    const items = r.chapters[0]!.items;
    const occ1 = items.find((i) => i.occurrenceIndex === 1)!;
    const occ2 = items.find((i) => i.occurrenceIndex === 2)!;
    // occ1 = sort_order 0 en ambas (10→10) sin cambios; occ2 = sort_order 1 (20→30) changed.
    expect(occ1.status).toBe('unchanged');
    expect(occ2.status).toBe('changed');
    expect(occ2.subtotalDelta).toBe('10');
    expect(items.every((i) => i.duplicateCodeWarning)).toBe(true);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const base = resolve(here, '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]');
const read = (rel: string) => readFileSync(resolve(base, rel), 'utf8');

describe('4E.3B — fuente UI', () => {
  it('compare page: selectores base/target + resumen + capítulos + aviso repetido', () => {
    const src = read('compare/page.tsx');
    expect(src).toMatch(/name="base"/);
    expect(src).toMatch(/name="target"/);
    expect(src).toMatch(/Resumen financiero/);
    expect(src).toMatch(/Capítulos/);
    expect(src).toMatch(/Código repetido: comparación emparejada por orden/);
    expect(src).toMatch(/compareEstimateVersions\(/);
  });
  it('version-panel: enlace Comparar versiones', () => {
    const src = read('version-panel.tsx');
    expect(src).toMatch(/Comparar versiones/);
  });
});
