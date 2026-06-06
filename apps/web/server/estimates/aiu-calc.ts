/**
 * aiu-calc.ts — Validación y cálculo PUROS de AIU (4D.2). Propiedad: agent-db-rls.
 *
 * Server-side, sin DB. Todo con `Decimal` (sin float). Porcentajes de entrada en
 * formato HUMANO (`"3.5"` = 3.5 %); se persisten como FRACCIÓN (`"0.035"`).
 * Contrato: `docs/AIU_CRUD_CONTRACT.md §3,§4`.
 */
import Decimal from 'decimal.js';
import type { DecimalString } from '@/lib/utils/types';
import { AIU_MAX_RATE, type AiuRatesInput, type FinancialSummary } from '@/lib/estimates/aiu-types';
import { AiuValidationError, type AiuValidationIssue } from './errors';

/** Fracciones (0..1) normalizadas de los 4 conceptos AIU. */
export interface AiuFractions {
  administration: DecimalString;
  contingency: DecimalString;
  utility: DecimalString;
  utilityVat: DecimalString;
}

const FIELD_LABELS: Record<keyof AiuRatesInput, string> = {
  administrationRate: 'Administración',
  contingencyRate: 'Imprevistos',
  utilityRate: 'Utilidad',
  utilityVatRate: 'IVA sobre utilidad',
};

function parseHumanRate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

/** Humano (`"3.5"`) → fracción (`"0.035"`). PURA. */
export function humanToFraction(human: DecimalString): DecimalString {
  return new Decimal(human).div(100).toFixed();
}
/** Fracción (`"0.035"`) → humano (`"3.5"`). PURA. */
export function fractionToHuman(fraction: DecimalString): DecimalString {
  return new Decimal(fraction).times(100).toFixed();
}

/**
 * Valida los 4 porcentajes humanos y devuelve fracciones normalizadas.
 * @throws AiuValidationError con la lista de problemas.
 */
export function validateAiuRates(input: AiuRatesInput): AiuFractions {
  const issues: AiuValidationIssue[] = [];
  const out: Record<string, string> = {};
  (Object.keys(FIELD_LABELS) as (keyof AiuRatesInput)[]).forEach((field) => {
    const parsed = parseHumanRate(input?.[field]);
    if (parsed === null) {
      issues.push({ field, message: `${FIELD_LABELS[field]}: porcentaje inválido.` });
      return;
    }
    const d = new Decimal(parsed);
    if (d.isNegative()) {
      issues.push({ field, message: `${FIELD_LABELS[field]}: no puede ser negativo.` });
    } else if (d.greaterThan(AIU_MAX_RATE)) {
      issues.push({ field, message: `${FIELD_LABELS[field]}: no puede superar ${AIU_MAX_RATE}%.` });
    } else {
      out[field] = humanToFraction(parsed);
    }
  });
  if (issues.length > 0) throw new AiuValidationError(issues);
  return {
    administration: out.administrationRate!,
    contingency: out.contingencyRate!,
    utility: out.utilityRate!,
    utilityVat: out.utilityVatRate!,
  };
}

/**
 * Calcula el resumen financiero a partir del costo directo y las fracciones AIU.
 * `utilityVat` se aplica SOBRE el monto de utilidad; los demás sobre directTotal.
 * PURA (Decimal, sin float).
 */
export function computeFinancialSummary(
  directTotal: DecimalString,
  fractions: AiuFractions,
): FinancialSummary {
  const dt = new Decimal(directTotal);
  const administrationAmount = dt.times(fractions.administration);
  const contingencyAmount = dt.times(fractions.contingency);
  const utilityAmount = dt.times(fractions.utility);
  const utilityVatAmount = utilityAmount.times(fractions.utilityVat);
  const indirectTotal = administrationAmount
    .plus(contingencyAmount)
    .plus(utilityAmount)
    .plus(utilityVatAmount);
  const grandTotal = dt.plus(indirectTotal);
  return {
    directTotal: dt.toFixed(),
    administrationAmount: administrationAmount.toFixed(),
    contingencyAmount: contingencyAmount.toFixed(),
    utilityAmount: utilityAmount.toFixed(),
    utilityVatAmount: utilityVatAmount.toFixed(),
    indirectTotal: indirectTotal.toFixed(),
    grandTotal: grandTotal.toFixed(),
  };
}

/** Fracciones todo-cero (cuando no hay reglas AIU definidas). */
export const ZERO_FRACTIONS: AiuFractions = {
  administration: '0',
  contingency: '0',
  utility: '0',
  utilityVat: '0',
};
