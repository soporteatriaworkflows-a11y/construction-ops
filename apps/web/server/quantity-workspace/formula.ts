/**
 * formula.ts — Motor de fórmulas del Quantity Workspace (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1).
 *
 * Propiedad: agent-cost-domain (autorado por el orquestador).
 * Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §2-§3.
 *
 * Dominio PURO y testeable. Sin acceso a BD, sin red, sin UI.
 *
 * REGLAS DURAS:
 *   - PROHIBIDO `eval`, `Function`, plantillas JS, SQL o HTML arbitrario.
 *   - Solo se combinan los campos numéricos declarados con operaciones
 *     predefinidas por `formula_type`. No existe "fórmula libre" del usuario.
 *   - Todo cálculo usa `Decimal.js` (política Q9). El navegador nunca fija el
 *     resultado: el servidor recalcula con estas funciones.
 */
import { DomainDecimal, toDecimalString } from '@/modules/apu/decimal';
import type { DecimalString } from '@/lib/utils/types';

/** Tipos de cálculo soportados (CHECK en BD = este enum). */
export const FORMULA_TYPES = [
  'direct',
  'area_simple',
  'area_floor',
  'wall_with_opening',
  'tile_by_height',
  'paint_remainder',
  'linear_profile',
  'count_unit',
  'volume',
  'manual_safe',
] as const;

export type FormulaType = (typeof FORMULA_TYPES)[number];

export function isFormulaType(v: string): v is FormulaType {
  return (FORMULA_TYPES as readonly string[]).includes(v);
}

/** Error de validación de cantidad. No se persiste nada cuando ocurre. */
export class QuantityFormulaError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'QuantityFormulaError';
  }
}

/** Entrada cruda de una línea de cantidad (todos los numéricos opcionales). */
export interface QuantityLineInput {
  formulaType: FormulaType;
  length?: DecimalString | null;
  width?: DecimalString | null;
  height?: DecimalString | null;
  thickness?: DecimalString | null;
  count?: DecimalString | null;
  /** altura de enchape / altura parcial. */
  partialHeight?: DecimalString | null;
  /** descuento de vanos, en la unidad del resultado. */
  openingDeduction?: DecimalString | null;
  /** desperdicio 0..1 (exclusivo de 1). */
  wastePct?: DecimalString | null;
}

export interface QuantityLineResult {
  /** Resultado geométrico antes de vanos y desperdicio. */
  resultGross: DecimalString;
  /** Resultado neto = max(0, (gross - vanos) × (1 + desperdicio)). */
  resultNet: DecimalString;
}

type D = InstanceType<typeof DomainDecimal>;

/** Parsea un campo numérico opcional; vacío/null ⇒ null. Inválido ⇒ error. */
function parseField(
  value: DecimalString | null | undefined,
  field: string,
): D | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  let d: D;
  try {
    d = new DomainDecimal(value);
  } catch {
    throw new QuantityFormulaError('invalid_number', `Valor no numérico en "${field}"`);
  }
  if (d.isNaN() || !d.isFinite()) {
    throw new QuantityFormulaError('invalid_number', `Valor no finito en "${field}"`);
  }
  if (d.isNegative()) {
    throw new QuantityFormulaError('negative_value', `"${field}" no puede ser negativo`);
  }
  return d;
}

/** Requiere un campo presente y > 0. */
function requirePositive(d: D | null, field: string): D {
  if (d === null) {
    throw new QuantityFormulaError('missing_value', `Falta "${field}" para este tipo de cálculo`);
  }
  if (d.lte(0)) {
    throw new QuantityFormulaError('non_positive', `"${field}" debe ser mayor que 0`);
  }
  return d;
}

/**
 * Calcula `resultGross` y `resultNet` de una línea de cantidad de forma pura.
 * Single source of truth — usado por el servicio del workspace y por el sync.
 */
export function computeQuantityLine(input: QuantityLineInput): QuantityLineResult {
  if (!isFormulaType(input.formulaType)) {
    throw new QuantityFormulaError('invalid_formula_type', `Tipo de cálculo no soportado: ${input.formulaType}`);
  }

  const length = parseField(input.length, 'largo');
  const width = parseField(input.width, 'ancho');
  const height = parseField(input.height, 'alto');
  const thickness = parseField(input.thickness, 'espesor');
  const count = parseField(input.count, 'cantidad');
  const partialHeight = parseField(input.partialHeight, 'altura parcial');
  const deduction = parseField(input.openingDeduction, 'descuento de vanos') ?? new DomainDecimal(0);
  const waste = parseField(input.wastePct, 'desperdicio') ?? new DomainDecimal(0);

  if (waste.gte(1)) {
    throw new QuantityFormulaError('waste_out_of_range', 'El desperdicio debe ser un fraccional entre 0 y 1 (exclusivo)');
  }

  let gross: D;
  switch (input.formulaType) {
    case 'direct':
    case 'count_unit':
      gross = requirePositive(count, 'cantidad');
      break;
    case 'area_simple':
      gross = requirePositive(length, 'largo').times(requirePositive(height, 'alto'));
      break;
    case 'area_floor':
      gross = requirePositive(length, 'largo').times(requirePositive(width, 'ancho'));
      break;
    case 'wall_with_opening':
      gross = requirePositive(length, 'largo').times(requirePositive(height, 'alto'));
      break;
    case 'tile_by_height':
      gross = requirePositive(length, 'largo').times(requirePositive(partialHeight, 'altura de enchape'));
      break;
    case 'paint_remainder': {
      const h = requirePositive(height, 'altura total');
      const ph = requirePositive(partialHeight, 'altura de enchape');
      const remainder = h.minus(ph);
      if (remainder.lte(0)) {
        throw new QuantityFormulaError(
          'remainder_non_positive',
          'La altura total debe ser mayor que la altura de enchape',
        );
      }
      gross = requirePositive(length, 'largo').times(remainder);
      break;
    }
    case 'linear_profile':
      gross = requirePositive(length, 'largo');
      break;
    case 'volume':
      gross = requirePositive(length, 'largo')
        .times(requirePositive(width, 'ancho'))
        .times(requirePositive(thickness, 'espesor'));
      break;
    case 'manual_safe': {
      // Suma controlada de los términos numéricos declarados presentes.
      // NO acepta cadena de fórmula del usuario: solo suma campos predefinidos.
      const terms = [length, width, height, thickness, count, partialHeight].filter(
        (t): t is D => t !== null,
      );
      if (terms.length === 0) {
        throw new QuantityFormulaError('manual_no_terms', 'Captura al menos un valor para el cálculo manual');
      }
      gross = terms.reduce((acc, t) => acc.plus(t), new DomainDecimal(0));
      break;
    }
    default: {
      // exhaustividad
      const never: never = input.formulaType;
      throw new QuantityFormulaError('invalid_formula_type', `Tipo no soportado: ${String(never)}`);
    }
  }

  // Aplica vano y desperdicio. Neto nunca negativo.
  const afterDeduction = gross.minus(deduction);
  const base = afterDeduction.isNegative() ? new DomainDecimal(0) : afterDeduction;
  const net = base.times(new DomainDecimal(1).plus(waste));

  return {
    resultGross: toDecimalString(gross),
    resultNet: toDecimalString(net.isNegative() ? new DomainDecimal(0) : net),
  };
}

/** Suma neta de líneas homogéneas (misma unidad). */
export function sumNet(results: readonly QuantityLineResult[]): DecimalString {
  const total = results.reduce(
    (acc, r) => acc.plus(new DomainDecimal(r.resultNet)),
    new DomainDecimal(0),
  );
  return toDecimalString(total);
}
