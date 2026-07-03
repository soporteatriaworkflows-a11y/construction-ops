import type { SteelSpec, SteelWasteThresholds } from './types';

const commonCommercialLengths = ['6', '9', '12'] as const;

const rebarWeightsKgM: Record<number, string> = {
  2: '0.249',
  3: '0.560',
  4: '0.994',
  5: '1.552',
  6: '2.235',
  7: '3.042',
  8: '3.973',
  9: '5.060',
  10: '6.404',
  11: '7.907',
  12: '8.938',
  13: '10.655',
  14: '12.159',
  15: '14.072',
  16: '15.890',
  17: '17.819',
  18: '20.076',
};

export const defaultRebarSpecs: readonly SteelSpec[] = Object.entries(rebarWeightsKgM).map(
  ([barNumber, unitWeightKgM]) => ({
    id: `default-rebar-#${barNumber}`,
    family: 'rebar',
    name: `Varilla corrugada #${barNumber}`,
    commercialName: `#${barNumber}`,
    technicalReference: `REBAR-${barNumber}`,
    barNumber: Number(barNumber),
    unitWeightKgM,
    commercialLengthsM: commonCommercialLengths,
    purchaseUnit: 'kg',
    treatment: 'none',
    isDefaultReference: true,
    notes:
      'Referencia inicial revisable para F1. No es catalogo definitivo ni fuente eterna de verdad.',
  }),
);

export const defaultSteelWasteThresholds: SteelWasteThresholds = {
  rebar: {
    warningPct: '8',
    criticalPct: '12',
  },
  structuralSteel: {
    warningPct: '5',
    criticalPct: '8',
  },
};

export function findDefaultRebarSpec(barNumber: number): SteelSpec | undefined {
  return defaultRebarSpecs.find((spec) => spec.barNumber === barNumber);
}

