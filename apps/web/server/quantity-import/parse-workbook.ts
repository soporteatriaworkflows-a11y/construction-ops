/**
 * parse-workbook.ts — Lectura segura del workbook y extracción de la hoja
 * CANTIDADES 1 PISO (QUANTITY_TAKEOFF_IMPORT_V1, contrato §1). SOLO
 * server-side.
 *
 * SheetJS lee valores CACHEADOS; **no evalúa fórmulas ni ejecuta macros**.
 * `cellFormula: true` expone el TEXTO de las fórmulas como metadato
 * estructural (clasificación geométrica §3 y provenance §11); ese texto jamás
 * se ejecuta como código.
 */
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  QUANTITY_IMPORT_LIMITS,
  QUANTITY_IMPORT_EXTENSIONS,
  QUANTITY_IMPORT_SHEET,
} from '@/lib/quantity-import/types';
import {
  QuantityImportFileError,
  QuantityImportParseError,
  QuantitySheetNotFoundError,
} from './errors';
import type { ApuCellGrid, ApuColumn, ApuSheetGrid, RawCell } from '../apu-import/sheet-model';
import { normalizeLabel } from '../apu-import/sheet-model';

/** Columnas relevantes de la hoja (A..I; J–Q vacías en el golden master §2). */
const COLUMNS: readonly ApuColumn[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
/** Cota dura de filas leídas (la hoja real usa ~692; margen amplio). */
const MAX_SHEET_ROWS = 5000;

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return QUANTITY_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Valida el File recibido por el server action (extensión + tamaño + no vacío). */
export function assertQuantityImportFile(file: unknown): asserts file is File {
  if (!(file instanceof File) || file.size === 0) {
    throw new QuantityImportFileError('Selecciona un workbook .xlsx o .xls válido.');
  }
  if (!hasAllowedExtension(file.name)) {
    throw new QuantityImportFileError('Formato no admitido. Usa un workbook .xlsx o .xls.');
  }
  if (file.size > QUANTITY_IMPORT_LIMITS.maxFileBytes) {
    const mb = (QUANTITY_IMPORT_LIMITS.maxFileBytes / (1024 * 1024)).toFixed(0);
    throw new QuantityImportFileError(`El archivo supera el tamaño máximo de ${mb} MB.`);
  }
}

/**
 * Parsea el buffer y extrae la hoja CANTIDADES 1 PISO como grid de celdas
 * crudas (valor cacheado + texto de fórmula) con digest SHA-256 estable.
 */
export function parseQuantityWorkbook(buffer: Buffer, fileName: string): ApuSheetGrid {
  if (!hasAllowedExtension(fileName)) {
    throw new QuantityImportFileError('Formato no admitido. Usa un workbook .xlsx o .xls.');
  }
  if (buffer.byteLength > QUANTITY_IMPORT_LIMITS.maxFileBytes) {
    throw new QuantityImportFileError('El archivo supera el tamaño máximo permitido.');
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: true,
      cellHTML: false,
      sheetRows: MAX_SHEET_ROWS,
    });
  } catch {
    throw new QuantityImportParseError('El workbook no se pudo leer o está dañado.');
  }

  const targetName = normalizeLabel(QUANTITY_IMPORT_SHEET);
  const sheetName = wb.SheetNames.find((n) => normalizeLabel(n) === targetName);
  if (!sheetName) {
    throw new QuantitySheetNotFoundError();
  }
  const worksheet = wb.Sheets[sheetName];
  if (!worksheet) {
    throw new QuantitySheetNotFoundError();
  }

  const grid: ApuCellGrid = new Map();
  let lastRow = 0;
  const digestEntries: Array<[number, string, string | number | null, string | null]> = [];

  const ref = worksheet['!ref'];
  const range = ref ? XLSX.utils.decode_range(ref) : null;
  const maxRow = Math.min(range ? range.e.r + 1 : 0, MAX_SHEET_ROWS);

  for (let row = 1; row <= maxRow; row++) {
    let rowCells: Partial<Record<ApuColumn, RawCell>> | null = null;
    for (const col of COLUMNS) {
      const cell = worksheet[`${col}${row}`] as XLSX.CellObject | undefined;
      if (!cell) continue;
      const v =
        cell.v === undefined || cell.v === null
          ? null
          : typeof cell.v === 'number' || typeof cell.v === 'string'
            ? cell.v
            : cell.v instanceof Date
              ? cell.v.toISOString()
              : String(cell.v);
      const f = typeof cell.f === 'string' && cell.f.trim() !== '' ? cell.f.trim() : undefined;
      if (v === null && !f) continue;
      if (!rowCells) {
        rowCells = {};
        grid.set(row, rowCells);
      }
      rowCells[col] = f ? { v, f } : { v };
      digestEntries.push([row, col, v, f ?? null]);
    }
    if (rowCells) lastRow = row;
  }

  if (grid.size === 0) {
    throw new QuantityImportParseError('La hoja CANTIDADES 1 PISO está vacía.');
  }

  const digest = createHash('sha256')
    .update(JSON.stringify({ sheetName: targetName, cells: digestEntries }))
    .digest('hex');

  return { sheetName, grid, lastRow, digest };
}
