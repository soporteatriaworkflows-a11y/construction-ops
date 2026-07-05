/**
 * pdf-text-extract.ts — Lógica PURA de la extracción de texto de PDF (F6B).
 *
 * F6B solo extrae TEXTO SELECCIONABLE. Caso prioritario: PDF técnico/vectorial
 * exportado desde AutoCAD — puede traer texto seleccionable (rótulos, cotas,
 * notas, escala) mezclado con geometría vectorial. Reglas duras:
 * - NO se interpreta geometría, líneas, viewports ni cotas visuales (F6-S1/S2).
 * - La escala escrita ("ESC 1:50") se conserva SOLO como contexto; jamás se usa
 *   para calcular longitudes.
 * - PDF vectorial sin capa de texto ⇒ estado honesto `no_text` (OCR/lectura
 *   geométrica quedan para fases futuras).
 *
 * Este módulo no toca pdfjs ni el DOM: recibe items/textos ya leídos y es
 * 100 % testeable en Node. El borde browser vive en `pdf-text-extract-client.ts`.
 */

export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB — preview local, sin subida
export const MAX_PDF_PAGES = 60;

/** Umbral para considerar que el documento tiene texto utilizable en total. */
const MIN_TOTAL_CHARS = 20;

export type PdfIntakeFileStatus =
  | 'pending'
  | 'reading'
  | 'extracted'
  | 'no_text'
  | 'error';

export interface PdfFileMeta {
  name: string;
  type: string;
  size: number;
}

export function isAcceptablePdfFile(meta: PdfFileMeta): { ok: boolean; reason?: string } {
  const isPdf = meta.type === 'application/pdf' || /\.pdf$/i.test(meta.name);
  if (!isPdf) {
    return { ok: false, reason: 'Solo se aceptan archivos PDF en esta fase.' };
  }
  if (meta.size <= 0) {
    return { ok: false, reason: 'El archivo está vacío.' };
  }
  if (meta.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      reason: `El PDF supera el límite del preview (${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB).`,
    };
  }
  return { ok: true };
}

/** Item de texto ya posicionado (mapeado desde pdfjs en el borde cliente). */
export interface PdfTextItemLike {
  str: string;
  x: number;
  y: number;
}

/**
 * Reconstruye líneas legibles a partir de items posicionados: agrupa por
 * coordenada Y (con tolerancia — los rótulos de CAD rara vez comparten Y
 * exacta), ordena de arriba hacia abajo y de izquierda a derecha. Sin líneas,
 * el detector F6A perdería la asociación elemento↔despiece por renglón.
 */
export function buildPageLines(items: readonly PdfTextItemLike[], yTolerance = 2.5): string {
  const meaningful = items.filter((item) => item.str.trim().length > 0);
  if (meaningful.length === 0) return '';

  const rows: { y: number; items: PdfTextItemLike[] }[] = [];
  for (const item of meaningful) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= yTolerance);
    if (row) {
      row.items.push(item);
      // Y representativa de la fila: promedio incremental (estable y simple).
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y) // PDF: Y crece hacia arriba ⇒ arriba primero
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Escalas ANOTADAS como texto (ESC 1:50 · ESCALA 1:75 · 1:100 suelto).
 * Se conservan como CONTEXTO de página. Nunca alimentan cálculo alguno.
 */
const SCALE_NOTE_PATTERN = /\b(?:ESC(?:ALA)?\.?\s*)?1\s*:\s*(\d{1,4})\b/gi;

export function detectScaleNotes(text: string): string[] {
  const notes = new Set<string>();
  SCALE_NOTE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(SCALE_NOTE_PATTERN)) {
    const ratio = match[1];
    if (!ratio) continue;
    // Solo ratios plausibles de plano; evita horas (15:30) exigiendo "1:".
    notes.add(`1:${ratio}`);
  }
  return [...notes];
}

export interface ExtractedPdfPage {
  pageNumber: number;
  /** Texto reconstruido por líneas (editable después por el usuario). */
  text: string;
  charCount: number;
  hasText: boolean;
  /** Escalas anotadas detectadas — SOLO contexto, jamás cálculo (F6-S2). */
  scaleNotes: string[];
  /** Nº de operaciones de dibujo de la página (señal F6C de texto oculto). */
  drawingOpCount?: number;
}

export function shapeExtractedPage(pageNumber: number, rawText: string): ExtractedPdfPage {
  const text = rawText.trim();
  return {
    pageNumber,
    text,
    charCount: text.length,
    hasText: text.length > 0,
    scaleNotes: detectScaleNotes(text),
  };
}

