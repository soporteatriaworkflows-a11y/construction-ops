/**
 * parse-takeoff-sheet.ts — Parser estructurado PURO de la hoja
 * CANTIDADES 1 PISO (QUANTITY_TAKEOFF_IMPORT_V1, contrato §2–§5).
 *
 * Opera sobre el modelo de celdas (valores cacheados + texto de fórmula);
 * JAMÁS evalúa fórmulas ni ejecuta macros. El texto de fórmula solo se usa
 * para CLASIFICAR la geometría (qué columnas referencia) y como provenance.
 * Todo recálculo usa Decimal (política Q9).
 */
import { DomainDecimal, toDecimalString, type DomainDecimalInstance } from '@/modules/apu/decimal';
import { canonicalizeUnit } from '@/server/pricing/units';
import type { DecimalString } from '@/lib/utils/types';
import type {
  TakeoffFormulaType,
  TakeoffSkippedGroup,
  TakeoffWarning,
} from '@/lib/quantity-import/types';
import type { ApuCellGrid, ApuColumn, RawCell } from '../apu-import/sheet-model';
import { cellNumber, cellText, normalizeDescription, normalizeLabel } from '../apu-import/sheet-model';

/** Tolerancia de comparación contra los valores cacheados del Excel (§3.5). */
const EXCEL_TOLERANCE = new DomainDecimal('0.000001');

/** Columnas de dimensión de la gramática (§2). */
const DIM_COLUMNS = ['E', 'F', 'G', 'H'] as const;
type DimColumn = (typeof DIM_COLUMNS)[number];

/** Lista blanca congelada de unidades del encabezado de grupo (§2.1). */
const UNIT_ALLOWLIST = new Set([
  'm²', 'm2', 'm³', 'm3', 'm', 'ml', 'kg', 'un', 'und', 'jn', 'dia', 'día',
  'mes', 'viaje', 'vje', 'glb', 'gl',
]);

/** Mapa subset de columnas referenciadas → formula_type (§3). */
const PRODUCT_FORMULA_TYPES: Record<string, TakeoffFormulaType> = {
  'H': 'count_only',
  'E': 'length_only',
  'F': 'width_only',
  'G': 'height_only',
  'EH': 'length_count',
  'FH': 'width_count',
  'GH': 'height_count',
  'EF': 'length_width',
  'EG': 'length_height',
  'FG': 'width_height',
  'EFH': 'length_width_count',
  'EGH': 'length_height_count',
  'FGH': 'width_height_count',
  'EFG': 'length_width_height',
  'EFGH': 'length_width_height_count',
};

/** Línea de medición parseada (resultado puro del parser). */
export interface ParsedTakeoffLine {
  sourceRow: number;
  description: string | null;
  formulaType: TakeoffFormulaType;
  formulaText: string | null;
  length: DecimalString | null;
  width: DecimalString | null;
  height: DecimalString | null;
  count: DecimalString | null;
  /** Valores/fórmulas originales D..I + flag deduction (provenance §11). */
  rawValues: Record<string, unknown>;
  excelSubtotal: DecimalString | null;
  subtotalCalculated: DecimalString;
  deduction: boolean;
  warnings: TakeoffWarning[];
}

/** Grupo de cantidades parseado (resultado puro del parser). */
export interface ParsedTakeoffGroup {
  sourceRow: number;
  occurrenceIndex: number;
  visibleCode: string | null;
  itemCode: string | null;
  description: string;
  unit: string | null;
  rawUnit: string | null;
  chapterLabel: string | null;
  lines: ParsedTakeoffLine[];
  excelTotal: DecimalString | null;
  totalFormulaText: string | null;
  totalCalculated: DecimalString;
  warnings: TakeoffWarning[];
}

export interface ParsedTakeoffSheet {
  groups: ParsedTakeoffGroup[];
  skippedGroups: TakeoffSkippedGroup[];
  /** Errores críticos de gramática (§10). */
  errors: string[];
}

/** Normaliza un código de ítem para matching: '2.10' ≡ '2.1' (numéricos). */
export function normalizeItemCode(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (trimmed === '') return '';
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return String(n);
  }
  return trimmed.replace(/\s+/g, ' ');
}

function decimalFromCached(value: number): DecimalString {
  return toDecimalString(new DomainDecimal(value));
}

