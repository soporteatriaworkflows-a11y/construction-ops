/**
 * drawing-grid-context.ts — Ejes/grilla como sistema de referencia (F7B, puro).
 *
 * En F6B los códigos de eje ("EJE A-1") se EXCLUÍAN como ruido. En un plano
 * real los ejes son la ubicación: "VC-EJE-1" vive entre las burbujas A/B/C y
 * 1/2/3 del borde de la planta. Este módulo detecta etiquetas de eje y deriva
 * CONTEXTO de ubicación para elementos — siempre como sugerencia con razón,
 * jamás como medida (F7-S2: la posición no es fuente de cantidades).
 *
 * Honestidad:
 * - Si solo hay ruido (tokens cortos sin patrón de borde), NO se inventa una
 *   grilla: `gridDetected: false` con la razón.
 * - Si un elemento no se puede ubicar, se dice POR QUÉ (sin bbox, sin ejes,
 *   demasiado lejos).
 */
import {
  bboxCenterDistance,
  hasUsableLayout,
  type SpatialBBox,
  type SpatialPage,
  type SpatialTextLine,
} from './drawing-spatial-model';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type AxisOrientation = 'vertical' | 'horizontal' | 'desconocida';

/** Etiqueta de eje detectada (la burbuja "A", "B", "1", "2" del borde). */
export interface GridAxisLabel {
  name: string;
  /** 'vertical' = eje que corre de arriba a abajo (etiquetas en banda superior/inferior). */
  orientation: AxisOrientation;
  pageNumber: number;
  lineId: string;
  bbox?: SpatialBBox;
  reason: string;
}

export interface PageGridContext {
  pageNumber: number;
  sourceFileName?: string;
  gridDetected: boolean;
  possibleGridAxes: readonly GridAxisLabel[];
  /** Nombres de eje mencionados en texto corrido ("EJE A", "VC-EJE-1"). */
  textualAxisMentions: readonly string[];
  reason: string;
}

export type LocationConfidence = 'alta' | 'media' | 'baja' | 'no_ubicable';

/** Contexto de ubicación SUGERIDO para un elemento. Nunca una medida. */
export interface ElementLocationContext {
  elementText: string;
  pageNumber: number;
  nearbyAxisLabels: readonly string[];
  /** Frase honesta: "cerca de los ejes B y 2". */
  locationContext?: string;
  locationConfidence: LocationConfidence;
  reason: string;
}

// ---------------------------------------------------------------------------
// Detección de etiquetas de eje
// ---------------------------------------------------------------------------

/** Token corto plausible de burbuja de eje: A, B, AA, 1, 12, A1. */
const AXIS_LABEL_PATTERN = /^(?:[A-Z]{1,2}|\d{1,2}|[A-Z]\d)$/;

/** Mención textual de eje en línea corrida: "EJE A", "EJES 1 A 5", "EJE B-2". */
const TEXTUAL_AXIS_PATTERN = /\bEJES?\s+([A-Z0-9]{1,3}(?:\s*[-–AY,]\s*[A-Z0-9]{1,3})*)\b/g;

/** Códigos con EJE embebido ("VC-EJE-1"): el sufijo es un nombre de eje. */
const EMBEDDED_AXIS_PATTERN = /\b[A-Z]{1,4}[-\s]EJE[-\s]([A-Z0-9]{1,3})\b/g;

/**
 * Línea de burbujas de eje: TODOS sus tokens son etiquetas cortas. Las
 * burbujas de una misma banda (A · B · C) comparten renglón en el modelo
 * espacial, así que la detección real es por TOKEN dentro de estas líneas.
 */
function isAxisLabelLine(line: SpatialTextLine): boolean {
  return (
    line.tokens.length > 0 &&
    line.tokens.every((token) => AXIS_LABEL_PATTERN.test(token.normalizedText))
  );
}

