/**
 * first-floor.regression.test.ts — Regresión financiera del Primer piso.
 *
 * Propiedad de agent-excel-mapper (compartida con agent-qa para Oleada 4).
 *
 * Verifica DOS cosas, ambas dentro de tolerancia (±0.01 COP; ±0.001 m²):
 *
 *  (1) AUTOCONSISTENCIA DEL FIXTURE: los 9 indicadores almacenados en el
 *      fixture sanitizado (scripts/fixtures/) coinciden EXACTAMENTE con los
 *      valores autoritativos de PROJECT_MASTER §3.4. Esto garantiza que el
 *      fixture no se corrompió ni se "ajustó" para forzar el test.
 *
 *  (2) CADENA DE FÓRMULAS: recalcular AIU → IVA → indirectos → total →
 *      valor/m² a partir de (costos_directos, area) usando las tasas del
 *      golden master reproduce los demás 7 indicadores. Esto valida que la
 *      lógica documentada del Excel es internamente consistente.
 *
 * REGLA: NO se ajustan tasas ni fórmulas para forzar coincidencia. Si algo
 * difiere, el test falla y debe registrarse en docs/OPEN_QUESTIONS.md.
 *
 * Dinero como string + Decimal.js (API_CONTRACTS v1).
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_FLOOR_TARGETS } from './expected-values';
import { recomputeFirstFloor } from './recompute-first-floor';
import fixture from '../fixtures/entre-patios-first-floor.fixture.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFrom = createRequire(
  path.resolve(here, '..', '..', 'apps', 'web', 'package.json'),
);
const Decimal: typeof import('decimal.js').Decimal = requireFrom('decimal.js').Decimal;

/** Diferencia absoluta entre dos strings decimales, como Decimal. */
function absDiff(a: string, b: string): InstanceType<typeof Decimal> {
  return new Decimal(a).minus(new Decimal(b)).abs();
}

/** Exige que un valor del fixture exista (compatible con noUncheckedIndexedAccess). */
function requireStr(value: string | undefined, key: string): string {
  if (value === undefined) throw new Error(`Falta '${key}' en fixture.estimateTotals`);
  return value;
}

describe('Regresión financiera — ENTRE PATIOS / Primer piso', () => {
  // Mapa key -> indicador en el fixture (totals).
  const totals = fixture.estimateTotals as Record<string, string>;

  it('el fixture contiene los 9 indicadores de regresión', () => {
    for (const target of FIRST_FLOOR_TARGETS) {
      expect(totals[target.key], `falta ${target.key} en fixture.estimateTotals`).toBeDefined();
    }
  });

  describe('(1) Autoconsistencia fixture vs PROJECT_MASTER §3.4', () => {
    for (const target of FIRST_FLOOR_TARGETS) {
      it(`${target.key} dentro de ±${target.tolerance} ${target.unit}`, () => {
        const actual = requireStr(totals[target.key], target.key);
        const diff = absDiff(actual, target.expected);
        expect(
          diff.lessThanOrEqualTo(target.tolerance),
          `${target.key}: esperado=${target.expected} obtenido=${actual} diff=${diff.toString()}`,
        ).toBe(true);
      });
    }
  });

  describe('(2) Cadena de fórmulas recalculada (AIU/IVA/total/valor m²)', () => {
    const computed = recomputeFirstFloor({
      costosDirectos: requireStr(totals['costos_directos'], 'costos_directos'),
      areaConstruida: requireStr(totals['area_construida'], 'area_construida'),
    });

    for (const target of FIRST_FLOOR_TARGETS) {
      it(`${target.key} recalculado dentro de ±${target.tolerance} ${target.unit}`, () => {
        const actual = requireStr(
          (computed as Record<string, string | undefined>)[target.key],
          target.key,
        );
        const diff = absDiff(actual, target.expected);
        expect(
          diff.lessThanOrEqualTo(target.tolerance),
          `${target.key}: esperado=${target.expected} recalculado=${actual} diff=${diff.toString()}`,
        ).toBe(true);
      });
    }
  });
});
