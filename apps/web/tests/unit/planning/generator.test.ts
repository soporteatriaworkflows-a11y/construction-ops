/**
 * generator.test.ts — Generador de cronograma desde BOQ (SCHEDULE_FROM_BOQ_V1, Fase 3).
 * Propiedad: agent-orchestrator. Dominio PURO (sin DB).
 *
 * Cubre los casos del mandato: preview no escribe/no muta, genera capítulos y
 * actividades, omite cantidad 0, conserva snapshots, vincula BOQ/APU, warnings
 * sin APU / sin rendimiento, duración mínima, y el estimador de duración.
 */
import { describe, it, expect } from 'vitest';
import {
  buildScheduleFromBoqPreview,
  estimateActivityDuration,
  type GeneratorChapterInput,
  type GeneratorItemInput,
  type GeneratorOptions,
} from '@/modules/planning';

const CH1 = '00000000-0000-4000-8000-0000000000c1';
const CH2 = '00000000-0000-4000-8000-0000000000c2';
const I1 = '00000000-0000-4000-8000-000000000101';
const I2 = '00000000-0000-4000-8000-000000000102';
const I3 = '00000000-0000-4000-8000-000000000103';
const APU1 = '00000000-0000-4000-8000-0000000000a1';

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.values(obj).forEach((v) => deepFreeze(v));
    Object.freeze(obj);
  }
  return obj;
}

function baseOptions(over: Partial<GeneratorOptions> = {}): GeneratorOptions {
  return {
    scheduleName: 'Cronograma base',
    startDate: '2026-07-01',
    includeChapters: true,
    onlyPositiveQuantity: true,
    includeItemsWithoutApu: true,
    createChapterMilestones: false,
    minDurationDays: 1,
    defaultCrewSize: '1',
    ...over,
  };
}

const chapters: GeneratorChapterInput[] = [
  { id: CH1, code: '01', name: 'Preliminares', sortOrder: 0 },
  { id: CH2, code: '02', name: 'Acabados', sortOrder: 1 },
];

/** I1: APU usable (0.2 persona·días/unidad). I2: APU sin rendimiento. I3: sin APU. */
const ITEM1: GeneratorItemInput = {
  boqItemId: I1,
  chapterId: CH1,
  code: 'ITM-1',
  description: 'Excavación manual',
  unit: 'm3',
  quantity: '100',
  apuTemplateId: APU1,
  apuLaborPersonDaysPerUnit: '0.2',
};
const ITEM2: GeneratorItemInput = {
  boqItemId: I2,
  chapterId: CH2,
  code: 'ITM-2',
  description: 'Suministro material',
  unit: 'und',
  quantity: '50',
  apuTemplateId: APU1,
  apuLaborPersonDaysPerUnit: '0', // APU sin rendimiento usable
};
const ITEM3: GeneratorItemInput = {
  boqItemId: I3,
  chapterId: CH2,
  code: 'ITM-3',
  description: 'Actividad sin APU',
  unit: 'gl',
  quantity: '1',
  apuTemplateId: null,
  apuLaborPersonDaysPerUnit: null,
};
const items: GeneratorItemInput[] = [ITEM1, ITEM2, ITEM3];

