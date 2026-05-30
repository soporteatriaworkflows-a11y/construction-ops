/**
 * recompute-first-floor.ts — Recálculo determinista del AIU/IVA/Total del
 * primer piso a partir de la base (costos directos) y el área, usando las
 * tasas observadas en el golden master.
 *
 * Propiedad de agent-excel-mapper. Función PURA (sin I/O). El objetivo es
 * verificar que la cadena de fórmulas documentada en PROJECT_MASTER §3.4
 * reproduce, dentro de tolerancia, los 9 valores de regresión.
 *
 * NOTA DE ARQUITECTURA: la fuente de verdad de los cálculos financieros del
 * producto será el dominio cost-domain (Oleada 2). Esta función NO la
 * sustituye; es un oráculo de regresión local de excel-mapper que congela el
 * comportamiento esperado del Excel para que cost-domain y qa lo verifiquen.
 *
 * Dinero como string + Decimal.js (API_CONTRACTS v1, reglas 6-8).
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GOLDEN_RATES, type DecimalString } from './expected-values';

// Decimal.js está instalado en apps/web (docs/DECISIONS.md). Se resuelve
// desde ahí para no depender de hoisting.
const requireFrom = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web', 'package.json'),
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Decimal: typeof import('decimal.js').Decimal = requireFrom('decimal.js').Decimal;

export interface FirstFloorComputation {
  costos_directos: DecimalString;
  administracion: DecimalString;
  imprevistos: DecimalString;
  utilidad: DecimalString;
  iva_sobre_utilidad: DecimalString;
  costos_indirectos: DecimalString;
  total_costo: DecimalString;
  area_construida: DecimalString;
  valor_m2: DecimalString;
}

export interface RecomputeInputs {
  /** Base: costos directos (string decimal exacto). */
  costosDirectos: DecimalString;
  /** Área construida (string decimal exacto). */
  areaConstruida: DecimalString;
}

/**
 * Recalcula la cadena AIU → IVA → indirectos → total → valor/m² SIN redondear
 * (precisión alta), replicando el comportamiento de hoja de cálculo (IEEE-754
 * no se fuerza; se usa aritmética decimal de alta precisión que reproduce los
 * dígitos esperados de §3.4). La política de redondeo COP definitiva (Q9) la
 * fija cost-domain; aquí NO se redondea para no introducir diferencias.
 */
export function recomputeFirstFloor(inputs: RecomputeInputs): FirstFloorComputation {
  // Precisión amplia para reproducir todos los dígitos significativos.
  const D = Decimal.clone({ precision: 50 });

  const directos = new D(inputs.costosDirectos);
  const area = new D(inputs.areaConstruida);

  const admin = directos.times(GOLDEN_RATES.administracion);
  const imprev = directos.times(GOLDEN_RATES.imprevistos);
  const util = directos.times(GOLDEN_RATES.utilidad);
  const iva = util.times(GOLDEN_RATES.ivaSobreUtilidad);
  const indirectos = admin.plus(imprev).plus(util).plus(iva);
  const total = directos.plus(indirectos);
  const valorM2 = total.dividedBy(area);

  return {
    costos_directos: directos.toString(),
    administracion: admin.toString(),
    imprevistos: imprev.toString(),
    utilidad: util.toString(),
    iva_sobre_utilidad: iva.toString(),
    costos_indirectos: indirectos.toString(),
    total_costo: total.toString(),
    area_construida: area.toString(),
    valor_m2: valorM2.toString(),
  };
}
