/**
 * sheet-model.ts — Modelo de celdas de la hoja APU (puro, sin xlsx).
 *
 * El parser estructurado opera sobre este modelo para que las pruebas puedan
 * construir hojas sintéticas sin workbook real. El texto de fórmula (`f`) es
 * SOLO metadato estructural (detección de herramienta derivada); JAMÁS se
 * evalúa ni se persiste.
 */

/** Columnas relevantes de la hoja APU (A..K observadas en el golden master). */
export type ApuColumn = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K';

/** Celda cruda: valor CACHEADO del workbook + texto de fórmula opcional. */
export interface RawCell {
  /** Valor cacheado (string o número). Nunca se evalúan fórmulas. */
  v: string | number | null;
  /** Texto de la fórmula (metadato; no ejecutable, no persistido). */
  f?: string;
}

/** Fila → columna → celda. Solo celdas presentes. */
export type ApuCellGrid = Map<number, Partial<Record<ApuColumn, RawCell>>>;

/** Hoja APU extraída del workbook. */
export interface ApuSheetGrid {
  sheetName: string;
  grid: ApuCellGrid;
  /** Última fila con contenido (1-based). */
  lastRow: number;
  /** SHA-256 hex del contenido extraído (integridad preview↔confirmación). */
  digest: string;
}

/** Valor cacheado como string recortado ('' si vacío). */
export function cellText(cell: RawCell | undefined): string {
  if (!cell || cell.v === null || cell.v === undefined) return '';
  return String(cell.v).trim();
}

/** Valor cacheado numérico, o null si no es un número finito. */
export function cellNumber(cell: RawCell | undefined): number | null {
  if (!cell || cell.v === null || cell.v === undefined) return null;
  if (typeof cell.v === 'number') {
    return Number.isFinite(cell.v) ? cell.v : null;
  }
  const trimmed = String(cell.v).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Elimina marcas diacríticas (NFD + categoría Unicode Mark). */
function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Normalización léxica para comparar etiquetas de la hoja: trim, mayúsculas,
 * sin diacríticos, espacios colapsados.
 */
export function normalizeLabel(value: string): string {
  return stripDiacritics(value).trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Normalización para claves de matching (descripciones): lower, sin
 * diacríticos, espacios colapsados (contrato §4, §7).
 */
export function normalizeDescription(value: string): string {
  return stripDiacritics(value).trim().toLowerCase().replace(/\s+/g, ' ');
}
