/**
 * helpers.ts — Constructores de hojas APU SINTÉTICAS para pruebas
 * (ENTRE_PATIOS_APU_IMPORT_V1). 100% datos ficticios sanitizados; el workbook
 * real (golden master) JAMÁS entra al repositorio.
 */
import * as XLSX from 'xlsx';
import type { ApuCellGrid, ApuColumn, RawCell } from '@/server/apu-import/sheet-model';

export type CellSpec = [row: number, col: ApuColumn, v: string | number | null, f?: string];

/** Construye un grid de celdas a partir de specs (fila, columna, valor, fórmula). */
export function gridFromCells(cells: CellSpec[]): { grid: ApuCellGrid; lastRow: number } {
  const grid: ApuCellGrid = new Map();
  let lastRow = 0;
  for (const [row, col, v, f] of cells) {
    const rowCells = grid.get(row) ?? {};
    const cell: RawCell = f ? { v, f } : { v };
    rowCells[col] = cell;
    grid.set(row, rowCells);
    lastRow = Math.max(lastRow, row);
  }
  return { grid, lastRow };
}

/**
 * Bloque salarial sintético (valores ficticios):
 *   Ayudante: SMLV 1.000.000 × 1.5 ⇒ hora 10.250
 *   Oficial:  SMLV 1.000.000 × 2.0 ⇒ hora 12.750
 *   Cuadrilla 2 Ayudantes + 1 Oficial ⇒ 33.250 / HC
 */
export function salaryBlockCells(): CellSpec[] {
  return [
    // Bloque AYUDANTE
    [2, 'A', 'S-AYUDANTE'], [2, 'B', 'AYUDANTES'],
    [3, 'A', 'S-AYUDANTE-01'], [3, 'B', 'Salario minimo legal vigente'], [3, 'C', 'Mes'], [3, 'D', 1.5], [3, 'E', 1], [3, 'F', 1000000],
    [4, 'A', 'S-AYUDANTE-02'], [4, 'B', 'Subsidio de transporte'], [4, 'C', 'Mes'], [4, 'D', 1], [4, 'E', 1], [4, 'F', 100000],
    [5, 'A', 'S-AYUDANTE-03'], [5, 'B', 'Prestaciones legales'], [5, 'C', 'Mes'], [5, 'D', 1], [5, 'E', 0.2], [5, 'F', 200000],
    [6, 'A', 'S-AYUDANTE-04'], [6, 'B', 'Seguridad social'], [6, 'C', 'Mes'], [6, 'D', 1], [6, 'E', 0.1], [6, 'F', 100000],
    [7, 'A', 'S-AYUDANTE-05'], [7, 'B', 'Parafiscales'], [7, 'C', 'Mes'], [7, 'D', 1], [7, 'E', 0.05], [7, 'F', 50000],
    [8, 'A', 'S-AYUDANTE-06'], [8, 'B', 'Dotacion cada 3 meses'], [8, 'C', 'Mes'], [8, 'D', 1 / 3], [8, 'F', 300000],
    [9, 'A', 'S-AYUDANTE-07'], [9, 'B', 'COSTO SALARIO'], [9, 'C', 'DIA'], [9, 'D', 25], [9, 'F', 2050000],
    [10, 'B', 'COSTO SALARIO INTEGRAL HORA'], [10, 'C', 'HR'], [10, 'D', 8], [10, 'F', 10250],
    // Bloque OFICIAL
    [12, 'A', 'S-OFICIAL'], [12, 'B', 'OFICIAL'],
    [13, 'A', 'S-OFICIAL-01'], [13, 'B', 'Salario minimo legal vigente'], [13, 'C', 'Mes'], [13, 'D', 2], [13, 'E', 1], [13, 'F', 1000000],
    [14, 'A', 'S-OFICIAL-02'], [14, 'B', 'Subsidio de transporte'], [14, 'C', 'Mes'], [14, 'D', 1], [14, 'E', 1], [14, 'F', 100000],
    [15, 'A', 'S-OFICIAL-03'], [15, 'B', 'Prestaciones legales'], [15, 'C', 'Mes'], [15, 'D', 1], [15, 'E', 0.2], [15, 'F', 200000],
    [16, 'A', 'S-OFICIAL-04'], [16, 'B', 'Seguridad social'], [16, 'C', 'Mes'], [16, 'D', 1], [16, 'E', 0.1], [16, 'F', 100000],
    [17, 'A', 'S-OFICIAL-05'], [17, 'B', 'Parafiscales'], [17, 'C', 'Mes'], [17, 'D', 1], [17, 'E', 0.05], [17, 'F', 50000],
    [18, 'A', 'S-OFICIAL-06'], [18, 'B', 'Dotacion cada 3 meses'], [18, 'C', 'Mes'], [18, 'D', 1 / 3], [18, 'F', 300000],
    [19, 'A', 'S-OFICIAL-07'], [19, 'B', 'COSTO SALARIO'], [19, 'C', 'DIA'], [19, 'D', 25], [19, 'F', 2550000],
    [20, 'B', 'COSTO SALARIO INTEGRAL HORA'], [20, 'C', 'HR'], [20, 'D', 8], [20, 'F', 12750],
  ];
}

