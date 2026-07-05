/**
 * drawing-table-structure.ts — Estructura de tablas/cuadros MVP (F7C, puro).
 *
 * Los cuadros de zapatas/vigas/pilotes son la fuente más densa de cantidades
 * (`CANT.`), secciones y refuerzos — y F6 los leía como líneas sueltas. Este
 * módulo detecta ESTRUCTURA plausible de tabla desde el modelo espacial:
 * filas alineadas por Y (las líneas espaciales) y columnas por clustering de
 * X de los tokens.
 *
 * Honestidad:
 * - No pretende extraer tablas perfectas: entrega filas/columnas/celdas con
 *   confianza y razón para que el humano confirme (base usable, no verdad).
 * - Sin coordenadas NO se detectan tablas (se dice por qué); nada de "adivinar
 *   columnas" desde texto plano.
 * - Cero cantidades derivadas aquí: las celdas son texto con posición.
 */
import {
  hasUsableLayout,
  type LayoutConfidence,
  type SpatialBBox,
  type SpatialPage,
  type SpatialTextLine,
  type SpatialTextToken,
} from './drawing-spatial-model';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface TableCellStructure {
  tableId: string;
  rowIndex: number;
  columnIndex: number;
  text: string;
  /** Encabezado adivinado de la columna (texto de la fila 0), si existe. */
  headerGuess?: string;
  bbox?: SpatialBBox;
  lineId: string;
  sourcePage: number;
}

export interface TableRowStructure {
  rowIndex: number;
  lineId: string;
  cells: readonly TableCellStructure[];
}

export interface DetectedTableStructure {
  tableId: string;
  pageNumber: number;
  sourceFileName?: string;
  bbox?: SpatialBBox;
  columnCount: number;
  /** Textos de la primera fila cuando parece encabezado. */
  headerGuesses: readonly string[];
  rows: readonly TableRowStructure[];
  confidence: LayoutConfidence;
  reason: string;
}

export interface TableDetectionResult {
  pageNumber: number;
  tables: readonly DetectedTableStructure[];
  /** Diagnóstico honesto cuando no se puede analizar. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Detección
// ---------------------------------------------------------------------------

/** Encabezados típicos de cuadros estructurales (refuerzan confianza). */
const HEADER_HINT_PATTERN =
  /\b(CANT\.?|CANTIDAD|ELEMENTO|TIPO|SECCION|DIMENSION(?:ES)?|LONG\.?|LONGITUD|REFUERZO|ESTRIBOS?|VARILLA|DIAM\.?|Ø|ZAPATA|VIGA|COLUMNA|PILOTE|NIVEL|EJE)\b/;

interface ColumnBand {
  center: number;
  count: number;
}

/** Clustering 1D de posiciones X de arranque de token. */
function clusterColumns(xs: readonly number[], tolerance: number): ColumnBand[] {
  const bands: ColumnBand[] = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    const band = bands.find((b) => Math.abs(b.center - x) <= tolerance);
    if (band) {
      band.center = (band.center * band.count + x) / (band.count + 1);
      band.count += 1;
    } else {
      bands.push({ center: x, count: 1 });
    }
  }
  return bands;
}

function tokenStartX(token: SpatialTextToken): number | undefined {
  return token.bbox?.x;
}

/**
 * ¿Cuántas bandas de columna comparte esta línea con el patrón de bandas?
 */
function matchingBands(line: SpatialTextLine, bands: readonly ColumnBand[], tolerance: number): number {
  let matches = 0;
  for (const token of line.tokens) {
    const x = tokenStartX(token);
    if (x === undefined) continue;
    if (bands.some((band) => Math.abs(band.center - x) <= tolerance)) matches += 1;
  }
  return matches;
}

