/**
 * parse-file.ts — Parser seguro server-side de archivos de catálogo
 * (CATALOG_BULK_ONBOARDING_V1, contrato §2). Propiedad: agent-excel-mapper.
 *
 * SOLO server-side (`xlsx`/SheetJS, `node:crypto`). SheetJS lee valores
 * cacheados; **NO evalúa fórmulas ni ejecuta macros**. Acepta .xlsx, .xls y
 * .csv (SheetJS detecta el formato real por contenido).
 *
 * Garantías:
 *  - extensión y tamaño validados ANTES de parsear;
 *  - lectura acotada (`sheetRows`) — nunca se materializan hojas gigantes;
 *  - >5.000 filas de datos ⇒ rechazo claro;
 *  - digest SHA-256 del contenido parseado para integridad preview↔confirmación.
 */
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { CATALOG_IMPORT_LIMITS, CATALOG_IMPORT_EXTENSIONS } from '@/lib/catalog-import/types';
import { CatalogImportFileError, CatalogImportParseError } from './errors';

/** Hoja parseada y acotada: encabezados + filas de datos como strings crudos. */
export interface ParsedCatalogSheet {
  sheetName: string;
  /** Encabezados de la primera fila no vacía (strings crudos, recortados). */
  headers: string[];
  /**
   * Filas de datos (después del encabezado). Cada celda como string recortado
   * (`''` para vacías). El índice respeta las columnas del encabezado.
   */
  rows: string[][];
  /** Fila REAL del archivo (1-based) de cada entrada de `rows`. */
  rowNumbers: number[];
  /** Filas completamente vacías omitidas. */
  omittedEmptyRows: number;
  /** SHA-256 (hex) de headers+rows — integridad del archivo parseado. */
  digest: string;
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return CATALOG_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Valida el File recibido por el server action (extensión + tamaño + no vacío). */
export function assertCatalogImportFile(file: unknown): asserts file is File {
  if (!(file instanceof File) || file.size === 0) {
    throw new CatalogImportFileError('Selecciona un archivo .xlsx, .xls o .csv válido.');
  }
  if (!hasAllowedExtension(file.name)) {
    throw new CatalogImportFileError('Formato no admitido. Usa .xlsx, .xls o .csv.');
  }
  if (file.size > CATALOG_IMPORT_LIMITS.maxFileBytes) {
    const mb = (CATALOG_IMPORT_LIMITS.maxFileBytes / (1024 * 1024)).toFixed(0);
    throw new CatalogImportFileError(`El archivo supera el tamaño máximo de ${mb} MB.`);
  }
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/**
 * Parsea el buffer (xlsx/xls/csv) de forma acotada. La primera fila no vacía
 * se trata como encabezados; el resto son filas de datos.
 */
export function parseCatalogFile(buffer: Buffer, fileName: string): ParsedCatalogSheet {
  if (!hasAllowedExtension(fileName)) {
    throw new CatalogImportFileError('Formato no admitido. Usa .xlsx, .xls o .csv.');
  }
  if (buffer.byteLength > CATALOG_IMPORT_LIMITS.maxFileBytes) {
    throw new CatalogImportFileError('El archivo supera el tamaño máximo permitido.');
  }

  // Lectura acotada: encabezado + maxRows + margen de detección de exceso.
  const sheetRowsCap = CATALOG_IMPORT_LIMITS.maxRows + 32;
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: false,
      cellHTML: false,
      sheetRows: sheetRowsCap,
      // CSV/TXT: lectura literal — una celda "=SUM(...)" queda como texto,
      // jamás se interpreta como fórmula.
      raw: true,
    });
  } catch {
    throw new CatalogImportParseError('El archivo no se pudo leer o está dañado.');
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new CatalogImportParseError('El archivo no contiene hojas legibles.');
  }
  const worksheet = wb.Sheets[sheetName];
  if (!worksheet) {
    throw new CatalogImportParseError('No se pudo leer la primera hoja del archivo.');
  }

  const raw: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });

  // Primera fila no vacía = encabezados.
  let headerRowIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] ?? [];
    if (row.some((c) => cellToString(c) !== '')) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new CatalogImportParseError('El archivo está vacío: no se encontraron encabezados.');
  }

  const headers = (raw[headerRowIdx] ?? []).map(cellToString);

  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let omittedEmptyRows = 0;

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = (raw[i] ?? []).map(cellToString);
    if (row.every((c) => c === '')) {
      omittedEmptyRows++;
      continue;
    }
    rows.push(row);
    rowNumbers.push(i + 1); // 1-based fila real del archivo
    if (rows.length > CATALOG_IMPORT_LIMITS.maxRows) {
      throw new CatalogImportFileError(
        `El archivo supera el máximo de ${CATALOG_IMPORT_LIMITS.maxRows} filas de datos.`,
      );
    }
  }

  // El cap de lectura impide ver más allá: si llegamos al tope físico,
  // tratamos el archivo como excedido (no podemos garantizar el conteo real).
  if (raw.length >= sheetRowsCap && rows.length >= CATALOG_IMPORT_LIMITS.maxRows) {
    throw new CatalogImportFileError(
      `El archivo supera el máximo de ${CATALOG_IMPORT_LIMITS.maxRows} filas de datos.`,
    );
  }

  const digest = createHash('sha256')
    .update(JSON.stringify({ sheetName, headers, rows, rowNumbers }))
    .digest('hex');

  return { sheetName, headers, rows, rowNumbers, omittedEmptyRows, digest };
}
