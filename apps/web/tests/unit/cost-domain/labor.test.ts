/**
 * labor.test.ts — Cálculo de mano de obra (salario integral).
 * Propiedad: agent-cost-domain.
 */
import { describe, it, expect } from 'vitest';
import { calculateLaborCost, toDecimal, type LaborRoleFactors } from '@/modules/apu';

// Factores sanitizados (mismos del fixture; NO datos reales de nómina).
const role: LaborRoleFactors = {
  baseSalary: '1300000',
  transportSubsidy: '162000',
  benefitsPct: '0.40',
  socialSecurityPct: '0.205',
  payrollTaxPct: '0.09',
  uniformCost: '120000',
  uniformPeriodMonths: '4',
  workingDaysMonth: '24',
  workingHoursDay: '8',
};

describe('calculateLaborCost', () => {
  it('calcula mensual integral a partir de factores configurables', () => {
    const r = calculateLaborCost(role);
    // base*(1+0.40+0.205+0.09) = 1300000*1.695 = 2203500
    // + transporte 162000 + dotación 120000/4=30000 = 2395500
    expect(r.monthlyIntegralCost).toBe('2395500');
  });

  it('costo diario = mensual / días laborables', () => {
    const r = calculateLaborCost(role);
    // 2395500 / 24 = 99812.5
    expect(r.dailyIntegralCost).toBe('99812.5');
  });

  it('costo hora = diario / horas día', () => {
    const r = calculateLaborCost(role);
    // 99812.5 / 8 = 12476.5625
    expect(r.hourlyIntegralCost).toBe('12476.5625');
  });

  it('no hardcodea resultados: cambiar base cambia el costo', () => {
    const a = calculateLaborCost(role);
    const b = calculateLaborCost({ ...role, baseSalary: '2600000' });
    expect(a.monthlyIntegralCost).not.toBe(b.monthlyIntegralCost);
  });

  it('lanza si días laborables = 0', () => {
    expect(() => calculateLaborCost({ ...role, workingDaysMonth: '0' })).toThrow();
  });

  it('lanza si horas día = 0', () => {
    expect(() => calculateLaborCost({ ...role, workingHoursDay: '0' })).toThrow();
  });

  it('lanza si periodo de dotación = 0', () => {
    expect(() => calculateLaborCost({ ...role, uniformPeriodMonths: '0' })).toThrow();
  });

  it('lanza si un factor es negativo', () => {
    expect(() => calculateLaborCost({ ...role, baseSalary: '-1' })).toThrow();
  });

  it('es pura: misma entrada ⇒ misma salida, sin mutar la entrada', () => {
    const input = { ...role };
    const snapshot = JSON.stringify(input);
    const r1 = calculateLaborCost(input);
    const r2 = calculateLaborCost(input);
    expect(r1).toEqual(r2);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('precisión sin float: hourly*horas*días reconstruye el mensual', () => {
    const r = calculateLaborCost(role);
    const reconstructed = toDecimal(r.hourlyIntegralCost)
      .times(role.workingHoursDay)
      .times(role.workingDaysMonth);
    expect(reconstructed.toFixed()).toBe('2395500');
  });
});