/** Header de actividades en la fila indicada. */
export function activitiesHeaderCells(row: number): CellSpec[] {
  return [
    [row, 'A', 'ID'],
    [row, 'B', 'DESCRIPCION'],
    [row, 'C', 'UND'],
    [row, 'D', 'CANT'],
    [row, 'E', 'DESPER'],
    [row, 'F', 'VR UNIT'],
    [row, 'G', 'VR TOTAL'],
  ];
}

/**
 * Actividad sintética estándar (3 componentes: insumo, M.O., herramienta
 * derivada 35%) que inicia en `startRow`.
 *   Insumo:  0.1 × (1+0.1) × 31827 = 3500.97
 *   M.O.:    0.2 HC × 33250 = 6650
 *   Herr.:   35% × 6650 = 2327.5
 *   TOTAL:   12478.47
 */
export function standardActivityCells(
  startRow: number,
  options?: {
    code?: string;
    description?: string;
    unit?: string;
    materialDescription?: string;
    excelTotalOverride?: number;
  },
): CellSpec[] {
  const r = startRow;
  const code = options?.code ?? 'P-01';
  const description = options?.description ?? 'Demolición de muro sintético';
  const unit = options?.unit ?? 'M2';
  const materialDescription = options?.materialDescription ?? 'Cemento gris x 50Kg';
  const excelTotal = options?.excelTotalOverride ?? 12478.47;
  return [
    [r, 'A', code], [r, 'B', description, "'COTIZACION FULL'!C14"], [r, 'C', unit],
    [r + 1, 'A', 'Insumo'], [r + 1, 'B', materialDescription, "'LISTADO MATERIALES'!C31"], [r + 1, 'C', 'Un'],
    [r + 1, 'D', 0.1, '1/10'], [r + 1, 'E', 0.1], [r + 1, 'F', 31827, "'LISTADO MATERIALES'!G31"], [r + 1, 'G', 3500.97, `(F${r + 1}*D${r + 1})+((D${r + 1}*E${r + 1})*F${r + 1})`],
    [r + 2, 'A', 'M.O'], [r + 2, 'B', 'Mano de obra 2 Ayudantes + 1 Oficial'], [r + 2, 'C', 'HC'],
    [r + 2, 'D', 0.2], [r + 2, 'E', 0], [r + 2, 'F', 33250, '(F10*2)+F20'], [r + 2, 'G', 6650, `(F${r + 2}*D${r + 2})+((D${r + 2}*E${r + 2})*F${r + 2})`],
    [r + 3, 'A', 'Herramienta'], [r + 3, 'B', 'Herramienta menor'], [r + 3, 'C', 'Gbl'],
    [r + 3, 'D', 1], [r + 3, 'E', 0], [r + 3, 'F', 2327.5, `G${r + 2}*35%`], [r + 3, 'G', 2327.5, `(F${r + 3}*D${r + 3})+((D${r + 3}*E${r + 3})*F${r + 3})`],
    [r + 4, 'B', 'TOTAL COSTO ACTIVIDAD'], [r + 4, 'G', excelTotal, `SUM(G${r + 1}:G${r + 3})`],
  ];
}

/** Hoja sintética completa: salarios + header (fila 25) + actividades. */
export function syntheticSheet(extraActivities?: CellSpec[]): { grid: ApuCellGrid; lastRow: number } {
  return gridFromCells([
    ...salaryBlockCells(),
    ...activitiesHeaderCells(25),
    ...standardActivityCells(26),
    ...(extraActivities ?? []),
  ]);
}

/**
 * Workbook xlsx EN MEMORIA con las hojas dadas (para probar parse-workbook).
 * Cada hoja recibe sus celdas (v y opcionalmente f, jamás evaluadas).
 */
export function workbookFile(
  sheets: Array<{ name: string; cells: CellSpec[] }>,
  fileName = 'sintetico.xlsx',
): File {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws: XLSX.WorkSheet = {};
    let maxRow = 1;
    for (const [row, col, v, f] of sheet.cells) {
      const addr = `${col}${row}`;
      const cell: XLSX.CellObject =
        typeof v === 'number' ? { t: 'n', v } : { t: 's', v: v ?? '' };
      if (f) cell.f = f;
      ws[addr] = cell;
      maxRow = Math.max(maxRow, row);
    }
    ws['!ref'] = `A1:K${maxRow}`;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new File([new Uint8Array(buffer)], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Identificadores de recursos sintéticos para matching. */
export function resourceIdentifiers() {
  return [
    {
      id: '00000000-0000-4000-8000-0000000000a1',
      code: 'MAT-CEM-001',
      name: 'Cemento gris x 50Kg',
      unit: 'Un',
      externalSku: 'SKU-123',
      externalReference: 'REF-456',
    },
    {
      id: '00000000-0000-4000-8000-0000000000b2',
      code: 'MAT-ARE-001',
      name: 'Arena fina',
      unit: 'm3',
      externalSku: null,
      externalReference: null,
    },
  ];
}
