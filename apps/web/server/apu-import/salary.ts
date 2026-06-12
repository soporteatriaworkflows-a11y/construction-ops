/**
 * salary.ts — Derivación de factores salariales desde el bloque SALARIOS de la
 * hoja APU (ENTRE_PATIOS_APU_IMPORT_V1, contrato §3.1). Funciones PURAS.
 *
 * El Excel aplica las fracciones prestacionales sobre el SMLV; el dominio
 * (`calculateLaborCost`) las aplica sobre el salario base. Por eso las
 * fracciones extraídas se dividen por el factor del rol. La derivación
 * reproduce EXACTAMENTE los valores del workbook real (Ayudante 16.016,814;
 * Oficial 20.807,439 por hora).
 */
import type { DecimalString } from '@/lib/utils/types';
import { DomainDecimal, toDecimal, toDecimalString } from '@/modules/apu/decimal';
import { calculateLaborCost, type LaborRoleFactors } from '@/modules/apu/labor';

/** Insumos crudos extraídos del bloque salarial (valores cacheados). */
export interface SalaryBlockInputs {
  /** SMLV de la fila "Salario minimo…" (columna F). */
  smlv: number | null;
  /** Factor del rol (columna D de la misma fila, p. ej. 1.6 / 2.3). */
  factor: number | null;
  /** Subsidio de transporte (F). */
  transport: number | null;
  /** Prestaciones legales (E, fracción sobre SMLV). */
  benefitsPct: number | null;
  /** Seguridad social (E). */
  socialSecurityPct: number | null;
  /** Parafiscales (E). */
  payrollTaxPct: number | null;
  /** Dotación (F). */
  uniformCost: number | null;
  /** D de la fila de dotación (1/periodo, p. ej. 0.3333… ⇒ 3 meses). */
  uniformPeriodInverse: number | null;
  /** Días laborables del mes (D de "COSTO SALARIO" DIA). */
  workingDaysMonth: number | null;
  /** Horas del día (D de "COSTO SALARIO INTEGRAL HORA"). */
  workingHoursDay: number | null;
  /** Costo hora cacheado del Excel (F de la fila HORA) — EVIDENCIA. */
  hourlyExcel: number | null;
}

/** Resultado de la derivación. */
export interface DerivedSalaryRole {
  factors: LaborRoleFactors | null;
  /** Costo hora recalculado con calculateLaborCost (fuente de verdad). */
  hourlyRecalculated: DecimalString | null;
  /** Costo hora del Excel (evidencia). */
  hourlyExcel: DecimalString | null;
  warnings: string[];
}

/** Convierte un número cacheado a DecimalString canónico (sin exponentes). */
export function numberToDecimalString(n: number): DecimalString {
  return toDecimalString(new DomainDecimal(n));
}

/** Tolerancia de comparación contra evidencia Excel: 0.01 COP (contrato §5). */
export const EXCEL_EVIDENCE_TOLERANCE: DecimalString = '0.01';

/** `true` si |a − b| > tolerancia. */
export function differsFromEvidence(
  a: DecimalString,
  b: DecimalString,
  tolerance: DecimalString = EXCEL_EVIDENCE_TOLERANCE,
): boolean {
  return toDecimal(a).minus(toDecimal(b)).abs().greaterThan(toDecimal(tolerance));
}

/**
 * Deriva `LaborRoleFactors` desde los insumos del bloque salarial (§3.1) y
 * recalcula el costo hora con la fuente única `calculateLaborCost`.
 * Insumos incompletos ⇒ `factors: null` con advertencias (rol no importable
 * desde la hoja).
 */
export function deriveSalaryRole(inputs: SalaryBlockInputs): DerivedSalaryRole {
  const warnings: string[] = [];
  const missing: string[] = [];

  if (inputs.smlv === null || inputs.smlv <= 0) missing.push('salario mínimo');
  if (inputs.factor === null || inputs.factor <= 0) missing.push('factor del rol');
  if (inputs.transport === null) missing.push('subsidio de transporte');
  if (inputs.benefitsPct === null) missing.push('prestaciones');
  if (inputs.socialSecurityPct === null) missing.push('seguridad social');
  if (inputs.payrollTaxPct === null) missing.push('parafiscales');
  if (inputs.uniformCost === null) missing.push('dotación');
  if (inputs.uniformPeriodInverse === null || inputs.uniformPeriodInverse <= 0) {
    missing.push('periodo de dotación');
  }
  if (inputs.workingDaysMonth === null || inputs.workingDaysMonth <= 0) {
    missing.push('días laborables');
  }
  if (inputs.workingHoursDay === null || inputs.workingHoursDay <= 0) {
    missing.push('horas por día');
  }

  const hourlyExcel =
    inputs.hourlyExcel !== null ? numberToDecimalString(inputs.hourlyExcel) : null;

  if (missing.length > 0) {
    warnings.push(`Bloque salarial incompleto: falta ${missing.join(', ')}.`);
    return { factors: null, hourlyRecalculated: null, hourlyExcel, warnings };
  }

  const smlv = new DomainDecimal(inputs.smlv as number);
  const factor = new DomainDecimal(inputs.factor as number);
  const periodInverse = new DomainDecimal(inputs.uniformPeriodInverse as number);
  // 1/D redondeado al entero más cercano (0.3333… ⇒ 3 meses; 1 ⇒ 1 mes).
  const periodMonths = new DomainDecimal(1).dividedBy(periodInverse).toDecimalPlaces(0);
  if (periodMonths.lessThanOrEqualTo(0)) {
    warnings.push('Periodo de dotación inválido en el bloque salarial.');
    return { factors: null, hourlyRecalculated: null, hourlyExcel, warnings };
  }

  const factors: LaborRoleFactors = {
    baseSalary: toDecimalString(smlv.times(factor)),
    transportSubsidy: numberToDecimalString(inputs.transport as number),
    benefitsPct: toDecimalString(new DomainDecimal(inputs.benefitsPct as number).dividedBy(factor)),
    socialSecurityPct: toDecimalString(
      new DomainDecimal(inputs.socialSecurityPct as number).dividedBy(factor),
    ),
    payrollTaxPct: toDecimalString(
      new DomainDecimal(inputs.payrollTaxPct as number).dividedBy(factor),
    ),
    uniformCost: numberToDecimalString(inputs.uniformCost as number),
    uniformPeriodMonths: toDecimalString(periodMonths),
    workingDaysMonth: numberToDecimalString(inputs.workingDaysMonth as number),
    workingHoursDay: numberToDecimalString(inputs.workingHoursDay as number),
  };

  const hourlyRecalculated = calculateLaborCost(factors).hourlyIntegralCost;

  if (hourlyExcel !== null && differsFromEvidence(hourlyRecalculated, hourlyExcel)) {
    warnings.push(
      `El costo hora recalculado (${hourlyRecalculated}) difiere del Excel (${hourlyExcel}).`,
    );
  }

  return { factors, hourlyRecalculated, hourlyExcel, warnings };
}
