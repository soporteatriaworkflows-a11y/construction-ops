/**
 * expected-values.ts — Valores de regresión del golden master (Primer piso).
 *
 * Propiedad de agent-excel-mapper. Fuente única de verdad para las
 * aserciones de regresión financiera del alcance "PRIMER PISO" del proyecto
 * piloto ENTRE PATIOS.
 *
 * Origen autoritativo: docs/PROJECT_MASTER.md §3.4 (Totales de regresión:
 * primer piso) y docs/EXCEL_MAPPING.md. Estos valores se transcriben EXACTOS
 * desde el documento maestro; NO se ajustan para forzar que pasen tests.
 *
 * Convención de tipos: dinero/decimales como `string` (API_CONTRACTS v1,
 * regla 7). Se operan con Decimal.js en el dominio. Aquí se conservan como
 * literales string para preservar todos los dígitos sin pérdida por float.
 *
 * Tasas AIU/IVA observadas en el Excel (PROJECT_MASTER §3.4):
 *   Administración        = Costos directos × 3.5%   (0.035)
 *   Imprevistos           = Costos directos × 2.5%   (0.025)
 *   Utilidad contractual  = Costos directos × 4%     (0.04)
 *   IVA sobre utilidad    = Utilidad × 19%           (0.19)
 *   Costos indirectos     = Admin + Imprev + Utilidad + IVA
 *   Total costo           = Costos directos + Costos indirectos
 *   Valor por m²          = Total costo / Área construida
 *
 * Estas tasas DEBEN ser configurables por proyecto/versión
 * (indirect_cost_rules); aquí se documentan como las usadas por el golden
 * master, no como constantes hardcodeadas del dominio.
 */

export type DecimalString = string;

/** Tasas AIU/IVA tal como aparecen en el golden master (fracciones). */
export const GOLDEN_RATES = {
  administracion: '0.035',
  imprevistos: '0.025',
  utilidad: '0.04',
  ivaSobreUtilidad: '0.19',
} as const;

/**
 * Indicador de regresión: clave canónica, valor esperado (string exacto) y
 * tolerancia absoluta permitida.
 */
export interface RegressionTarget {
  key: string;
  /** Valor esperado, exacto, transcrito de PROJECT_MASTER §3.4. */
  expected: DecimalString;
  /** Tolerancia absoluta (misma unidad que el valor). */
  tolerance: DecimalString;
  /** Unidad para reportes. */
  unit: 'COP' | 'm2' | 'COP/m2';
}

/** Los 9 valores de regresión obligatorios (PROJECT_MASTER §3.4). */
export const FIRST_FLOOR_TARGETS: readonly RegressionTarget[] = [
  { key: 'costos_directos',    expected: '336084479.93690735',   tolerance: '0.01',  unit: 'COP' },
  { key: 'administracion',     expected: '11762956.797791759',   tolerance: '0.01',  unit: 'COP' },
  { key: 'imprevistos',        expected: '8402111.998422684',    tolerance: '0.01',  unit: 'COP' },
  { key: 'utilidad',           expected: '13443379.197476294',   tolerance: '0.01',  unit: 'COP' },
  { key: 'iva_sobre_utilidad', expected: '2554242.047520496',    tolerance: '0.01',  unit: 'COP' },
  { key: 'costos_indirectos',  expected: '36162690.04121123',    tolerance: '0.01',  unit: 'COP' },
  { key: 'total_costo',        expected: '372247169.9781186',    tolerance: '0.01',  unit: 'COP' },
  { key: 'area_construida',    expected: '236.77900000000005',   tolerance: '0.001', unit: 'm2' },
  { key: 'valor_m2',           expected: '1572129.1583211287',   tolerance: '0.01',  unit: 'COP/m2' },
] as const;

/** Acceso por clave para el importador y la fixture. */
export const FIRST_FLOOR_EXPECTED: Record<string, DecimalString> = Object.fromEntries(
  FIRST_FLOOR_TARGETS.map((t) => [t.key, t.expected]),
);