/** Refs de celda en el TEXTO de una fórmula (metadato; no se evalúa). */
const CELL_REF_RE = /([A-Z]+)(\d+)/g;

interface FormulaClassification {
  type: TakeoffFormulaType;
  /** Columnas propias referenciadas (solo para tipos reconocidos). */
  columns: DimColumn[];
}

/**
 * Clasifica la fórmula de la columna I de una línea (§3): producto de
 * referencias a la PROPIA fila dentro de {E,F,G,H} (orden/paréntesis libres)
 * o la variante aditiva `(E+F+G)*H`. Cualquier otra cosa ⇒ `custom`.
 */
export function classifyLineFormula(formula: string, row: number): FormulaClassification {
  const compact = formula.replace(/\s+/g, '').toUpperCase();
  if (compact === '') return { type: 'custom', columns: [] };
  if (compact.includes('SUM(')) return { type: 'custom', columns: [] };

  const refs: Array<{ col: string; row: number }> = [];
  let match: RegExpExecArray | null;
  CELL_REF_RE.lastIndex = 0;
  while ((match = CELL_REF_RE.exec(compact)) !== null) {
    refs.push({ col: match[1]!, row: Number(match[2]!) });
  }
  if (refs.length === 0) return { type: 'custom', columns: [] };

  const cols = new Set<string>();
  for (const ref of refs) {
    if (ref.row !== row) return { type: 'custom', columns: [] };
    if (!(DIM_COLUMNS as readonly string[]).includes(ref.col)) {
      return { type: 'custom', columns: [] };
    }
    if (cols.has(ref.col)) return { type: 'custom', columns: [] };
    cols.add(ref.col);
  }

  // Esqueleto estructural: refs → R; debe quedar solo R, *, +, ( y ).
  const skeleton = compact.replace(CELL_REF_RE, 'R');
  if (!/^[R*+()]+$/.test(skeleton)) return { type: 'custom', columns: [] };

  const sorted = [...cols].sort() as DimColumn[];

  // Variante aditiva: (R+R)*R o (R+R+R)*R con H como factor externo (§3).
  const sumMatch = /^\(R(\+R)+\)\*R$/.test(skeleton);
  if (sumMatch) {
    const last = refs[refs.length - 1]!;
    if (last.col === 'H' && !refs.slice(0, -1).some((r) => r.col === 'H')) {
      return { type: 'dims_sum_count', columns: sorted };
    }
    return { type: 'custom', columns: [] };
  }

  // Producto puro: sin '+', tokens R separados por '*'.
  if (skeleton.includes('+')) return { type: 'custom', columns: [] };
  const flat = skeleton.replace(/[()]/g, '');
  if (!/^R(\*R)*$/.test(flat)) return { type: 'custom', columns: [] };

  const key = sorted.join('');
  const type = PRODUCT_FORMULA_TYPES[key];
  return type ? { type, columns: sorted } : { type: 'custom', columns: [] };
}

/** Total de grupo: `SUM(Ia[:Ib])` con términos `-Ix` opcionales (§4). */
interface TotalFormulaParse {
  isTotal: boolean;
  /** Filas restadas explícitamente (deducciones). */
  subtractedRows: number[];
}

export function parseTotalFormula(formula: string | undefined): TotalFormulaParse {
  if (!formula) return { isTotal: false, subtractedRows: [] };
  const compact = formula.replace(/\s+/g, '').toUpperCase();
  if (!/^SUM\(I\d+(:I\d+)?\)/.test(compact)) return { isTotal: false, subtractedRows: [] };
  const subtractedRows: number[] = [];
  const minusRe = /-I(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = minusRe.exec(compact)) !== null) {
    subtractedRows.push(Number(m[1]!));
  }
  return { isTotal: true, subtractedRows };
}

function isUnitToken(raw: string): boolean {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return UNIT_ALLOWLIST.has(normalized);
}

/** ¿La fórmula de una celda de dimensión referencia OTRAS celdas? (§3.4) */
function dimensionHasCellRefs(formula: string | undefined): boolean {
  if (!formula) return false;
  CELL_REF_RE.lastIndex = 0;
  return CELL_REF_RE.test(formula.toUpperCase());
}