export interface PdfExtractionSummary {
  status: Extract<PdfIntakeFileStatus, 'extracted' | 'no_text'>;
  pageCount: number;
  pagesWithText: number;
  totalChars: number;
}

/**
 * Clasifica el resultado global. Un plano vectorial de AutoCAD sin capa de
 * texto produce páginas vacías ⇒ `no_text` (mensaje honesto, sin inventar).
 */
export function classifyPdfExtraction(pages: readonly ExtractedPdfPage[]): PdfExtractionSummary {
  const pagesWithText = pages.filter((page) => page.hasText).length;
  const totalChars = pages.reduce((acc, page) => acc + page.charCount, 0);
  return {
    status: totalChars >= MIN_TOTAL_CHARS ? 'extracted' : 'no_text',
    pageCount: pages.length,
    pagesWithText,
    totalChars,
  };
}

/** Mensaje canónico cuando no hay capa de texto utilizable (caso AutoCAD vectorial). */
export const PDF_NO_TEXT_MESSAGE =
  'Este PDF no contiene texto seleccionable suficiente (típico de planos vectoriales o escaneados sin capa de texto). Para leerlo se requiere OCR o lectura geométrica (fases futuras) o revisión manual: puedes pegar el texto a mano abajo.';

/** Junta las páginas seleccionadas para copiar/portapapeles, con separadores. */
export function joinPagesForClipboard(
  pages: readonly Pick<ExtractedPdfPage, 'pageNumber' | 'text'>[],
): string {
  return pages
    .filter((page) => page.text.trim().length > 0)
    .map((page) => `— Página ${page.pageNumber} —\n${page.text.trim()}`)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Plan Set (paquete de planos fuente) — tipos de fuente por página
// ---------------------------------------------------------------------------

/**
 * Tipo de fuente de una página dentro del paquete de planos del takeoff.
 * Un mismo PDF puede mezclar tipos (planta en p.1, cuadro en p.2, despiece
 * en p.3): la clasificación es POR PÁGINA y siempre corregible por el humano.
 */
export type PlanSourceType =
  | 'ubicacion_ejes'
  | 'refuerzo_despiece'
  | 'detalle_corte'
  | 'tabla_cuadro'
  | 'notas'
  | 'otro';

export const PLAN_SOURCE_TYPE_LABEL: Record<PlanSourceType, string> = {
  ubicacion_ejes: 'Ubicacion/ejes',
  refuerzo_despiece: 'Refuerzo/despiece',
  detalle_corte: 'Detalle/corte',
  tabla_cuadro: 'Tabla/cuadro',
  notas: 'Notas',
  otro: 'Otro',
};

export const PLAN_SOURCE_TYPES: readonly PlanSourceType[] = [
  'ubicacion_ejes',
  'refuerzo_despiece',
  'detalle_corte',
  'tabla_cuadro',
  'notas',
  'otro',
];

const SOURCE_TYPE_KEYWORDS: readonly { type: PlanSourceType; pattern: RegExp; reason: string }[] = [
  { type: 'tabla_cuadro', pattern: /\bCUADRO\s+DE\s+(ZAPATAS?|COLUMNAS?|VIGAS?|PILOTES?)\b/i, reason: 'contiene "CUADRO DE …"' },
  { type: 'refuerzo_despiece', pattern: /\bDESPIECES?\b|\bREFUERZO\b/i, reason: 'contiene "DESPIECE"/"REFUERZO"' },
  { type: 'detalle_corte', pattern: /\bDETALLES?\b|\bCORTES?\s+[A-Z0-9]\s*-\s*[A-Z0-9]\b|\bSECCION(?:ES)?\b/i, reason: 'contiene "DETALLE"/"CORTE"/"SECCION"' },
  { type: 'ubicacion_ejes', pattern: /\bPLANTA\b|\bLOCALIZACI[OÓ]N\b|\bEJES?\b/i, reason: 'contiene "PLANTA"/"LOCALIZACION"/"EJES"' },
  { type: 'notas', pattern: /\bNOTAS?\s+(GENERALES?|ESTRUCTURALES?)\b/i, reason: 'contiene "NOTAS GENERALES/ESTRUCTURALES"' },
];

/**
 * SUGIERE (nunca impone) el tipo de fuente de una página a partir de su texto.
 * El usuario siempre puede corregirlo: es clasificación asistida, no verdad.
 */
export function suggestSourceTypeFromText(
  text: string,
): { type: PlanSourceType; reason: string } | undefined {
  for (const { type, pattern, reason } of SOURCE_TYPE_KEYWORDS) {
    if (pattern.test(text)) return { type, reason };
  }
  return undefined;
}
