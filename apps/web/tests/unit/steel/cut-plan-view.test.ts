/**
 * cut-plan-view.test.ts — F8C-A: compresión de la revisión del plan de corte.
 * Filtros puros (varilla/longitud/estado/búsqueda), índice compacto y
 * guardas estáticas de la UI (scroll interno, sticky header, colapso).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCutPlanIndex,
  commercialLengthsInPlan,
  EMPTY_CUT_PLAN_FILTER,
  filterCutPlanGroups,
  filterOffcuts,
  type CutPlanGroupLike,
} from '@/lib/steel/cut-plan-view';
import type { SteelOffcut } from '@/modules/steel';

function bar(id: string, commercialLengthM: string, cutIds: string[]): CutPlanGroupLike['bars'][number] {
  return {
    id,
    steelSpecId: id.split('|')[0] ?? id,
    commercialLengthM,
    assignments: cutIds.map((cutId) => ({ cutId, lengthM: '1.5' })),
    remainingLengthM: '0.5',
    offcutStatus: 'available',
  } as unknown as CutPlanGroupLike['bars'][number];
}

const GROUPS: readonly CutPlanGroupLike[] = [
  {
    specId: 'spec-rebar-3',
    specLabel: 'Varilla corrugada #3',
    bars: [bar('spec-rebar-3|1', '6', ['l1#1', 'l1#2']), bar('spec-rebar-3|2', '12', ['l2#1'])],
  },
  {
    specId: 'spec-rebar-5',
    specLabel: 'Varilla corrugada #5',
    bars: [bar('spec-rebar-5|1', '12', ['l3#1'])],
  },
];

const DESCRIPTIONS = new Map([
  ['l1', '2x153E#3184'],
  ['l2', 'estribos viga VC-EJE-3'],
  ['l3', '5#5600 zapata'],
]);

const OFFCUTS: readonly SteelOffcut[] = [
  { id: 'off-1', steelSpecId: 'spec-rebar-3', lengthM: '2.1', status: 'available', sourceCutPlanBarId: 'b1' },
  { id: 'off-2', steelSpecId: 'spec-rebar-5', lengthM: '1.2', status: 'reserved', sourceCutPlanBarId: 'b2' },
] as unknown as readonly SteelOffcut[];

describe('F8C-A — filtros puros del plan de corte', () => {
  it('sin filtros muestra todo; el array original queda intacto', () => {
    const visible = filterCutPlanGroups(GROUPS, EMPTY_CUT_PLAN_FILTER, DESCRIPTIONS);
    expect(visible.length).toBe(2);
    expect(GROUPS[0]?.bars.length).toBe(2);
  });

  it('filtrar por varilla reduce las filas visibles sin destruir datos', () => {
    const visible = filterCutPlanGroups(
      GROUPS,
      { ...EMPTY_CUT_PLAN_FILTER, specIds: ['spec-rebar-3'] },
      DESCRIPTIONS,
    );
    expect(visible.length).toBe(1);
    expect(visible[0]?.specId).toBe('spec-rebar-3');
    expect(GROUPS.length).toBe(2);
  });

  it('filtra por longitud comercial exacta', () => {
    const visible = filterCutPlanGroups(
      GROUPS,
      { ...EMPTY_CUT_PLAN_FILTER, commercialLengthM: '12' },
      DESCRIPTIONS,
    );
    expect(visible.flatMap((g) => g.bars).every((b) => String(b.commercialLengthM) === '12')).toBe(true);
    expect(visible.flatMap((g) => g.bars).length).toBe(2);
  });

  it('la búsqueda matchea por descripción de la línea de origen', () => {
    const visible = filterCutPlanGroups(
      GROUPS,
      { ...EMPTY_CUT_PLAN_FILTER, search: 'vc-eje-3' },
      DESCRIPTIONS,
    );
    expect(visible.length).toBe(1);
    expect(visible[0]?.bars[0]?.id).toBe('spec-rebar-3|2');
  });

  it('modo "solo sobrantes" oculta los grupos; "solo rechazados" oculta sobrantes', () => {
    expect(filterCutPlanGroups(GROUPS, { ...EMPTY_CUT_PLAN_FILTER, mode: 'solo_sobrantes' }, DESCRIPTIONS)).toEqual([]);
    expect(filterOffcuts(OFFCUTS, { mode: 'solo_rechazados', specIds: [], search: '' })).toEqual([]);
    expect(filterOffcuts(OFFCUTS, { mode: 'solo_sobrantes', specIds: [], search: '' }).length).toBe(2);
  });

  it('filtra sobrantes por spec y búsqueda', () => {
    const bySpec = filterOffcuts(OFFCUTS, { mode: 'todo', specIds: ['spec-rebar-5'], search: '' });
    expect(bySpec.length).toBe(1);
    expect(bySpec[0]?.id).toBe('off-2');
    const bySearch = filterOffcuts(OFFCUTS, { mode: 'todo', specIds: [], search: 'off-1' });
    expect(bySearch.length).toBe(1);
  });

  it('el índice compacto lista varillas + rechazados + sobrantes con conteos', () => {
    const index = buildCutPlanIndex(GROUPS, 2, 5);
    expect(index.map((e) => e.label)).toEqual(['#3', '#5', 'Rechazados', 'Sobrantes']);
    expect(index[0]).toMatchObject({ anchorId: 'plan-group-spec-rebar-3', count: 2 });
    expect(index[2]).toMatchObject({ anchorId: 'plan-rechazados', count: 2 });
    expect(index[3]).toMatchObject({ anchorId: 'plan-sobrantes', count: 5 });
  });

  it('lista las longitudes comerciales presentes en el plan', () => {
    expect(commercialLengthsInPlan(GROUPS)).toEqual(['6', '12']);
  });
});

describe('F8C-A — guardas estáticas de la UI comprimida', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'app', '(dashboard)', 'steel', 'takeoffs', '_components', 'manual-cut-plan-section.tsx'),
    'utf8',
  );

  it('las tablas largas viven en contenedores con scroll interno', () => {
    expect(source).toMatch(/max-h-72 overflow-auto/);
  });

  it('los encabezados de tabla son sticky', () => {
    expect(source).toMatch(/sticky top-0 z-10/);
  });

  it('los grupos por varilla colapsan/expanden con aria-expanded', () => {
    expect(source).toContain('aria-expanded={!collapsed}');
    expect(source).toContain('toggleGroup(');
  });

  it('existen el índice de navegación y los anchors de rechazados/sobrantes', () => {
    expect(source).toContain('plan-rechazados');
    expect(source).toContain('plan-sobrantes');
    expect(source).toContain('Índice del plan de corte');
  });

  it('los filtros usan los helpers puros (no lógica duplicada en la UI)', () => {
    expect(source).toContain('filterCutPlanGroups(');
    expect(source).toContain('filterOffcuts(');
    expect(source).toContain('buildCutPlanIndex(');
  });
});
