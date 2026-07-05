/**
 * drawing-table-structure.test.ts — Estructura de tablas/cuadros MVP F7C.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSpatialPage,
  spatialPageFromPlainText,
  type SpatialTextItemInput,
} from '@/lib/steel/drawing-spatial-model';
import { dataRowCount, detectTableStructures, tableOfLine } from '@/lib/steel/drawing-table-structure';

/** Cuadro sintético de zapatas: 3 columnas alineadas por X, 4 filas por Y. */
const TABLE_ITEMS: SpatialTextItemInput[] = [
  { str: 'ELEMENTO', x: 100, y: 500, width: 60, height: 10 },
  { str: 'CANT.', x: 250, y: 500, width: 40, height: 10 },
  { str: 'REFUERZO', x: 400, y: 500, width: 70, height: 10 },
  { str: 'Z-01', x: 100, y: 480, width: 30, height: 9 },
  { str: '4', x: 250, y: 480, width: 10, height: 9 },
  { str: '5#5600', x: 400, y: 480, width: 50, height: 9 },
  { str: 'Z-02', x: 100, y: 460, width: 30, height: 9 },
  { str: '6', x: 250, y: 460, width: 10, height: 9 },
  { str: '4#5450', x: 400, y: 460, width: 50, height: 9 },
  { str: 'Z-03', x: 100, y: 440, width: 30, height: 9 },
  { str: '2', x: 250, y: 440, width: 10, height: 9 },
  { str: '6#6600', x: 400, y: 440, width: 50, height: 9 },
];

describe('detectTableStructures (F7C)', () => {
  const page = buildSpatialPage(TABLE_ITEMS, { pageNumber: 2, sourceFileName: 'cuadros.pdf' });
  const result = detectTableStructures(page);

  it('detecta una tabla con filas alineadas y columnas por X', () => {
    expect(result.tables).toHaveLength(1);
    const table = result.tables[0]!;
    expect(table.rows).toHaveLength(4);
    expect(table.columnCount).toBe(3);
    expect(table.pageNumber).toBe(2);
  });

  it('reconoce el encabezado y lo propaga como headerGuess de las celdas', () => {
    const table = result.tables[0]!;
    expect(table.headerGuesses).toEqual(expect.arrayContaining(['ELEMENTO', 'CANT.', 'REFUERZO']));
    const dataRow = table.rows[1]!;
    const cantCell = dataRow.cells.find((cell) => cell.headerGuess === 'CANT.');
    expect(cantCell?.text).toBe('4');
    expect(cantCell?.rowIndex).toBe(1);
    expect(cantCell?.columnIndex).toBe(1);
    expect(cantCell?.tableId).toBe(table.tableId);
    expect(cantCell?.sourcePage).toBe(2);
  });

  it('dataRowCount excluye el encabezado reconocido', () => {
    expect(dataRowCount(result.tables[0]!)).toBe(3);
  });

  it('tableOfLine identifica si un texto proviene de la tabla', () => {
    const table = result.tables[0]!;
    const rowLineId = table.rows[1]!.lineId;
    expect(tableOfLine(result.tables, rowLineId)?.tableId).toBe(table.tableId);
    expect(tableOfLine(result.tables, 'p9-l99')).toBeUndefined();
  });

  it('la tabla lleva confianza y razon (no pretende ser perfecta)', () => {
    const table = result.tables[0]!;
    expect(['alta', 'media', 'baja']).toContain(table.confidence);
    expect(table.reason).toContain('filas alineadas');
  });

  it('texto disperso sin alineacion no produce tablas', () => {
    const scattered = buildSpatialPage(
      [
        { str: 'NOTA UNO', x: 50, y: 500, width: 60, height: 9 },
        { str: 'OTRA COSA', x: 320, y: 430, width: 60, height: 9 },
        { str: 'SUELTO', x: 610, y: 320, width: 40, height: 9 },
      ],
      { pageNumber: 3 },
    );
    expect(detectTableStructures(scattered).tables).toHaveLength(0);
  });

  it('sin coordenadas: sin tablas y con nota honesta (no se adivina)', () => {
    const plain = spatialPageFromPlainText('ELEMENTO CANT.\nZ-01 4\nZ-02 6', { pageNumber: 4 });
    const noCoords = detectTableStructures(plain);
    expect(noCoords.tables).toHaveLength(0);
    expect(noCoords.note).toContain('sin coordenadas');
  });
});
