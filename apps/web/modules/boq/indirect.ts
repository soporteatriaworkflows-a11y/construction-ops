/**
 * indirect.ts — Costos indirectos (AIU + IVA), total y valor por m².
 *
 * Propiedad: agent-cost-domain.
 *
 * Funciones PURAS, precisión decimal completa (Q9), sin redondeo intermedio.
 *
 * Las tasas AIU/IVA NO se hardcodean: provienen de `indirect_cost_rules`
 * (configurables por proyecto/versión). Cada regla tiene un `baseType`:
 *   - 'direct_cost' → la tasa se aplica sobre los costos directos.
 *   - 'utility'     → la tasa se aplica sobre la base de utilidad (suma de las
 *                     líneas marcadas como utilidad; típicamente la línea "U").
 *   - 'custom'      → la tasa se aplica sobre una base provista explícitamente.
 *
 * Cadena del golden master (docs/PROJECT_MASTER.md §3.4):
 *   Administración      = costos_directos × 0.035   (base direct_cost)
 *   Imprevistos         = costos_directos × 0.025   (base direct_cost)
 *   Utilidad            = costos_directos × 0.04     (base direct_cost, utilidad)
 *   IVA sobre utilidad  = Utilidad × 0.19            (base utility)
 *   costos_indirectos   = A + I + U + IVA
 *   total_costo         = costos_directos + costos_indirectos
 *   valor_m²            = total_costo / área_construida
 *
 * Estas tasas son las del Excel; aquí se CONSUMEN como configuración, no como
 * constantes del dominio.
 */

import type { DecimalString, Uuid, IndirectCostBaseType } from '@/lib/utils/types';
import { toDecimal, toDecimalString, sumDecimals } from '../apu/decimal';

/**
 * Regla de costo indirecto evaluable. Espejo de `IndirectCostRule` más un flag
 * de configuración (`contributesToUtilityBase`) para identificar qué líneas
 * componen la base de utilidad SIN hardcodear códigos.
 */
export interface IndirectCostRuleInput {
  id?: Uuid;
  code: string;
  name: string;
  /** Fracción (p. ej. "0.035"). No negativa. */
  percentage: DecimalString;
  baseType: IndirectCostBaseType;
  sortOrder: number;
  visibleToClient: boolean;
  /**
   * Si la línea forma parte de la BASE DE UTILIDAD sobre la que se aplican las
   * reglas con `baseType='utility'` (p. ej. la línea "Utilidad" alimenta la
   * base del "IVA sobre utilidad"). Configurable; por defecto `false`.
   */
  contributesToUtilityBase?: boolean;
  /** Base explícita para `baseType='custom'`. Requerida si baseType='custom'. */
  customBase?: DecimalString;
}

/** Resultado calculado de una línea de costo indirecto. */
export interface IndirectCostLine {
  id?: Uuid;
  code: string;
  name: string;
  percentage: DecimalString;
  baseType: IndirectCostBaseType;
  /** Base efectiva sobre la que se aplicó el porcentaje. */
  base: DecimalString;
  /** Monto = base × percentage. */
  amount: DecimalString;
  visibleToClient: boolean;
  sortOrder: number;
}

/** Resultado agregado de los costos indirectos. */
export interface IndirectCostResult {
  lines: IndirectCostLine[];
  /** Suma de los montos de todas las líneas. */
  totalIndirect: DecimalString;
}

/**
 * Calcula las líneas de costos indirectos (AIU + IVA) a partir de reglas
 * configurables y la base de costos directos. Función PURA.
 *
 * Las reglas se evalúan en orden de `sortOrder`. La base de utilidad se acumula
 * con las líneas marcadas `contributesToUtilityBase`, de modo que una regla
 * `baseType='utility'` (p. ej. IVA) se aplica sobre dicha acumulación.
 *
 * @param directCosts - Costos directos (base de las reglas `direct_cost`).
 * @param rules - Reglas de `indirect_cost_rules` (configurables, no hardcodeadas).
 * @returns Líneas calculadas y el total de costos indirectos.
 * @throws Error si una tasa es negativa o si falta la base de una regla `custom`.
 */