function rawCellJson(cell: RawCell | undefined): { v: string | number | null; f?: string } | null {
  if (!cell) return null;
  return cell.f ? { v: cell.v, f: cell.f } : { v: cell.v };
}

interface OpenGroup {
  sourceRow: number;
  visibleCode: string | null;
  itemCode: string | null;
  description: string;
  unit: string | null;
  rawUnit: string | null;
  chapterLabel: string | null;
  lines: ParsedTakeoffLine[];
  excelTotal: DecimalString | null;
  totalFormulaText: string | null;
  totalSubtractedRows: number[];
  warnings: TakeoffWarning[];
}

/** Parsea una línea de medición; null ⇒ no parseable (warning en el grupo). */
function parseLine(
  row: number,
  cells: Partial<Record<ApuColumn, RawCell>>,
  description: string | null,
): ParsedTakeoffLine | null {
  const iCell = cells.I;
  if (!iCell) return null;
  const excelValue = cellNumber(iCell);
  const formulaText = iCell.f ?? null;

  const warnings: TakeoffWarning[] = [];
  const dims: Partial<Record<DimColumn, number | null>> = {};
  for (const col of DIM_COLUMNS) {
    const cell = cells[col];
    dims[col] = cell ? cellNumber(cell) : null;
    if (cell?.f && dimensionHasCellRefs(cell.f)) {
      warnings.push({
        code: 'derived_dimension',
        message: `La dimensión ${col}${row} proviene de una fórmula (=${cell.f}); se usa su valor cacheado.`,
        sourceRow: row,
      });
    }
  }

  let formulaType: TakeoffFormulaType;
  let columns: DimColumn[] = [];
  if (formulaText) {
    const classified = classifyLineFormula(formulaText, row);
    formulaType = classified.type;
    columns = classified.columns;
  } else if (excelValue !== null) {
    formulaType = 'direct';
  } else {
    return null;
  }

  let subtotal: DomainDecimalInstance;
  if (formulaType === 'direct') {
    subtotal = new DomainDecimal(excelValue ?? 0);
  } else if (formulaType === 'custom') {
    if (excelValue === null) return null;
    subtotal = new DomainDecimal(excelValue);
    warnings.push({
      code: 'custom_formula',
      message: `Fórmula no geométrica en I${row} (=${formulaText}); se usa el valor cacheado del Excel como evidencia.`,
      sourceRow: row,
    });
  } else if (formulaType === 'dims_sum_count') {
    const sumCols = columns.filter((c) => c !== 'H');
    let acc = new DomainDecimal(0);
    for (const col of sumCols) acc = acc.plus(new DomainDecimal(dims[col] ?? 0));
    subtotal = acc.times(new DomainDecimal(dims.H ?? 0));
  } else {
    let acc = new DomainDecimal(1);
    for (const col of columns) acc = acc.times(new DomainDecimal(dims[col] ?? 0));
    subtotal = acc;
  }

  if (excelValue !== null && formulaType !== 'direct' && formulaType !== 'custom') {
    const diff = subtotal.minus(new DomainDecimal(excelValue)).abs();
    if (diff.greaterThan(EXCEL_TOLERANCE)) {
      warnings.push({
        code: 'excel_mismatch',
        message: `Subtotal recalculado (${toDecimalString(subtotal)}) difiere del Excel (${excelValue}) en la fila ${row}.`,
        sourceRow: row,
      });
    }
  }

  if (subtotal.isZero()) {
    warnings.push({
      code: 'zero_quantity',
      message: `Subtotal 0 en la fila ${row} (cantidad de elementos 0 — habitual en pisos desactivados).`,
      sourceRow: row,
    });
  }

  const rawValues: Record<string, unknown> = {};
  for (const col of ['D', 'E', 'F', 'G', 'H', 'I'] as const) {
    const json = rawCellJson(cells[col]);
    if (json) rawValues[col.toLowerCase()] = json;
  }

  return {
    sourceRow: row,
    description,
    formulaType,
    formulaText,
    length: dims.E !== null && dims.E !== undefined ? decimalFromCached(dims.E) : null,
    width: dims.F !== null && dims.F !== undefined ? decimalFromCached(dims.F) : null,
    height: dims.G !== null && dims.G !== undefined ? decimalFromCached(dims.G) : null,
    count: dims.H !== null && dims.H !== undefined ? decimalFromCached(dims.H) : null,
    rawValues,
    excelSubtotal: excelValue !== null ? decimalFromCached(excelValue) : null,
    subtotalCalculated: toDecimalString(subtotal),
    deduction: false,
    warnings,
  };
}