describe('estimateActivityDuration', () => {
  it('deriva duración del rendimiento APU: ceil(qty × días/unidad / crew)', () => {
    const est = estimateActivityDuration(ITEM1, {
      minDurationDays: 1,
      defaultCrewSize: '2',
    });
    // 100 × 0.2 / 2 = 10
    expect(est.durationDays).toBe(10);
    expect(est.productivitySource).toBe('apu');
    expect(est.warning).toBeNull();
  });

  it('crew_size editable cambia la duración (crew 1 ⇒ 20 días)', () => {
    const est = estimateActivityDuration(ITEM1, {
      minDurationDays: 1,
      defaultCrewSize: '1',
    });
    expect(est.durationDays).toBe(20);
  });

  it('redondea hacia arriba sin inventar fracciones', () => {
    const est = estimateActivityDuration(
      { ...ITEM1, quantity: '10', apuLaborPersonDaysPerUnit: '0.25' },
      { minDurationDays: 1, defaultCrewSize: '1' },
    );
    // 10 × 0.25 = 2.5 ⇒ ceil ⇒ 3
    expect(est.durationDays).toBe(3);
  });

  it('sin APU ⇒ duración mínima + source manual + warning no_apu', () => {
    const est = estimateActivityDuration(ITEM3, {
      minDurationDays: 4,
      defaultCrewSize: '1',
    });
    expect(est.durationDays).toBe(4);
    expect(est.productivitySource).toBe('manual');
    expect(est.warning).toBe('no_apu');
  });

  it('APU sin rendimiento usable ⇒ mínima + source unknown + warning no_rendimiento', () => {
    const est = estimateActivityDuration(ITEM2, {
      minDurationDays: 2,
      defaultCrewSize: '1',
    });
    expect(est.durationDays).toBe(2);
    expect(est.productivitySource).toBe('unknown');
    expect(est.warning).toBe('no_rendimiento');
  });

  it('nunca por debajo de la duración mínima', () => {
    const est = estimateActivityDuration(
      { ...ITEM1, quantity: '1', apuLaborPersonDaysPerUnit: '0.1' },
      { minDurationDays: 5, defaultCrewSize: '1' },
    );
    // 1 × 0.1 = 0.1 ⇒ ceil 1 ⇒ acotado a mínimo 5
    expect(est.durationDays).toBe(5);
  });
});

