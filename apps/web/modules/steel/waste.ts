import type { DecimalString } from '@/lib/utils/types';

import { toDecimal, toDecimalString } from './decimal';
import { defaultSteelWasteThresholds } from './specs';
import type { SteelFamily, SteelWasteThreshold, SteelWasteThresholds } from './types';

export function calculateAssumedWasteMl(totalMl: DecimalString, wastePct: DecimalString): DecimalString {
  if (toDecimal(wastePct).isNegative()) {
    throw new Error('El porcentaje de desperdicio no puede ser negativo');
  }
  return toDecimalString(toDecimal(totalMl).times(toDecimal(wastePct)).div(100));
}

export function calculateWastePct(totalMl: DecimalString, wasteMl: DecimalString): DecimalString {
  if (toDecimal(totalMl).isZero()) {
    return '0';
  }
  return toDecimalString(toDecimal(wasteMl).div(toDecimal(totalMl)).times(100));
}

export function getWasteThreshold(
  family: SteelFamily,
  thresholds: SteelWasteThresholds = defaultSteelWasteThresholds,
): SteelWasteThreshold {
  return family === 'structural_steel' ? thresholds.structuralSteel : thresholds.rebar;
}

export function classifyWasteSeverity(
  family: SteelFamily,
  wastePct: DecimalString,
  thresholds: SteelWasteThresholds = defaultSteelWasteThresholds,
): 'ok' | 'warning' | 'critical' {
  const threshold = getWasteThreshold(family, thresholds);
  const pct = toDecimal(wastePct);
  if (pct.gte(toDecimal(threshold.criticalPct))) {
    return 'critical';
  }
  if (pct.gte(toDecimal(threshold.warningPct))) {
    return 'warning';
  }
  return 'ok';
}