function unionBBox(boxes: readonly SpatialBBox[]): SpatialBBox | undefined {
  if (boxes.length === 0) return undefined;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Detecta estructuras de tabla en una página espacial.
 *
 * Estrategia MVP: ventanas de líneas consecutivas multi-token; las posiciones
 * X de los tokens de la ventana se agrupan en bandas de columna; si ≥3 líneas
 * consecutivas comparten ≥2 bandas, la ventana es una tabla plausible.
 */
export function detectTableStructures(page: SpatialPage): TableDetectionResult {
  if (!hasUsableLayout(page)) {
    return {
      pageNumber: page.pageNumber,
      tables: [],
      note:
        'Página sin coordenadas: no se pueden inferir columnas alineadas. Las tablas requieren extracción posicionada (PDF nativo).',
    };
  }

  // Solo líneas horizontales con ≥2 tokens posicionados participan.
  const candidates = page.lines.filter(
    (line) =>
      (line.rotation === undefined || line.rotation === 0) &&
      line.tokens.filter((t) => t.bbox !== undefined).length >= 2,
  );
  if (candidates.length < 3) {
    return {
      pageNumber: page.pageNumber,
      tables: [],
      note: 'Menos de 3 líneas multi-columna: sin estructura de tabla plausible en esta página.',
    };
  }

  const tolerance = Math.max((page.extent?.width ?? 500) * 0.02, 6);
  const tables: DetectedTableStructure[] = [];
  let tableSeq = 0;
  let i = 0;

  while (i < candidates.length) {
    // Semilla: la línea i define las bandas iniciales.
    const seed = candidates[i]!;
    const seedXs = seed.tokens.map(tokenStartX).filter((x): x is number => x !== undefined);
    const bands = clusterColumns(seedXs, tolerance);
    if (bands.length < 2) {
      i += 1;
      continue;
    }

    // Extender la ventana mientras las líneas compartan ≥2 bandas.
    const windowLines: SpatialTextLine[] = [seed];
    let j = i + 1;
    while (j < candidates.length) {
      const line = candidates[j]!;
      if (matchingBands(line, bands, tolerance) >= 2) {
        windowLines.push(line);
        // Bandas nuevas de la línea se incorporan (tablas con celdas vacías).
        for (const token of line.tokens) {
          const x = tokenStartX(token);
          if (x === undefined) continue;
          if (!bands.some((band) => Math.abs(band.center - x) <= tolerance)) {
            bands.push({ center: x, count: 1 });
          }
        }
        j += 1;
      } else {
        break;
      }
    }

    if (windowLines.length >= 3) {
      tableSeq += 1;
      const tableId = `p${page.pageNumber}-tbl${tableSeq}`;
      const orderedBands = [...bands].sort((a, b) => a.center - b.center);
      const columnIndexOf = (x: number): number => {
        let best = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        orderedBands.forEach((band, index) => {
          const distance = Math.abs(band.center - x);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
          }
        });
        return best;
      };

      const firstRowText = windowLines[0]!.normalizedText;
      const looksLikeHeader = HEADER_HINT_PATTERN.test(firstRowText) && !/\d{3,}/.test(firstRowText);

      const headerByColumn = new Map<number, string>();
      if (looksLikeHeader) {
        for (const token of windowLines[0]!.tokens) {
          const x = tokenStartX(token);
          if (x === undefined) continue;
          const column = columnIndexOf(x);
          headerByColumn.set(column, [headerByColumn.get(column), token.text].filter(Boolean).join(' '));
        }
      }

      const rows: TableRowStructure[] = windowLines.map((line, rowIndex) => {
        const cellsByColumn = new Map<number, { texts: string[]; boxes: SpatialBBox[] }>();
        for (const token of line.tokens) {
          const x = tokenStartX(token);
          if (x === undefined) continue;
          const column = columnIndexOf(x);
          const cell = cellsByColumn.get(column) ?? { texts: [], boxes: [] };
          cell.texts.push(token.text);
          if (token.bbox) cell.boxes.push(token.bbox);
          cellsByColumn.set(column, cell);
        }
        const cells: TableCellStructure[] = [...cellsByColumn.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([columnIndex, cell]) => ({
            tableId,
            rowIndex,
            columnIndex,
            text: cell.texts.join(' '),
            headerGuess: rowIndex === 0 ? undefined : headerByColumn.get(columnIndex),
            bbox: unionBBox(cell.boxes),
            lineId: line.lineId,
            sourcePage: page.pageNumber,
          }));
        return { rowIndex, lineId: line.lineId, cells };
      });

      tables.push({
        tableId,
        pageNumber: page.pageNumber,
        sourceFileName: page.sourceFileName,
        bbox: unionBBox(
          windowLines.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined),
        ),
        columnCount: orderedBands.length,
        headerGuesses: looksLikeHeader ? [...headerByColumn.values()] : [],
        rows,
        confidence: looksLikeHeader ? 'media' : 'baja',
        reason: looksLikeHeader
          ? `${windowLines.length} filas alineadas en ${orderedBands.length} columnas con encabezado reconocible ("${firstRowText.slice(0, 60)}").`
          : `${windowLines.length} filas alineadas en ${orderedBands.length} columnas, sin encabezado reconocible: confirmar si es tabla.`,
      });
      i += windowLines.length;
    } else {
      i += 1;
    }
  }

  return { pageNumber: page.pageNumber, tables };
}

/** ¿La línea pertenece a alguna tabla detectada? (para evidencias/candidatos) */
export function tableOfLine(
  tables: readonly DetectedTableStructure[],
  lineId: string,
): DetectedTableStructure | undefined {
  return tables.find((table) => table.rows.some((row) => row.lineId === lineId));
}

/** Nº de filas de datos (excluye el encabezado si fue reconocido). */
export function dataRowCount(table: DetectedTableStructure): number {
  return table.headerGuesses.length > 0 ? table.rows.length - 1 : table.rows.length;
}
