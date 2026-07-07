/**
 * steel-calculation-explanation.ts — "Ver cálculo" (F8D, puro).
 *
 * Genera la explicación LEGIBLE de cómo se calculó una línea del takeoff:
 * texto original → interpretación → cantidad → longitud de corte → fórmula
 * ML → fórmula KG → varillas comerciales → fuente del desperdicio →
 * evidencia. NO calcula nada nuevo: solo presenta, con las fórmulas escritas,
 * los valores que YA produjo el dominio F1 (única calculadora de la app).
 */
import { findDefaultRebarSpec } from '@/modules/steel';
import type { ManualComputedLine } from './manual-takeoff';

export type WasteExplanationSource = 'calculated' | 'manual' | 'assumed';

export interface SteelCalculationExplanation {
  /** Texto original del plano/línea. */
  originalDescription: string;
  /** Interpretación del parser F1. */
  interpretation: string;
  /** Cantidad: piezas por unidad × repeticiones = piezas totales. */
  quantityText: string;
  /** Longitud de corte interpretada. */
  cutLengthText: string;
  /** Fórmula de metros lineales con los valores reemplazados. */
  mlFormula: string;
  /** Fórmula de kilogramos con el peso unitario de la varilla. */
  kgFormula: string;
  /** Fórmula de varillas comerciales, si aplica. */
  commercialFormula?: string;
  /** Fuente del desperdicio (calculado por optimización / factor manual / asumido). */
  wasteText: string;
  /** Evidencia breve (archivo, capa/observación, método, posición). */
  sourceText?: string;
  warnings: readonly string[];
}

function fmt(value: string | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString('es-CO', { maximumFractionDigits: 3 });
}

/**
 * Explica una línea YA calculada. `wasteSource` permite al caller declarar
 * la fuente real del desperdicio del takeoff (plan de corte calculado vs
 * factor manual); sin él se usa la fuente de la propia línea.
 */
export function explainSteelCalculation(
  line: ManualComputedLine,
  options: { wasteSource?: WasteExplanationSource; manualWastePct?: string } = {},
): SteelCalculationExplanation {
  const { parsed, calculated } = line;
  const warnings: string[] = [];

  const pieces = fmt(calculated.quantityPerUnit);
  const repetitions = fmt(calculated.repetitions);
  const totalPieces = fmt(line.totalPieces);
  const quantityText = `${pieces} pieza(s) por unidad × ${repetitions} repetición(es) = ${totalPieces} pieza(s)`;

  const cutLength = calculated.cutLengthM;
  const cutLengthText = cutLength
    ? `${fmt(cutLength)} m por pieza`
    : 'Sin longitud de corte interpretada';
  if (!cutLength) {
    warnings.push('La línea no tiene longitud de corte interpretada: revisa la descripción original.');
  }

  const mlFormula = cutLength
    ? `ML total = piezas totales × longitud de corte = ${totalPieces} × ${fmt(cutLength)} m = ${fmt(calculated.totalMl)} ml`
    : `ML total = ${fmt(calculated.totalMl)} ml (sin longitud de corte la fórmula no aplica)`;

  const spec = line.barNumber ? findDefaultRebarSpec(line.barNumber) : undefined;
  const kgFormula = spec
    ? `KG total = ML total × peso unitario (${line.barLabel} = ${fmt(spec.unitWeightKgM)} kg/ml) = ${fmt(calculated.totalMl)} × ${fmt(spec.unitWeightKgM)} = ${fmt(calculated.totalKg)} kg`
    : `KG total = ${fmt(calculated.totalKg)} kg (sin número de varilla no hay peso unitario de referencia)`;
  if (!spec) {
    warnings.push('Sin número de varilla identificado: asígnalo manualmente para peso y plan de corte.');
  }

  const commercialFormula = calculated.commercialUnitsRequired
    ? `Varillas comerciales = ⌈ML total ÷ longitud comercial⌉ = ${fmt(calculated.commercialUnitsRequired)} varilla(s) (redondeo hacia arriba, pre-optimización)`
    : undefined;

  const wasteSource = options.wasteSource ?? line.wasteSource;
  let wasteText: string;
  if (wasteSource === 'calculated') {
    wasteText =
      'Desperdicio: calculado por optimización — el plan de corte FFD reporta el sobrante real según barras comerciales, cortes y sobrantes reutilizables.';
  } else if (wasteSource === 'manual') {
    const pct = options.manualWastePct ?? line.record.assumedWastePct;
    wasteText = `Desperdicio: factor manual del takeoff (${fmt(pct)}%) — editable, para presupuestar/margen; no es el sobrante del optimizador.`;
  } else {
    wasteText = `Desperdicio: asumido por línea (${fmt(line.record.assumedWastePct)}%) — estimación pre-optimización; el plan de corte calcula el real.`;
  }

  const evidence = line.record.evidence;
  const sourceText = evidence
    ? [
        evidence.sourceFileName ? `Fuente: ${evidence.sourceFileName}` : undefined,
        evidence.readingMethod ? `Método: ${evidence.readingMethod}` : undefined,
        evidence.position ? `Posición: ${evidence.position}` : undefined,
        evidence.elementKey ? `Elemento: ${evidence.elementKey}` : undefined,
        evidence.locationText ? `Ubicación: ${evidence.locationText}` : undefined,
        evidence.observation,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · ')
    : undefined;

  if (parsed.needsReview) {
    warnings.push('El parser marcó la línea para revisión: confirma la interpretación antes de aprobar.');
  }

  return {
    originalDescription: line.record.originalDescription,
    interpretation: parsed.explanation,
    quantityText,
    cutLengthText,
    mlFormula,
    kgFormula,
    commercialFormula,
    wasteText,
    sourceText,
    warnings,
  };
}