export function calculateIndirectCosts(
  directCosts: DecimalString,
  rules: readonly IndirectCostRuleInput[],
): IndirectCostResult {
  const ordered = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
  const lines: IndirectCostLine[] = [];
  const utilityBaseParts: DecimalString[] = [];

  for (const rule of ordered) {
    const pct = toDecimal(rule.percentage);
    if (pct.isNegative()) {
      throw new Error(`Tasa de costo indirecto no puede ser negativa: ${rule.code}=${pct.toFixed()}`);
    }

    let base: DecimalString;
    switch (rule.baseType) {
      case 'direct_cost':
        base = directCosts;
        break;
      case 'utility':
        base = sumDecimals(utilityBaseParts);
        break;
      case 'custom':
        if (rule.customBase === undefined) {
          throw new Error(`Regla '${rule.code}' con baseType='custom' requiere customBase`);
        }
        base = rule.customBase;
        break;
      default: {
        const exhaustive: never = rule.baseType;
        throw new Error(`baseType no soportado: ${String(exhaustive)}`);
      }
    }

    const amount = toDecimalString(toDecimal(base).times(pct));

    if (rule.contributesToUtilityBase === true) {
      utilityBaseParts.push(amount);
    }

    lines.push({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      percentage: rule.percentage,
      baseType: rule.baseType,
      base,
      amount,
      visibleToClient: rule.visibleToClient,
      sortOrder: rule.sortOrder,
    });
  }

  return {
    lines,
    totalIndirect: sumDecimals(lines.map((l) => l.amount)),
  };
}

/**
 * Calcula el total del presupuesto.
 *   total = costos_directos + costos_indirectos
 *
 * @param directCosts - Costos directos.
 * @param totalIndirect - Total de costos indirectos.
 * @returns Total como `DecimalString`.
 */
export function calculateTotal(
  directCosts: DecimalString,
  totalIndirect: DecimalString,
): DecimalString {
  return toDecimalString(toDecimal(directCosts).plus(toDecimal(totalIndirect)));
}

/**
 * Calcula el valor por metro cuadrado.
 *   valor_m² = total_costo / área_construida
 *
 * @param totalCost - Total del presupuesto.
 * @param builtArea - Área construida. Debe ser > 0.
 * @returns Valor por m² como `DecimalString`.
 * @throws Error si `builtArea` <= 0.
 */
export function calculateValuePerSqm(
  totalCost: DecimalString,
  builtArea: DecimalString,
): DecimalString {
  const area = toDecimal(builtArea);
  if (area.lessThanOrEqualTo(0)) {
    throw new Error(`área construida debe ser > 0: ${area.toFixed()}`);
  }
  return toDecimalString(toDecimal(totalCost).dividedBy(area));
}

/** Resultado completo del presupuesto (cadena directa → AIU → total → m²). */
export interface EstimateTotals {
  directCosts: DecimalString;
  indirect: IndirectCostResult;
  totalIndirect: DecimalString;
  totalCost: DecimalString;
  builtArea: DecimalString;
  valuePerSqm: DecimalString;
}

/**
 * Calcula la cadena financiera completa de un presupuesto a partir de los
 * costos directos, las reglas de costos indirectos y el área construida.
 * Función PURA. Es la fuente de verdad de los totales del presupuesto.
 *
 * @param params - Costos directos, reglas indirectas y área construida.
 * @returns Totales del presupuesto con precisión raw (sin redondeo).
 */
export function calculateEstimateTotals(params: {
  directCosts: DecimalString;
  indirectRules: readonly IndirectCostRuleInput[];
  builtArea: DecimalString;
}): EstimateTotals {
  const indirect = calculateIndirectCosts(params.directCosts, params.indirectRules);
  const totalCost = calculateTotal(params.directCosts, indirect.totalIndirect);
  const valuePerSqm = calculateValuePerSqm(totalCost, params.builtArea);

  return {
    directCosts: params.directCosts,
    indirect,
    totalIndirect: indirect.totalIndirect,
    totalCost,
    builtArea: params.builtArea,
    valuePerSqm,
  };
}