/** Cierra un grupo abierto: deducciones, total recalculado y comparación. */
function closeGroup(open: OpenGroup): ParsedTakeoffGroup {
  const subtracted = new Set(open.totalSubtractedRows);
  for (const line of open.lines) {
    const labelDeduction =
      line.description !== null && normalizeDescription(line.description).includes('menos');
    if (subtracted.has(line.sourceRow) || labelDeduction) {
      line.deduction = true;
      line.rawValues['deduction'] = true;
    }
  }

  let total = new DomainDecimal(0);
  for (const line of open.lines) {
    const sub = new DomainDecimal(line.subtotalCalculated);
    total = line.deduction ? total.minus(sub) : total.plus(sub);
  }

  const warnings = [...open.warnings];
  if (open.lines.length > 0) {
    if (open.excelTotal === null) {
      warnings.push({
        code: 'missing_group_total',
        message: `El grupo de la fila ${open.sourceRow} no tiene fila de total en la hoja; total = suma de líneas.`,
        sourceRow: open.sourceRow,
      });
    } else {
      const diff = total.minus(new DomainDecimal(open.excelTotal)).abs();
      if (diff.greaterThan(EXCEL_TOLERANCE)) {
        warnings.push({
          code: 'group_total_mismatch',
          message: `Total recalculado (${toDecimalString(total)}) difiere del total del Excel (${open.excelTotal}) en el grupo de la fila ${open.sourceRow}.`,
          sourceRow: open.sourceRow,
        });
      }
    }
  }

  return {
    sourceRow: open.sourceRow,
    occurrenceIndex: 1, // se asigna en el segundo pase
    visibleCode: open.visibleCode,
    itemCode: open.itemCode,
    description: open.description,
    unit: open.unit,
    rawUnit: open.rawUnit,
    chapterLabel: open.chapterLabel,
    lines: open.lines,
    excelTotal: open.excelTotal,
    totalFormulaText: open.totalFormulaText,
    totalCalculated: toDecimalString(total),
    warnings,
  };
}

/**
 * Parser principal de la gramática congelada (§2). PURO: recibe el grid de
 * celdas y devuelve grupos/líneas/advertencias sin tocar I/O.
 */
