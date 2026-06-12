/**
 * parser.test.ts — PARSER del importador de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1, contrato §2–§5). Hojas 100% sintéticas; el
 * workbook real jamás entra al repositorio.
 */
import { describe, expect, it } from 'vitest';
import { parseQuantityWorkbook } from '@/server/quantity-import/parse-workbook';
import {
  classifyLineFormula,
  normalizeItemCode,
  parseTakeoffSheet,
  parseTotalFormula,
} from '@/server/quantity-import/parse-takeoff-sheet';
import { QuantitySheetNotFoundError } from '@/server/quantity-import/errors';
import {
  gridFromCells,
  standardTakeoffCells,
  syntheticTakeoffSheet,
  takeoffHeaderCells,
  takeoffWorkbookFile,
  workbookFile,
  type CellSpec,
} from './helpers';

async function fileToSheet(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return parseQuantityWorkbook(buffer, file.name);
}

describe('parse-workbook — detección de hoja y digest', () => {
  it('detecta la hoja CANTIDADES 1 PISO por nombre normalizado', async () => {
    const file = workbookFile([
      { name: 'RESUMEN', cells: [[1, 'A', 'otro contenido']] },
      { name: '  cantidades 1 piso ', cells: standardTakeoffCells() },
    ]);
    const sheet = await fileToSheet(file);
    expect(sheet.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(sheet.lastRow).toBeGreaterThanOrEqual(24);
  });

  it('rechaza el workbook sin la hoja admitida', async () => {
    const sinHoja = workbookFile([{ name: 'CANTIDADES', cells: [[1, 'A', 'x']] }]);
    const buffer = Buffer.from(await sinHoja.arrayBuffer());
    expect(() => parseQuantityWorkbook(buffer, sinHoja.name)).toThrow(
      QuantitySheetNotFoundError,
    );
  });

  it('el digest es estable para el mismo contenido y cambia al cambiar una celda', async () => {
    const a = await fileToSheet(takeoffWorkbookFile());
    const b = await fileToSheet(takeoffWorkbookFile());
    expect(a.digest).toBe(b.digest);
    const cells: CellSpec[] = [...standardTakeoffCells()];
    const idx = cells.findIndex(([r, c]) => r === 5 && c === 'E');
    cells[idx] = [5, 'E', 4.21];
    const c = await fileToSheet(takeoffWorkbookFile(cells));
    expect(c.digest).not.toBe(a.digest);
  });
});

describe('parse-takeoff-sheet — gramática congelada (§2)', () => {
  it('exige el encabezado DESCRIPCIÓN/UN (error crítico si falta)', () => {
    const { grid, lastRow } = gridFromCells([[1, 'A', 'sin encabezado']]);
    const parsed = parseTakeoffSheet(grid, lastRow);
    expect(parsed.groups).toHaveLength(0);
    expect(parsed.errors).toHaveLength(1);
  });

  it('detecta grupos, líneas, capítulos y preserva filas de origen', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const parsed = parseTakeoffSheet(grid, lastRow);
    expect(parsed.errors).toEqual([]);
    expect(parsed.groups).toHaveLength(6); // P-01, MT-01, BC-01, BC-02, 9.01×2
    expect(parsed.skippedGroups).toHaveLength(1); // AC-01 sin líneas

    const p01 = parsed.groups[0]!;
    expect(p01.visibleCode).toBe('P-01');
    expect(p01.itemCode).toBe('1.01');
    expect(p01.unit).toBe('m²');
    expect(p01.rawUnit).toBe('M²');
    expect(p01.sourceRow).toBe(5);
    expect(p01.chapterLabel).toContain('PRELIMINARES');
    expect(p01.lines.map((l) => l.sourceRow)).toEqual([5, 6]);
  });

  it('recalcula subtotales con Decimal y compara contra el Excel (§3.5)', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const parsed = parseTakeoffSheet(grid, lastRow);
    const p01 = parsed.groups[0]!;
    expect(p01.lines[0]!.subtotalCalculated).toBe('10.08');
    expect(p01.lines[0]!.excelSubtotal).toBe('10.08');
    expect(p01.totalCalculated).toBe('19.68');
    expect(p01.excelTotal).toBe('19.68');
    expect(
      p01.lines.flatMap((l) => l.warnings).filter((w) => w.code === 'excel_mismatch'),
    ).toHaveLength(0);
  });

  it('reporta diferencia cuando el valor cacheado del Excel no coincide', () => {
    const cells: CellSpec[] = [
      ...takeoffHeaderCells(1),
      [2, 'A', 'X-01'], [2, 'B', 1.01], [2, 'C', 'Grupo alterado'], [2, 'D', 'M²'],
      [2, 'E', 2], [2, 'G', 2], [2, 'H', 1], [2, 'I', 99, '(E2*G2)*H2'], // Excel dice 99; real 4
      [3, 'I', 99, 'SUM(I2)'],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const parsed = parseTakeoffSheet(grid, lastRow);
    const line = parsed.groups[0]!.lines[0]!;
    expect(line.subtotalCalculated).toBe('4'); // el server-side manda
    expect(line.warnings.some((w) => w.code === 'excel_mismatch')).toBe(true);
    expect(
      parsed.groups[0]!.warnings.some((w) => w.code === 'group_total_mismatch'),
    ).toBe(true);
  });

  it('D no reconocida como unidad ⇒ etiqueta de línea + unit_unknown (§2.1)', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const mt01 = parseTakeoffSheet(grid, lastRow).groups[1]!;
    expect(mt01.unit).toBeNull();
    expect(mt01.rawUnit).toBe('Z1');
    expect(mt01.lines[0]!.description).toBe('Z1');
    expect(mt01.lines[1]!.description).toBe('Z2');
    expect(mt01.warnings.some((w) => w.code === 'unit_unknown')).toBe(true);
    expect(mt01.totalCalculated).toBe('51.3');
  });

  it('deducciones: restadas en el total y marcadas en raw_values (§4)', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const bc01 = parseTakeoffSheet(grid, lastRow).groups[2]!;
    expect(bc01.lines).toHaveLength(3);
    const deduction = bc01.lines[2]!;
    expect(deduction.deduction).toBe(true);
    expect(deduction.rawValues['deduction']).toBe(true);
    expect(bc01.totalCalculated).toBe('28'); // 20 + 10 − 2
    expect(bc01.excelTotal).toBe('28');
  });

  it('total incrustado en la fila del siguiente capítulo se atribuye al grupo anterior (§2)', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const parsed = parseTakeoffSheet(grid, lastRow);
    const bc02 = parsed.groups[3]!;
    expect(bc02.visibleCode).toBe('BC-02');
    expect(bc02.excelTotal).toBe('24');
    expect(bc02.totalCalculated).toBe('24');
    // El capítulo de la misma fila aplica a los grupos siguientes.
    expect(parsed.groups[4]!.chapterLabel).toContain('VARIOS');
  });

  it('grupos sin líneas se reportan como skipped_no_lines y NO se importan', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const parsed = parseTakeoffSheet(grid, lastRow);
    expect(parsed.skippedGroups[0]!.visibleCode).toBe('AC-01');
    expect(parsed.skippedGroups[0]!.rawUnit).toBe('Kg');
    expect(parsed.groups.some((g) => g.visibleCode === 'AC-01')).toBe(false);
  });

  it('occurrence index 1-based por código+descripción repetidos (§5)', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const parsed = parseTakeoffSheet(grid, lastRow);
    const aseos = parsed.groups.filter((g) => g.itemCode === '9.01');
    expect(aseos.map((g) => g.occurrenceIndex)).toEqual([1, 2]);
    expect(aseos[1]!.warnings.some((w) => w.code === 'duplicate_code')).toBe(true);
  });

  it('grupo sin fila de total ⇒ total = Σ líneas + missing_group_total', () => {
    const cells: CellSpec[] = [
      ...takeoffHeaderCells(1),
      [2, 'A', 'S-01'], [2, 'B', 1.01], [2, 'C', 'Sin total'], [2, 'D', 'Un'],
      [2, 'H', 31, 'SUM(H10:H20)'], [2, 'I', 31, 'H2'],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const group = parseTakeoffSheet(grid, lastRow).groups[0]!;
    expect(group.totalCalculated).toBe('31');
    expect(group.excelTotal).toBeNull();
    expect(group.warnings.some((w) => w.code === 'missing_group_total')).toBe(true);
    // H derivado de fórmula con refs ⇒ derived_dimension.
    expect(
      group.lines[0]!.warnings.some((w) => w.code === 'derived_dimension'),
    ).toBe(true);
    expect(group.lines[0]!.formulaType).toBe('count_only');
  });

  it('H=0 produce subtotal 0 con advertencia zero_quantity (legítimo)', () => {
    const cells: CellSpec[] = [
      ...takeoffHeaderCells(1),
      [2, 'A', 'Z-01'], [2, 'B', 1.01], [2, 'C', 'Piso desactivado'], [2, 'D', 'M²'],
      [2, 'E', 4.6], [2, 'H', 0], [2, 'I', 0, '(E2*H2)'],
      [3, 'I', 0, 'SUM(I2)'],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const group = parseTakeoffSheet(grid, lastRow).groups[0]!;
    expect(group.lines[0]!.subtotalCalculated).toBe('0');
    expect(group.lines[0]!.warnings.some((w) => w.code === 'zero_quantity')).toBe(true);
  });

  it('fórmula no geométrica ⇒ custom con valor cacheado como evidencia (§3.3)', () => {
    const cells: CellSpec[] = [
      ...takeoffHeaderCells(1),
      [2, 'A', 'C-01'], [2, 'B', 1.01], [2, 'C', 'Cruce de filas'], [2, 'D', 'M²'],
      [2, 'E', 2], [2, 'H', 1], [2, 'I', 7.5, 'E2*H99'], // ref a otra fila
      [3, 'I', 7.5, 'SUM(I2)'],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const line = parseTakeoffSheet(grid, lastRow).groups[0]!.lines[0]!;
    expect(line.formulaType).toBe('custom');
    expect(line.subtotalCalculated).toBe('7.5');
    expect(line.warnings.some((w) => w.code === 'custom_formula')).toBe(true);
  });

  it('valores raw (D..I) y textos de fórmula se preservan en raw_values (§11)', () => {
    const { grid, lastRow } = syntheticTakeoffSheet();
    const line = parseTakeoffSheet(grid, lastRow).groups[0]!.lines[0]!;
    expect(line.rawValues['e']).toEqual({ v: 4.2 });
    expect(line.rawValues['i']).toEqual({ v: 10.08, f: '(E5*G5)*H5' });
    expect(line.formulaText).toBe('(E5*G5)*H5');
    expect(line.length).toBe('4.2');
    expect(line.height).toBe('2.4');
    expect(line.count).toBe('1');
    expect(line.width).toBeNull();
  });

  it('dimensión con fórmula que referencia otras celdas ⇒ derived_dimension', () => {
    const cells: CellSpec[] = [
      ...takeoffHeaderCells(1),
      [2, 'A', 'D-01'], [2, 'B', 1.01], [2, 'C', 'Dimensión derivada'], [2, 'D', 'M³'],
      [2, 'E', 198.264, 'I41'], [2, 'F', 0.1], [2, 'G', 1.35], [2, 'I', 26.76564, '(E2*F2*G2)'],
      [3, 'I', 26.76564, 'SUM(I2)'],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const group = parseTakeoffSheet(grid, lastRow).groups[0]!;
    expect(group.unit).toBe('m³'); // alias m3/m³ canonical
    const line = group.lines[0]!;
    expect(line.formulaType).toBe('length_width_height');
    expect(line.warnings.some((w) => w.code === 'derived_dimension')).toBe(true);
    expect(line.subtotalCalculated).toBe('26.76564');
  });
});

describe('classifyLineFormula — reconocimiento geométrico (§3)', () => {
  const cases: Array<[string, number, string]> = [
    ['(E14*G14)*H14', 14, 'length_height_count'],
    ['(E44*F44)*H44', 44, 'length_width_count'],
    ['(E56*F56*G56)*H56', 56, 'length_width_height_count'],
    ['E47*H47', 47, 'length_count'],
    ['(E59*H59)', 59, 'length_count'],
    ['H134*E134', 134, 'length_count'],
    ['(E70*F70*G70)', 70, 'length_width_height'],
    ['E334*F334', 334, 'length_width'],
    ['H193*G193', 193, 'height_count'],
    ['G488', 488, 'height_only'],
    ['H232', 232, 'count_only'],
    ['(E501+F501+G501)*H501', 501, 'dims_sum_count'],
  ];
  it.each(cases)('%s (fila %i) → %s', (formula, row, expected) => {
    expect(classifyLineFormula(formula, row).type).toBe(expected);
  });

  it.each([
    ['E2*H99', 2], // otra fila
    ['SUM(H193:H231)', 232], // SUM
    ['E2+H2', 2], // suma sin patrón (E+F+G)*H
    ['E2*E2', 2], // columna repetida
    ['(E2+H2)*G2', 2], // H dentro de la suma
    ["'OTRA HOJA'!C14*H2", 2], // cross-sheet
  ])('%s → custom', (formula, row) => {
    expect(classifyLineFormula(formula, row as number).type).toBe('custom');
  });
});

describe('parseTotalFormula — totales de grupo (§4)', () => {
  it('reconoce SUM con rango, single y términos restados', () => {
    expect(parseTotalFormula('SUM(I14:I40)')).toEqual({ isTotal: true, subtractedRows: [] });
    expect(parseTotalFormula('SUM(I42)')).toEqual({ isTotal: true, subtractedRows: [] });
    expect(parseTotalFormula('SUM(I173:I177)-I178-I179-I180')).toEqual({
      isTotal: true,
      subtractedRows: [178, 179, 180],
    });
    expect(parseTotalFormula('(E14*G14)*H14').isTotal).toBe(false);
    expect(parseTotalFormula(undefined).isTotal).toBe(false);
  });
});

describe('normalizeItemCode — códigos numéricos equivalentes (§6)', () => {
  it('2.10 ≡ 2.1 y conserva códigos no numéricos', () => {
    expect(normalizeItemCode('2.10')).toBe(normalizeItemCode('2.1'));
    expect(normalizeItemCode('1.01')).toBe('1.01');
    expect(normalizeItemCode(' P-01 ')).toBe('p-01');
    expect(normalizeItemCode(null)).toBe('');
  });
});
