import { addDecimalStrings, toDecimal, toDecimalString } from './decimal';
import type {
  SteelCutAssignment,
  SteelCutInput,
  SteelCutOptimizerOptions,
  SteelCutPlan,
  SteelCutPlanBar,
  SteelOffcut,
  SteelOffcutStatus,
} from './types';

interface ExpandedCut {
  id: string;
  lengthM: string;
  source: SteelCutInput;
}

export function optimizeSteelCutsFFD(
  cuts: readonly SteelCutInput[],
  options: SteelCutOptimizerOptions,
): SteelCutPlan {
  const commercialLengths = [...options.commercialLengthsM].sort((a, b) => toDecimal(a).cmp(toDecimal(b)));
  const kerfM = options.kerfM ?? '0';
  const minimumUsefulOffcutM = options.minimumUsefulOffcutM ?? '0.3';
  const bars: SteelCutPlanBar[] = [];
  const rejectedCuts: { cutId: string; reason: string }[] = [];
  const expandedCuts = expandCuts(cuts).sort((a, b) => {
    const byLength = toDecimal(b.lengthM).cmp(toDecimal(a.lengthM));
    return byLength !== 0 ? byLength : a.id.localeCompare(b.id);
  });

  for (const cut of expandedCuts) {
    const requiredLength = toDecimalString(toDecimal(cut.lengthM).plus(toDecimal(kerfM)));
    const compatibleLengths = commercialLengths.filter((length) => toDecimal(length).gte(toDecimal(requiredLength)));
    if (compatibleLengths.length === 0) {
      rejectedCuts.push({
        cutId: cut.id,
        reason: `Corte ${cut.lengthM} m excede las longitudes comerciales disponibles.`,
      });
      continue;
    }

    const bestExistingBar = findBestExistingBar(bars, cut, requiredLength);
    if (bestExistingBar) {
      assignCut(bestExistingBar, cut, requiredLength, 'Asignado por best-fit: usa la barra abierta compatible con menor sobrante viable.');
      continue;
    }

    const selectedLength = compatibleLengths[0];
    if (!selectedLength) {
      rejectedCuts.push({
        cutId: cut.id,
        reason: `Corte ${cut.lengthM} m no tiene longitud comercial viable.`,
      });
      continue;
    }
    const newBar: SteelCutPlanBar = {
      id: `bar-${bars.length + 1}`,
      steelSpecId: cut.source.steelSpecId,
      commercialLengthM: selectedLength,
      assignments: [],
      remainingLengthM: selectedLength,
      offcutStatus: 'final_waste',
    };
    assignCut(newBar, cut, requiredLength, 'Abre nueva barra con la menor longitud comercial viable.');
    bars.push(newBar);
  }

  const finalizedBars: SteelCutPlanBar[] = bars.map((bar) => {
    const offcutStatus: SteelOffcutStatus = toDecimal(bar.remainingLengthM).gte(toDecimal(minimumUsefulOffcutM))
      ? 'available'
      : 'final_waste';
    return {
      ...bar,
      offcutStatus,
    };
  });
  const offcuts: SteelOffcut[] = finalizedBars
    .filter((bar) => bar.offcutStatus === 'available')
    .map((bar) => ({
      id: `offcut-${bar.id}`,
      steelSpecId: bar.steelSpecId,
      lengthM: bar.remainingLengthM,
      status: 'available',
      sourceCutPlanBarId: bar.id,
    }));

  return {
    bars: finalizedBars,
    offcuts,
    rejectedCuts,
    totalWasteM: addDecimalStrings(finalizedBars.map((bar) => bar.remainingLengthM)),
  };
}

function expandCuts(cuts: readonly SteelCutInput[]): ExpandedCut[] {
  return cuts.flatMap((cut) => {
    const quantity = toDecimal(cut.quantity);
    if (!quantity.isInteger() || quantity.isNegative()) {
      throw new Error(`Cantidad de corte invalida para ${cut.id}: ${cut.quantity}`);
    }
    return Array.from({ length: quantity.toNumber() }, (_, index) => ({
      id: quantity.eq(1) ? cut.id : `${cut.id}#${index + 1}`,
      lengthM: cut.lengthM,
      source: cut,
    }));
  });
}

function findBestExistingBar(
  bars: readonly SteelCutPlanBar[],
  cut: ExpandedCut,
  requiredLength: string,
): SteelCutPlanBar | undefined {
  return bars
    .filter((bar) => bar.steelSpecId === cut.source.steelSpecId)
    .filter((bar) => toDecimal(bar.remainingLengthM).gte(toDecimal(requiredLength)))
    .sort((a, b) => {
      const remainingA = toDecimal(a.remainingLengthM).minus(toDecimal(requiredLength));
      const remainingB = toDecimal(b.remainingLengthM).minus(toDecimal(requiredLength));
      const byRemaining = remainingA.cmp(remainingB);
      return byRemaining !== 0 ? byRemaining : a.id.localeCompare(b.id);
    })[0];
}

function assignCut(bar: SteelCutPlanBar, cut: ExpandedCut, requiredLength: string, reason: string): void {
  const assignment: SteelCutAssignment = {
    cutId: cut.id,
    lengthM: cut.lengthM,
    reason,
  };
  (bar.assignments as SteelCutAssignment[]).push(assignment);
  bar.remainingLengthM = toDecimalString(toDecimal(bar.remainingLengthM).minus(toDecimal(requiredLength)));
}
