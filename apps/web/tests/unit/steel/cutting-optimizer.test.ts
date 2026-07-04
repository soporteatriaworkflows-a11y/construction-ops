import { describe, expect, it } from 'vitest';

import { optimizeSteelCutsFFD } from '@/modules/steel';
import { cutFixtures } from './fixtures';

describe('steel cutting optimizer FFD', () => {
  it('asigna cortes de forma determinista y explica cada decision', () => {
    const plan = optimizeSteelCutsFFD(cutFixtures, {
      commercialLengthsM: ['12'],
      kerfM: '0',
      minimumUsefulOffcutM: '0.5',
    });

    expect(plan.rejectedCuts).toEqual([]);
    expect(plan.bars).toHaveLength(1);
    const bar = plan.bars[0]!;
    expect(bar.assignments.map((assignment) => assignment.cutId)).toEqual(['c1', 'c2#1', 'c2#2']);
    expect(bar.assignments.every((assignment) => assignment.reason.length > 0)).toBe(true);
    expect(plan.totalWasteM).toBe('0');
  });

  it('crea sobrantes available cuando superan el minimo util', () => {
    const plan = optimizeSteelCutsFFD(
      [
        {
          id: 'c1',
          lengthM: '5',
          quantity: '1',
          steelSpecId: 'default-rebar-#4',
          steelFamily: 'rebar',
          barNumber: 4,
          treatment: 'none',
        },
      ],
      {
        commercialLengthsM: ['6'],
        minimumUsefulOffcutM: '0.5',
      },
    );

    const bar = plan.bars[0]!;
    expect(bar.remainingLengthM).toBe('1');
    expect(bar.offcutStatus).toBe('available');
    expect(plan.offcuts).toContainEqual(
      expect.objectContaining({ lengthM: '1', status: 'available' }),
    );
  });

  it('rechaza cortes mayores a cualquier longitud comercial', () => {
    const plan = optimizeSteelCutsFFD(
      [
        {
          id: 'too-long',
          lengthM: '13',
          quantity: '1',
          steelSpecId: 'default-rebar-#5',
          steelFamily: 'rebar',
          barNumber: 5,
          treatment: 'none',
        },
      ],
      {
        commercialLengthsM: ['12'],
      },
    );

    expect(plan.bars).toHaveLength(0);
    expect(plan.rejectedCuts).toEqual([
      expect.objectContaining({ cutId: 'too-long' }),
    ]);
  });

  it('no mezcla specs incompatibles', () => {
    const plan = optimizeSteelCutsFFD(
      [
        {
          id: 'a',
          lengthM: '3',
          quantity: '1',
          steelSpecId: 'default-rebar-#3',
          steelFamily: 'rebar',
          barNumber: 3,
          treatment: 'none',
        },
        {
          id: 'b',
          lengthM: '3',
          quantity: '1',
          steelSpecId: 'default-rebar-#4',
          steelFamily: 'rebar',
          barNumber: 4,
          treatment: 'none',
        },
      ],
      {
        commercialLengthsM: ['6'],
      },
    );

    expect(plan.bars).toHaveLength(2);
  });
});
