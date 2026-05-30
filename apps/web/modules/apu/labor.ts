/**
 * labor.ts — Cálculo de costos de mano de obra (salario integral).
 *
 * Propiedad: agent-cost-domain.
 *
 * Funciones PURAS. Toman los factores configurables de `labor_roles`
 * (NO se hardcodean resultados derivados) y producen el costo mensual integral,
 * diario y por hora con precisión decimal completa (Q9).
 *
 * Fórmulas (docs/PROJECT_MASTER.md §3.3.B y §6.5):
 *   salario_integral_mensual =
 *       base_salary × (1 + benefits_pct + social_security_pct + payroll_tax_pct)
 *     + transport_subsidy
 *     + dotacion_mensual            // uniform_cost / uniform_period_months
 *   costo_diario = salario_integral_mensual / working_days_month
 *   costo_hora   = costo_diario / working_hours_day
 *
 * NOTA: los factores prestacionales (beneficios, seguridad social, parafiscales)
 * se aplican sobre el salario base; el subsidio de transporte y la dotación se
 * suman aparte (no son prestacionales). La dotación se prorratea por su periodo
 * de reposición en meses.
 *
 * 🔒 Los insumos de nómina (`baseSalary`, factores, etc.) son INTERNOS; estas
 * funciones son de uso interno del motor y no deben exponerse a rol cliente.
 */

import type { DecimalString } from '@/lib/utils/types';
import type { LaborRole } from '@/lib/utils/types';
import { DomainDecimal, toDecimal, toDecimalString } from './decimal';

/** Resultado calculado de costos integrales de un rol de mano de obra. */
export interface LaborCostBreakdown {
  /** Costo mensual integral (prestacional + transporte + dotación prorrateada). */
  monthlyIntegralCost: DecimalString;
  /** Costo diario = mensual / días laborables del mes. */
  dailyIntegralCost: DecimalString;
  /** Costo por hora = diario / horas laborables del día. */
  hourlyIntegralCost: DecimalString;
}

/** Subconjunto de `LaborRole` necesario para el cálculo (factores configurables). */
export type LaborRoleFactors = Pick<
  LaborRole,
  | 'baseSalary'
  | 'transportSubsidy'
  | 'benefitsPct'
  | 'socialSecurityPct'
  | 'payrollTaxPct'
  | 'uniformCost'
  | 'uniformPeriodMonths'
  | 'workingDaysMonth'
  | 'workingHoursDay'
>;

/**
 * Calcula el costo mensual integral, diario y por hora de un rol de mano de obra
 * a partir de sus factores configurables. Función PURA, sin redondeo intermedio.
 *
 * @param role - Factores del rol (de `labor_roles`).
 * @returns Desglose de costos integral mensual/diario/horario como `DecimalString`.
 * @throws Error si `workingDaysMonth`, `workingHoursDay` o `uniformPeriodMonths`
 *   son cero (división por cero) o si algún factor es inválido/negativo.
 */
export function calculateLaborCost(role: LaborRoleFactors): LaborCostBreakdown {
  const base = toDecimal(role.baseSalary);
  const transport = toDecimal(role.transportSubsidy);
  const benefits = toDecimal(role.benefitsPct);
  const social = toDecimal(role.socialSecurityPct);
  const payroll = toDecimal(role.payrollTaxPct);
  const uniformCost = toDecimal(role.uniformCost);
  const uniformMonths = toDecimal(role.uniformPeriodMonths);
  const daysMonth = toDecimal(role.workingDaysMonth);
  const hoursDay = toDecimal(role.workingHoursDay);

  for (const [name, v] of [
    ['baseSalary', base],
    ['transportSubsidy', transport],
    ['benefitsPct', benefits],
    ['socialSecurityPct', social],
    ['payrollTaxPct', payroll],
    ['uniformCost', uniformCost],
  ] as const) {
    if (v.isNegative()) {
      throw new Error(`Factor de mano de obra no puede ser negativo: ${name}=${v.toFixed()}`);
    }
  }
  if (daysMonth.lessThanOrEqualTo(0)) {
    throw new Error('workingDaysMonth debe ser > 0');
  }
  if (hoursDay.lessThanOrEqualTo(0)) {
    throw new Error('workingHoursDay debe ser > 0');
  }
  if (uniformMonths.lessThanOrEqualTo(0)) {
    throw new Error('uniformPeriodMonths debe ser > 0');
  }

  // factor prestacional = 1 + beneficios + seguridad social + parafiscales
  const prestacionalFactor = new DomainDecimal(1).plus(benefits).plus(social).plus(payroll);
  const salarioPrestacional = base.times(prestacionalFactor);
  const dotacionMensual = uniformCost.dividedBy(uniformMonths);

  const monthly = salarioPrestacional.plus(transport).plus(dotacionMensual);
  const daily = monthly.dividedBy(daysMonth);
  const hourly = daily.dividedBy(hoursDay);

  return {
    monthlyIntegralCost: toDecimalString(monthly),
    dailyIntegralCost: toDecimalString(daily),
    hourlyIntegralCost: toDecimalString(hourly),
  };
}
