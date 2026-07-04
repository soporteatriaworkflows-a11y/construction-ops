import type { SteelCutInput, SteelLineInput } from '@/modules/steel';

export const steelLineFixtures: readonly SteelLineInput[] = [
  {
    id: 'fixture-rebar-5',
    originalDescription: '5#5600',
    steelFamily: 'rebar',
    steelShape: 'straight',
    barNumber: 5,
    cutLengthM: '6',
    quantityPerUnit: '5',
    repetitions: '1',
  },
  {
    id: 'fixture-stirrup-3',
    originalDescription: '74E#3200',
    steelFamily: 'rebar',
    steelShape: 'stirrup',
    barNumber: 3,
    cutLengthM: '2',
    quantityPerUnit: '74',
    repetitions: '1',
  },
];

export const cutFixtures: readonly SteelCutInput[] = [
  {
    id: 'c1',
    lengthM: '6',
    quantity: '1',
    steelSpecId: 'default-rebar-#5',
    steelFamily: 'rebar',
    barNumber: 5,
    treatment: 'none',
  },
  {
    id: 'c2',
    lengthM: '3',
    quantity: '2',
    steelSpecId: 'default-rebar-#5',
    steelFamily: 'rebar',
    barNumber: 5,
    treatment: 'none',
  },
];

