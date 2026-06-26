/**
 * quote-workspace-apu.test.ts — Filtro/indicador "Sin APU" + deep-link del
 * asistente (UX_QUOTING_COMPANION_WORKSPACE_FOCUS_AND_DOCKING_V1). Pure + source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  applyApuFilter,
  itemApuState,
  APU_FILTER_LABELS,
  APU_STATE_LABELS,
  type VisibleWorkspaceChapter,
} from '@/lib/estimates/workspace-view';
import { quoteHrefs } from '@/lib/quote/quote-progress';
import { STEP_GUIDE } from '@/lib/quote/quote-guidance';
import type { BoqItemReviewView, ChapterReviewItem } from '@/lib/estimates/review-types';

function item(id: string, apuTemplateId: string | null | undefined): BoqItemReviewView {
  return {
    id, code: id, description: id, unit: 'un', quantity: '1', unitPrice: '0', subtotal: '0',
    sortOrder: 0, sourceCode: null, sourceRow: null, archived: false, apuTemplateId,
  };
}
function chapter(): ChapterReviewItem {
  return { id: 'c1', code: 'C1', name: 'Cap', sortOrder: 0, itemCount: 0, subtotal: '0', sourceCode: null, sourceRow: null, archived: false };
}
function view(items: BoqItemReviewView[]): VisibleWorkspaceChapter[] {
  return [{ chapter: chapter(), items, matchedByChapter: true }];
}

describe('itemApuState — honesto (1, 4)', () => {
  it('uuid → linked; null → unlinked; undefined → unknown', () => {
    expect(itemApuState(item('a', 'apu-1'))).toBe('linked');
    expect(itemApuState(item('b', null))).toBe('unlinked');
    expect(itemApuState(item('c', undefined))).toBe('unknown');
  });
  it('labels textuales por estado', () => {
    expect(APU_STATE_LABELS.linked).toBe('APU vinculado');
    expect(APU_STATE_LABELS.unlinked).toBe('Sin APU');
    expect(APU_STATE_LABELS.unknown).toBe('No verificable');
  });
});

describe('applyApuFilter — filtro Sin APU (2)', () => {
  it('without → solo ítems sin APU (uuid=null); unknown no aparece', () => {
    const v = view([item('a', 'apu-1'), item('b', null), item('c', undefined)]);
    const without = applyApuFilter(v, 'without');
    expect(without[0]?.items.map((i) => i.id)).toEqual(['b']);
  });
  it('with → solo vinculados', () => {
    const v = view([item('a', 'apu-1'), item('b', null)]);
    expect(applyApuFilter(v, 'with')[0]?.items.map((i) => i.id)).toEqual(['a']);
  });
  it('all → todos; oculta capítulos vacíos tras filtrar', () => {
    const v = view([item('a', 'apu-1')]);
    expect(applyApuFilter(v, 'all')).toHaveLength(1);
    expect(applyApuFilter(view([item('a', 'apu-1')]), 'without')).toHaveLength(0);
  });
  it('APU_FILTER_LABELS incluye "Sin APU"', () => {
    expect(APU_FILTER_LABELS.without).toBe('Sin APU');
  });
});

describe('deep-link del asistente (6)', () => {
  it('quoteHrefs expone workspace con filtro ?apu=missing', () => {
    const h = quoteHrefs({ projectId: 'p1', scopeId: 's1', versionId: 'v1' });
    expect(h.workspaceApuMissing).toBe('/projects/p1/scopes/s1/estimates/v1/workspace?apu=missing');
  });
});

describe('guía APU menciona el filtro (5)', () => {
  it('whatToDoNow menciona el filtro “Sin APU”', () => {
    expect(STEP_GUIDE.apu.whatToDoNow).toMatch(/Sin APU/);
    expect(STEP_GUIDE.apu.primaryActionLabel).toMatch(/sin APU/i);
  });
});

describe('V3C operations: KPIs + panel de detalle + selección (sin perder columnas)', () => {
  const WS = readFileSync(
    fileURLToPath(
      new URL('../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx', import.meta.url),
    ),
    'utf8',
  );

  it('banda de KPIs operativos (Capítulos/Partidas/Con APU/Sin APU/Sin cantidad/Sin precio)', () => {
    expect(WS).toContain('<OpsKpi');
    for (const l of ['Capítulos', 'Partidas', 'Con APU', 'Sin APU', 'Sin cantidad', 'Sin precio']) {
      expect(WS).toContain(`label="${l}"`);
    }
  });

  it('panel de detalle de la partida seleccionada con próxima acción y acciones semánticas', () => {
    expect(WS).toContain('<ItemDetailPanel');
    expect(WS).toContain('Próxima acción');
    expect(WS).toMatch(/Ver APU|Ver partidas sin APU/);
    expect(WS).toContain('Edición completa');
  });

  it('selección de partida (estado UI), sin tocar lógica', () => {
    expect(WS).toContain('selectedItemId');
    expect(WS).toContain('onSelectItem');
  });

  it('NO se pierden columnas técnicas (Cantidad/V/Unitario/Subtotal siguen en el header)', () => {
    expect(WS).toContain('>Cantidad<');
    expect(WS).toContain('>V/Unitario<');
    expect(WS).toContain('>Subtotal<');
  });
});

describe('restyle V3: chip "sin APU" accionable en la toolbar', () => {
  it('el workspace muestra el conteo "sin APU" que activa el filtro', () => {
    const WS = readFileSync(
      fileURLToPath(
        new URL('../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx', import.meta.url),
      ),
      'utf8',
    );
    expect(WS).toMatch(/itemsWithoutApu > 0 && apuFilter !== 'without'/);
    expect(WS).toContain("onClick={() => setApuFilter('without')}");
    expect(WS).toMatch(/sin APU/);
  });
});

describe('?apu=missing activa el filtro en el workspace (3)', () => {
  it('la página mapea apu=missing → without', () => {
    const PAGE = readFileSync(
      fileURLToPath(
        new URL('../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx', import.meta.url),
      ),
      'utf8',
    );
    expect(PAGE).toMatch(/apuParam === 'missing' \? 'without'/);
    expect(PAGE).toContain('initialApuFilter={initialApuFilter}');
  });
});