/**
 * Banda de borde: las burbujas de eje viven en los márgenes de la planta.
 * `edgeBandPct` define qué fracción del alto/ancho cuenta como borde.
 */
function edgeOrientation(
  bbox: SpatialBBox,
  extent: SpatialBBox,
  edgeBandPct = 0.18,
): AxisOrientation | undefined {
  const bandX = extent.width * edgeBandPct;
  const bandY = extent.height * edgeBandPct;
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const nearLeft = cx <= extent.x + bandX;
  const nearRight = cx >= extent.x + extent.width - bandX;
  const nearTop = cy >= extent.y + extent.height - bandY;
  const nearBottom = cy <= extent.y + bandY;
  // Banda superior/inferior ⇒ el eje corre vertical; banda lateral ⇒ horizontal.
  if (nearTop || nearBottom) return 'vertical';
  if (nearLeft || nearRight) return 'horizontal';
  return undefined;
}

/**
 * Detecta el contexto de grilla de una página. Requiere AL MENOS dos
 * etiquetas de la misma familia (letras o números) en bandas de borde para
 * afirmar `gridDetected` — una sola letra suelta es ruido, no una grilla.
 */
export function detectGridContext(page: SpatialPage): PageGridContext {
  const textualAxisMentions = collectTextualAxisMentions(page);

  if (!hasUsableLayout(page)) {
    return {
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      gridDetected: false,
      possibleGridAxes: [],
      textualAxisMentions,
      reason:
        textualAxisMentions.length > 0
          ? 'Sin coordenadas no se puede ubicar la grilla; hay menciones textuales de ejes que sirven solo como contexto.'
          : 'Sin coordenadas y sin menciones de ejes: no hay grilla detectable en esta página.',
    };
  }

  const extent = page.extent;
  if (!extent || extent.width <= 0 || extent.height <= 0) {
    return {
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      gridDetected: false,
      possibleGridAxes: [],
      textualAxisMentions,
      reason: 'La extensión de la página no es utilizable para bandas de borde.',
    };
  }

  const labels: GridAxisLabel[] = [];
  for (const line of page.lines) {
    if (!isAxisLabelLine(line)) continue;
    for (const token of line.tokens) {
      if (!token.bbox) continue;
      const orientation = edgeOrientation(token.bbox, extent);
      if (!orientation) continue; // token corto en el centro: rótulo, no burbuja
      labels.push({
        name: token.normalizedText,
        orientation,
        pageNumber: page.pageNumber,
        lineId: line.lineId,
        bbox: token.bbox,
        reason: `Token corto "${token.text}" en banda de borde (${orientation === 'vertical' ? 'superior/inferior' : 'lateral'}).`,
      });
    }
  }

  const letterLabels = labels.filter((l) => /^[A-Z]{1,2}$/.test(l.name));
  const numberLabels = labels.filter((l) => /^\d{1,2}$/.test(l.name));
  const distinctLetters = new Set(letterLabels.map((l) => l.name)).size;
  const distinctNumbers = new Set(numberLabels.map((l) => l.name)).size;
  const gridDetected = distinctLetters >= 2 || distinctNumbers >= 2;

  return {
    pageNumber: page.pageNumber,
    sourceFileName: page.sourceFileName,
    gridDetected,
    possibleGridAxes: labels,
    textualAxisMentions,
    reason: gridDetected
      ? `Grilla plausible: ${distinctLetters} eje(s) por letra y ${distinctNumbers} eje(s) por número en bandas de borde.`
      : labels.length > 0
        ? `Solo ${labels.length} etiqueta(s) de borde sin familia repetida (letras/números): insuficiente para afirmar una grilla — no se inventa.`
        : 'No hay tokens cortos en bandas de borde: la página no parece una planta con grilla.',
  };
}