export function parseTakeoffSheet(grid: ApuCellGrid, lastRow: number): ParsedTakeoffSheet {
  const errors: string[] = [];

  // 1) Encabezado obligatorio: C≈DESCRIPCIÓN y D≈UN.
  let headerRow = 0;
  for (let row = 1; row <= lastRow; row++) {
    const cells = grid.get(row);
    if (!cells) continue;
    const c = normalizeLabel(cellText(cells.C));
    const d = normalizeLabel(cellText(cells.D));
    if (c.startsWith('DESCRIPCION') && d === 'UN') {
      headerRow = row;
      break;
    }
  }
  if (headerRow === 0) {
    return {
      groups: [],
      skippedGroups: [],
      errors: ['No se encontró el encabezado CAP/ÍTEM/DESCRIPCIÓN/UN/… en la hoja.'],
    };
  }

  const rawGroups: ParsedTakeoffGroup[] = [];
  const skippedGroups: TakeoffSkippedGroup[] = [];
  let open: OpenGroup | null = null;
  let currentChapter: string | null = null;

  const finishGroup = (): void => {
    if (!open) return;
    if (open.lines.length === 0) {
      skippedGroups.push({
        sourceRow: open.sourceRow,
        visibleCode: open.visibleCode,
        itemCode: open.itemCode,
        description: open.description,
        rawUnit: open.rawUnit,
        reason: 'skipped_no_lines',
      });
    } else {
      rawGroups.push(closeGroup(open));
    }
    open = null;
  };

  for (let row = headerRow + 1; row <= lastRow; row++) {
    const cells = grid.get(row);
    if (!cells) continue;

    const aText = cellText(cells.A);
    const bText = cellText(cells.B);
    const cText = cellText(cells.C);
    const dText = cellText(cells.D);
    const bNumber = cellNumber(cells.B);
    const hasDims = DIM_COLUMNS.some((col) => cells[col] !== undefined);
    const iCell = cells.I;

    // 1) Total de grupo (puede convivir con la fila del siguiente capítulo §2).
    const totalParse = parseTotalFormula(iCell?.f);
    if (totalParse.isTotal) {
      if (open !== null) {
        const o: OpenGroup = open;
        o.excelTotal = cellNumber(iCell) !== null ? decimalFromCached(cellNumber(iCell)!) : null;
        o.totalFormulaText = iCell?.f ?? null;
        o.totalSubtractedRows = totalParse.subtractedRows;
        finishGroup();
      }
      // La fila puede además abrir capítulo (caso real fila 187).
      if (bNumber !== null && Number.isInteger(bNumber) && cText !== '' && !hasDims) {
        currentChapter = `${bNumber} ${cText}`;
      }
      continue;
    }

    // 2) Capítulo: B entero + C texto + sin dimensiones ni unidad.
    if (
      bNumber !== null &&
      Number.isInteger(bNumber) &&
      cText !== '' &&
      !hasDims &&
      dText === '' &&
      !iCell
    ) {
      finishGroup();
      currentChapter = `${bNumber} ${cText}`;
      continue;
    }

    // 3) Inicio de grupo: C (descripción) + (ítem n.nn en B y/o código en A).
    const isItemCode = bText !== '' && /^\d+\.\d+$/.test(bText.replace(',', '.'));
    if (cText !== '' && (isItemCode || aText !== '')) {
      finishGroup();
      const unitToken = dText !== '' && isUnitToken(dText);
      const unitCanonical = unitToken ? canonicalizeUnit(dText).canonical : null;
      const warnings: TakeoffWarning[] = [];
      if (!unitToken) {
        warnings.push({
          code: 'unit_unknown',
          message:
            dText === ''
              ? `El grupo de la fila ${row} no declara unidad en la columna UN.`
              : `El valor «${dText}» (fila ${row}) no es una unidad reconocida; se trata como etiqueta de la primera línea.`,
          sourceRow: row,
        });
      }
      open = {
        sourceRow: row,
        visibleCode: aText !== '' ? aText : null,
        itemCode: isItemCode ? bText.replace(',', '.') : null,
        description: cText,
        unit: unitCanonical,
        rawUnit: dText !== '' ? dText : null,
        chapterLabel: currentChapter,
        lines: [],
        excelTotal: null,
        totalFormulaText: null,
        totalSubtractedRows: [],
        warnings,
      };
      // Primera línea de medición en la misma fila del grupo.
      if (iCell) {
        const lineLabel = unitToken ? null : dText !== '' ? dText : null;
        const line = parseLine(row, cells, lineLabel);
        if (line) {
          open.lines.push(line);
        } else {
          open.warnings.push({
            code: 'line_unparseable',
            message: `La medición de la fila ${row} no se pudo interpretar; se omite.`,
            sourceRow: row,
          });
        }
      }
      continue;
    }

    // 4) Línea de medición de un grupo abierto.
    if (open !== null && iCell) {
      const o: OpenGroup = open;
      const line = parseLine(row, cells, dText !== '' ? dText : null);
      if (line) {
        o.lines.push(line);
      } else {
        o.warnings.push({
          code: 'line_unparseable',
          message: `La medición de la fila ${row} no se pudo interpretar; se omite.`,
          sourceRow: row,
        });
      }
      continue;
    }

    // 5) Cualquier otra fila con contenido fuera de grupo se ignora (§2).
  }
  finishGroup();

  if (rawGroups.length === 0 && skippedGroups.length === 0) {
    errors.push('No se detectaron grupos de cantidades en la hoja.');
  }

  // 2º pase: occurrence index 1-based por clave (itemCode + descripción) (§5).
  const counters = new Map<string, number>();
  const groups = rawGroups.map((group) => {
    const key = `${normalizeItemCode(group.itemCode)}|${normalizeDescription(group.description)}`;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    if (next > 1) {
      group.warnings.push({
        code: 'duplicate_code',
        message: `El ítem «${group.itemCode ?? group.description}» aparece ${next} veces; ocurrencia ${next}.`,
        sourceRow: group.sourceRow,
      });
    }
    return { ...group, occurrenceIndex: next };
  });

  return { groups, skippedGroups, errors };
}