describe('buildScheduleFromBoqPreview', () => {
  it('preview no muta las entradas (BOQ/APU/quantities intactos)', () => {
    const frozenChapters = deepFreeze(structuredClone(chapters));
    const frozenItems = deepFreeze(structuredClone(items));
    const snapshotItems = structuredClone(items);
    expect(() =>
      buildScheduleFromBoqPreview({
        chapters: frozenChapters,
        items: frozenItems,
        options: baseOptions(),
      }),
    ).not.toThrow();
    // Las entradas siguen exactamente iguales (no se mutó cantidad/unidad/APU).
    expect(frozenItems).toEqual(snapshotItems);
  });

  it('genera capítulos como tareas resumen (task_type=chapter)', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions(),
    });
    const chaps = pv.tasks.filter((t) => t.taskType === 'chapter');
    expect(chaps.map((c) => c.name).sort()).toEqual(['Acabados', 'Preliminares']);
    expect(chaps.every((c) => c.boqItemId === null && c.quantitySnapshot === null)).toBe(true);
    expect(pv.stats.chapterCount).toBe(2);
  });

  it('genera ítems BOQ como actividades (task_type=activity)', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions(),
    });
    const acts = pv.tasks.filter((t) => t.taskType === 'activity');
    expect(acts).toHaveLength(3);
    expect(pv.stats.activityCount).toBe(3);
  });

  it('omite ítems con cantidad 0 cuando onlyPositiveQuantity está activo', () => {
    const withZero: GeneratorItemInput[] = [
      ...items,
      {
        boqItemId: '00000000-0000-4000-8000-000000000104',
        chapterId: CH1,
        code: 'ITM-0',
        description: 'Cantidad cero',
        unit: 'm2',
        quantity: '0',
        apuTemplateId: APU1,
        apuLaborPersonDaysPerUnit: '0.2',
      },
    ];
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items: withZero,
      options: baseOptions({ onlyPositiveQuantity: true }),
    });
    expect(pv.tasks.some((t) => t.name === 'Cantidad cero')).toBe(false);
    expect(pv.stats.omittedZeroQuantity).toBe(1);

    const pv2 = buildScheduleFromBoqPreview({
      chapters,
      items: withZero,
      options: baseOptions({ onlyPositiveQuantity: false }),
    });
    expect(pv2.tasks.some((t) => t.name === 'Cantidad cero')).toBe(true);
  });

  it('conserva quantity_snapshot y unit_snapshot del BOQ', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions(),
    });
    const a1 = pv.tasks.find((t) => t.boqItemId === I1)!;
    expect(a1.quantitySnapshot).toBe('100');
    expect(a1.unitSnapshot).toBe('m3');
  });

  it('vincula boq_item_id en cada actividad', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions(),
    });
    const ids = pv.tasks
      .filter((t) => t.taskType === 'activity')
      .map((t) => t.boqItemId)
      .sort();
    expect(ids).toEqual([I1, I2, I3].sort());
  });

  it('vincula apu_template_id cuando el ítem lo tiene (y null si no)', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions(),
    });
    expect(pv.tasks.find((t) => t.boqItemId === I1)!.apuTemplateId).toBe(APU1);
    expect(pv.tasks.find((t) => t.boqItemId === I3)!.apuTemplateId).toBeNull();
  });

  it('emite warning para ítem sin APU', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions(),
    });
    const w = pv.warnings.filter((x) => x.kind === 'no_apu');
    expect(w).toHaveLength(1);
    expect(w[0]!.boqItemId).toBe(I3);
    expect(pv.stats.activitiesWithoutApu).toBe(1);
  });

  it('emite warning para APU sin rendimiento usable', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions(),
    });
    const w = pv.warnings.filter((x) => x.kind === 'no_rendimiento');
    expect(w).toHaveLength(1);
    expect(w[0]!.boqItemId).toBe(I2);
    expect(pv.stats.activitiesWithoutRendimiento).toBe(1);
  });

  it('aplica la duración mínima a actividades sin rendimiento', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions({ minDurationDays: 3 }),
    });
    const a2 = pv.tasks.find((t) => t.boqItemId === I2)!; // APU sin rendimiento
    const a3 = pv.tasks.find((t) => t.boqItemId === I3)!; // sin APU
    expect(a2.durationDays).toBe(3);
    expect(a3.durationDays).toBe(3);
    expect(a2.productivitySource).toBe('unknown');
    expect(a3.productivitySource).toBe('manual');
  });

  it('marca productivity_source=apu y deriva duración cuando hay rendimiento', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions({ defaultCrewSize: '2' }),
    });
    const a1 = pv.tasks.find((t) => t.boqItemId === I1)!;
    expect(a1.productivitySource).toBe('apu');
    expect(a1.durationDays).toBe(10); // 100 × 0.2 / 2
    expect(a1.crewSize).toBe('2');
    expect(pv.stats.activitiesWithApu).toBe(1);
  });

  it('calcula plannedEnd inclusivo (start + duration - 1) desde el startDate', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions({ defaultCrewSize: '1' }),
    });
    const a1 = pv.tasks.find((t) => t.boqItemId === I1)!;
    // 100 × 0.2 / 1 = 20 días ⇒ 2026-07-01 .. 2026-07-20
    expect(a1.plannedStart).toBe('2026-07-01');
    expect(a1.plannedEnd).toBe('2026-07-20');
  });

  it('omite ítems sin APU cuando includeItemsWithoutApu=false', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions({ includeItemsWithoutApu: false }),
    });
    expect(pv.tasks.some((t) => t.boqItemId === I3)).toBe(false);
    expect(pv.stats.omittedWithoutApu).toBe(1);
  });

  it('crea hito de cierre por capítulo cuando se solicita', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions({ createChapterMilestones: true }),
    });
    const ms = pv.tasks.filter((t) => t.taskType === 'milestone');
    expect(ms.length).toBe(2);
    expect(ms.every((m) => m.isMilestone && m.durationDays === 0 && m.plannedStart === m.plannedEnd)).toBe(true);
  });

  it('no emite capítulos vacíos (todas sus actividades omitidas)', () => {
    const onlyCh2: GeneratorItemInput[] = items.filter((i) => i.chapterId === CH2);
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items: onlyCh2,
      options: baseOptions(),
    });
    expect(pv.tasks.some((t) => t.taskType === 'chapter' && t.chapterId === CH1)).toBe(false);
    expect(pv.tasks.some((t) => t.taskType === 'chapter' && t.chapterId === CH2)).toBe(true);
  });

  it('asigna wbs_code únicos por capítulo/actividad con prefijo opcional', () => {
    const pv = buildScheduleFromBoqPreview({
      chapters,
      items,
      options: baseOptions({ wbsPrefix: 'S1-' }),
    });
    const codes = pv.tasks.map((t) => t.wbsCode);
    expect(new Set(codes).size).toBe(codes.length); // todos únicos
    expect(codes).toContain('S1-01');
    expect(codes).toContain('S1-01.001');
  });
});