/** Menciones textuales de ejes en el texto corrido de la página. */
export function collectTextualAxisMentions(page: Pick<SpatialPage, 'lines'>): string[] {
  const mentions = new Set<string>();
  for (const line of page.lines) {
    TEXTUAL_AXIS_PATTERN.lastIndex = 0;
    for (const match of line.normalizedText.matchAll(TEXTUAL_AXIS_PATTERN)) {
      if (match[1]) mentions.add(`EJE ${match[1].replace(/\s+/g, ' ').trim()}`);
    }
    EMBEDDED_AXIS_PATTERN.lastIndex = 0;
    for (const match of line.normalizedText.matchAll(EMBEDDED_AXIS_PATTERN)) {
      if (match[1]) mentions.add(`EJE ${match[1]}`);
    }
  }
  return [...mentions];
}

// ---------------------------------------------------------------------------
// Ubicación de elementos contra la grilla
// ---------------------------------------------------------------------------

/**
 * Deriva el contexto de ubicación de un elemento (rótulo con bbox) contra la
 * grilla detectada. Distancia relativa al tamaño de página; si no alcanza,
 * se dice por qué en vez de forzar una ubicación.
 */
export function locateElementInGrid(
  element: { text: string; bbox?: SpatialBBox; pageNumber: number },
  grid: PageGridContext,
  pageExtent?: SpatialBBox,
): ElementLocationContext {
  if (!grid.gridDetected || grid.possibleGridAxes.length === 0) {
    return {
      elementText: element.text,
      pageNumber: element.pageNumber,
      nearbyAxisLabels: [],
      locationConfidence: 'no_ubicable',
      reason: `Sin grilla detectada en la página ${element.pageNumber}: ${grid.reason}`,
    };
  }
  if (!element.bbox) {
    return {
      elementText: element.text,
      pageNumber: element.pageNumber,
      nearbyAxisLabels: [],
      locationConfidence: 'no_ubicable',
      reason: 'El rótulo del elemento no tiene coordenadas (texto pegado/OCR plano): no se puede cruzar con la grilla.',
    };
  }

  const diagonal = pageExtent
    ? Math.hypot(pageExtent.width, pageExtent.height)
    : Math.max(
        ...grid.possibleGridAxes
          .filter((axis) => axis.bbox)
          .map((axis) => bboxCenterDistance(element.bbox!, axis.bbox!)),
        1,
      );
  const threshold = diagonal * 0.45;

  const scored = grid.possibleGridAxes
    .filter((axis) => axis.bbox)
    .map((axis) => ({ axis, distance: bboxCenterDistance(element.bbox!, axis.bbox!) }))
    .sort((a, b) => a.distance - b.distance);

  const nearestVertical = scored.find((s) => s.axis.orientation === 'vertical' && s.distance <= threshold);
  const nearestHorizontal = scored.find(
    (s) => s.axis.orientation === 'horizontal' && s.distance <= threshold,
  );
  const nearby = [nearestVertical, nearestHorizontal]
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => s.axis.name);

  if (nearby.length === 0) {
    return {
      elementText: element.text,
      pageNumber: element.pageNumber,
      nearbyAxisLabels: [],
      locationConfidence: 'no_ubicable',
      reason:
        'Hay grilla en la página pero el rótulo queda lejos de todas las burbujas de eje: no se sugiere ubicación para no inventar.',
    };
  }

  const both = nearby.length === 2;
  return {
    elementText: element.text,
    pageNumber: element.pageNumber,
    nearbyAxisLabels: nearby,
    locationContext: both
      ? `Cerca de la intersección de ejes ${nearby[0]} y ${nearby[1]} (sugerido por posición del rótulo).`
      : `Cerca del eje ${nearby[0]} (sugerido por posición del rótulo; falta el eje perpendicular).`,
    locationConfidence: both ? 'media' : 'baja',
    reason: both
      ? 'Rótulo dentro del umbral de distancia de un eje por letra/número en ambas orientaciones.'
      : 'Solo un eje dentro del umbral: la ubicación es parcial.',
  };
}
