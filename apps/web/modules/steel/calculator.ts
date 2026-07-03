import { toDecimal, toDecimalString } from './decimal';
import type { SteelCalculatedLine, SteelLineInput, SteelSpec } from './types';
import { calculateAssumedWasteMl } from './waste';

export function calculateSteelLine(input: SteelLineInput, spec?: SteelSpec): SteelCalculatedLine {
  const cutLengthM = input.cutLengthM ?? '0';
  const pieces = toDecimal(input.quantityPerUnit).times(toDecimal(input.repetitions));
  const totalMl = toDecimalString(toDecimal(cutLengthM).times(pieces));
  const unitWeightKgM = input.unitWeightKgMSnapshot ?? spec?.unitWeightKgM ?? '0';
  const totalKg = toDecimalString(toDecimal(totalMl).times(toDecimal(unitWeightKgM)));
  const commercialLengthM = input.commercialLengthM ?? spec?.commercialLengthsM[0];
  const commercialUnitsRequired = commercialLengthM
    ? toDecimalString(toDecimal(totalMl).div(toDecimal(commercialLengthM)).ceil())
    : undefined;
  const estimatedCost = input.unitPriceSnapshot
    ? toDecimalString(toDecimal(totalKg).times(toDecimal(input.unitPriceSnapshot)))
    : undefined;
  const estimatedWasteMl =
    input.wasteMode === 'assumed' || input.assumedWastePct
      ? calculateAssumedWasteMl(totalMl, input.assumedWastePct ?? '0')
      : undefined;

  return {
    ...input,
    unitWeightKgMSnapshot: unitWeightKgM,
    commercialLengthM,
    totalMl,
    totalKg,
    commercialUnitsRequired,
    estimatedCost,
    estimatedWasteMl,
  };
}

export function lineInputFromParsed(
  id: string,
  parsed: {
    originalDescription: string;
    steelFamily: SteelLineInput['steelFamily'];
    steelShape: SteelLineInput['steelShape'];
    barNumber?: number;
    cutLengthM?: string;
    quantityPerUnit: string;
    repetitions: string;
    spacingCm?: string;
    confidenceScore?: string;
    needsReview?: boolean;
  },
): SteelLineInput {
  return {
    id,
    originalDescription: parsed.originalDescription,
    steelFamily: parsed.steelFamily,
    steelShape: parsed.steelShape,
    barNumber: parsed.barNumber,
    cutLengthM: parsed.cutLengthM,
    quantityPerUnit: parsed.quantityPerUnit,
    repetitions: parsed.repetitions,
    spacingCm: parsed.spacingCm,
    confidenceScore: parsed.confidenceScore,
    verificationStatus: parsed.needsReview ? 'needs_review' : 'unreviewed',
  };
}

