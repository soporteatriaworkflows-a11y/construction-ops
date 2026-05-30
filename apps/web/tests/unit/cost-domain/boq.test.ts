/**
 * boq.test.ts — BOQ ítem, capítulo, costos directos.
 * Propiedad: agent-cost-domain.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateBoqItemSubtotal,
  calculateChapterTotal,
  calculateDirectCosts,
  calculateBoq,
  type BoqItemInput,
} from '@/modules/boq';

describe('calculateBoqItemSubtotal', () => {
  it('subtotal = cantidad × precio', () => {
    expect(
      calculateBoqItemSubtotal({ quantitySnapshot: '120', unitPriceSnapshot: '83341.875' }),
    ).toBe('10001025');
  });

  it('cantidad cero ⇒ subtotal 0', () => {
    expect(
      calculateBoqItemSubtotal({ quantitySnapshot: '0', unitPriceSnapshot: '83341.875' }),
    ).toBe('0');
  });

  it('rechaza cantidad negativa', () => {
    expect(() =>
      calculateBoqItemSubtotal({ quantitySnapshot: '-1', unitPriceSnapshot: '100' }),
    ).toThrow();
  });
});

describe('capítulos y costos directos', () => {
  const items: BoqItemInput[] = [
    { chapterId: 'C1', quantitySnapshot: '10', unitPriceSnapshot: '100' }, // 1000
    { chapterId: 'C1', quantitySnapshot: '2', unitPriceSnapshot: '250' }, // 500
    { chapterId: 'C2', quantitySnapshot: '5', unitPriceSnapshot: '400' }, // 2000
  ];

  it('subtotal de capítulo = Σ ítems del capítulo', () => {
    expect(calculateChapterTotal(['1000', '500'])).toBe('1500');
  });

  it('costos directos = Σ todos los ítems', () => {
    expect(calculateDirectCosts(['1000', '500', '2000'])).toBe('3500');
  });

  it('calculateBoq agrupa por capítulo y suma directos', () => {
    const r = calculateBoq(items);
    expect(r.itemSubtotals).toEqual(['1000', '500', '2000']);
    expect(r.chapterSubtotals).toEqual([
      { chapterId: 'C1', subtotal: '1500' },
      { chapterId: 'C2', subtotal: '2000' },
    ]);
    expect(r.directCosts).toBe('3500');
  });

  it('es pura: no muta el arreglo de entrada', () => {
    const snap = JSON.stringify(items);
    calculateBoq(items);
    expect(JSON.stringify(items)).toBe(snap);
  });
});
