/**
 * workspace-view.test.ts — Helpers puros del BOQ Workspace (filtro/búsqueda/
 * visibilidad) + desglose por capítulos server-side.
 * Oleada OPERATIONAL BUDGET UX V1.
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  applyWorkspaceView,
  countVisibleItems,
  isVersionEditable,
  normalizeSearch,
  type WorkspaceChapterData,
} from '@/lib/estimates/workspace-view';
import { computeChapterBreakdown } from '@/server/estimates/breakdown';
import type { BoqItemReviewView, ChapterReviewItem } from '@/lib/estimates/review-types';

function chapter(over: Partial<ChapterReviewItem> = {}): ChapterReviewItem {
  return {
    id: 'ch-1', code: 'C01', name: 'Preliminares', sortOrder: 0, itemCount: 2,
    subtotal: '1000', sourceCode: null, sourceRow: null, archived: false,
    ...over,
  };
}

function item(over: Partial<BoqItemReviewView> = {}): BoqItemReviewView {
  return {
    id: 'it-1', code: 'C01-01', description: 'Excavación manual', unit: 'm3',
    quantity: '10', unitPrice: '100', subtotal: '1000', sortOrder: 0,
    sourceCode: null, sourceRow: null, archived: false,
    ...over,
  };
}

const DATA: WorkspaceChapterData[] = [
  {
    chapter: chapter({ id: 'ch-1', code: 'C01', name: 'Preliminares' }),
    items: [
      item({ id: 'a', code: 'C01-01', description: 'Excavación manual' }),
      item({ id: 'b', code: 'C01-02', description: 'Demolición de muros', archived: true }),
    ],
  },
  {
    chapter: chapter({ id: 'ch-2', code: 'C02', name: 'Mampostería' }),
    items: [
      item({ id: 'c', code: 'C02-01', description: 'Muro ladrillo común' }),
    ],
  },
  {
    chapter: chapter({ id: 'ch-3', code: 'C03', name: 'Cubierta', archived: true }),
    items: [item({ id: 'd', code: 'C03-01', description: 'Teja termoacústica' })],
  },
];

describe('applyWorkspaceView — filtros activos/archivados/todos', () => {
  it('active: excluye capítulos archivados e ítems archivados', () => {
    const view = applyWorkspaceView(DATA, 'active', '');
    expect(view.map((v) => v.chapter.id)).toEqual(['ch-1', 'ch-2']);
    expect(view[0]!.items.map((i) => i.id)).toEqual(['a']); // 'b' archivado fuera
    expect(countVisibleItems(view)).toBe(2);
  });

  it('archived: solo nodos archivados (capítulo completo o ítems sueltos)', () => {
    const view = applyWorkspaceView(DATA, 'archived', '');
    expect(view.map((v) => v.chapter.id)).toEqual(['ch-1', 'ch-3']);
    // ch-1 aparece solo por su ítem archivado 'b'.
    expect(view[0]!.items.map((i) => i.id)).toEqual(['b']);
    // ch-3 archivado: todos sus ítems cuentan como archivados.
    expect(view[1]!.items.map((i) => i.id)).toEqual(['d']);
  });

  it('all: muestra todo (capítulos e ítems, activos y archivados)', () => {
    const view = applyWorkspaceView(DATA, 'all', '');
    expect(view).toHaveLength(3);
    expect(countVisibleItems(view)).toBe(4);
  });
});

describe('applyWorkspaceView — búsqueda por código y descripción', () => {
  it('encuentra por código de ítem (case-insensitive)', () => {
    const view = applyWorkspaceView(DATA, 'active', 'c02-01');
    expect(view).toHaveLength(1);
    expect(view[0]!.items.map((i) => i.id)).toEqual(['c']);
  });

  it('encuentra por descripción sin tildes (excavacion ⇒ Excavación)', () => {
    const view = applyWorkspaceView(DATA, 'active', 'excavacion');
    expect(view).toHaveLength(1);
    expect(view[0]!.items.map((i) => i.id)).toEqual(['a']);
  });

  it('coincidencia por capítulo muestra todos sus ítems filtrados', () => {
    const view = applyWorkspaceView(DATA, 'active', 'mamposteria');
    expect(view).toHaveLength(1);
    expect(view[0]!.chapter.id).toBe('ch-2');
    expect(view[0]!.matchedByChapter).toBe(true);
    expect(view[0]!.items).toHaveLength(1);
  });

  it('sin coincidencias ⇒ vista vacía', () => {
    expect(applyWorkspaceView(DATA, 'active', 'zzz-no-existe')).toHaveLength(0);
  });

  it('búsqueda respeta el filtro (archivados no aparecen en active)', () => {
    expect(applyWorkspaceView(DATA, 'active', 'demolicion')).toHaveLength(0);
    const archivedView = applyWorkspaceView(DATA, 'archived', 'demolicion');
    expect(archivedView).toHaveLength(1);
    expect(archivedView[0]!.items.map((i) => i.id)).toEqual(['b']);
  });
});

describe('normalizeSearch / isVersionEditable', () => {
  it('normaliza tildes y mayúsculas', () => {
    expect(normalizeSearch('  MAMPOSTERÍA ')).toBe('mamposteria');
  });
  it('issued/approved/archived son inmutables; draft/review editables', () => {
    expect(isVersionEditable('draft')).toBe(true);
    expect(isVersionEditable('review')).toBe(true);
    expect(isVersionEditable('issued')).toBe(false);
    expect(isVersionEditable('approved')).toBe(false);
    expect(isVersionEditable('archived')).toBe(false);
  });
});

describe('computeChapterBreakdown — desglose por capítulos (server-side)', () => {
  it('participaciones suman ~1 y excluyen capítulos archivados', () => {
    const chapters: ChapterReviewItem[] = [
      chapter({ id: '1', code: 'C01', subtotal: '250', sortOrder: 0 }),
      chapter({ id: '2', code: 'C02', subtotal: '750', sortOrder: 1 }),
      chapter({ id: '3', code: 'C03', subtotal: '999', sortOrder: 2, archived: true }),
    ];
    const { rows, directTotal } = computeChapterBreakdown(chapters);
    expect(directTotal).toBe('1000');
    expect(rows.map((r) => r.chapterId)).toEqual(['1', '2']);
    expect(rows[0]!.share).toBe('0.250000');
    expect(rows[1]!.share).toBe('0.750000');
    const sum = rows.reduce((acc, r) => acc.plus(new Decimal(r.share)), new Decimal(0));
    expect(sum.toNumber()).toBeCloseTo(1, 5);
  });

  it('costo directo cero ⇒ shares "0" sin división por cero', () => {
    const { rows, directTotal } = computeChapterBreakdown([
      chapter({ id: '1', subtotal: '0' }),
      chapter({ id: '2', code: 'C02', subtotal: '0' }),
    ]);
    expect(directTotal).toBe('0');
    expect(rows.every((r) => r.share === '0')).toBe(true);
  });

  it('ordena por sortOrder', () => {
    const { rows } = computeChapterBreakdown([
      chapter({ id: 'b', code: 'C02', sortOrder: 2 }),
      chapter({ id: 'a', code: 'C01', sortOrder: 1 }),
    ]);
    expect(rows.map((r) => r.chapterId)).toEqual(['a', 'b']);
  });
});
