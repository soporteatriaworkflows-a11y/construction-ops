/**
 * drawing-spatial-model.ts — Modelo de texto POSICIONADO del plano (F7A, puro).
 *
 * Problema raíz de F6: `buildPageLines` aplana los items posicionados de pdfjs
 * a texto plano y las coordenadas se pierden. Sin posición no hay regiones, ni
 * ejes, ni tablas, ni relaciones espaciales: solo líneas aisladas.
 *
 * Este módulo conserva la posición SIN reemplazar el flujo F6: es una
 * estructura PARALELA. `buildPageLines` sigue siendo la vista "texto por
 * líneas" para el detector F6A y el fallback manual.
 *
 * Reglas duras (F7-S1…S8, espejo del blueprint F7):
 * - La posición es CONTEXTO y EVIDENCIA, jamás fuente de medida (sin escala).
 * - Texto sin coordenadas (pegado manual, OCR plano) produce un modelo
 *   degradado con `layoutConfidence: 'baja'` y razón explícita — no se
 *   inventan posiciones.
 * - Cero cálculo de ml/kg/costo: F1 sigue siendo la única calculadora.
 * - Sin DB, sin red, sin DOM: 100 % testeable en Node.
 */
import type { PlanSourceType } from './pdf-text-extract';

// ---------------------------------------------------------------------------
// Tipos base
// ---------------------------------------------------------------------------

export interface SpatialBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SpatialTextMethod = 'native_text' | 'ocr' | 'manual';

/**
 * Item crudo tal como lo entrega el borde browser (pdfjs) o el fallback de
 * texto plano. `x/y` son coordenadas de página PDF (origen abajo-izquierda,
 * Y crece hacia arriba). `width/height/fontSize/rotation` son opcionales:
 * el modelo es honesto sobre lo que no tiene.
 */
export interface SpatialTextItemInput {
  str: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Altura de fuente aproximada derivada del transform de pdfjs. */
  fontSize?: number;
  /** Rotación en grados (0 = horizontal; cotas verticales ≈ 90/-90). */
  rotation?: number;
}

/** Token de texto posicionado — unidad mínima del modelo espacial. */
export interface SpatialTextToken {
  tokenId: string;
  pageNumber: number;
  sourceFileName?: string;
  sourceType?: PlanSourceType;
  text: string;
  normalizedText: string;
  /** Ausente solo cuando la fuente no trae coordenadas (manual/OCR plano). */
  bbox?: SpatialBBox;
  rotation?: number;
  fontSize?: number;
  method: SpatialTextMethod;
  /** Confianza de lectura declarada por la fuente (OCR); string decimal 0–1. */
  confidence?: string;
  lineId?: string;
}

/** Línea espacial: tokens agrupados por renglón, CON su caja envolvente. */
export interface SpatialTextLine {
  lineId: string;
  pageNumber: number;
  sourceFileName?: string;
  sourceType?: PlanSourceType;
  text: string;
  normalizedText: string;
  bbox?: SpatialBBox;
  rotation?: number;
  /** Altura de fuente representativa (máxima de los tokens). */
  fontSize?: number;
  method: SpatialTextMethod;
  tokens: readonly SpatialTextToken[];
}

export type LayoutConfidence = 'alta' | 'media' | 'baja';

/** Página del modelo espacial, con diagnóstico honesto de layout. */
export interface SpatialPage {
  pageNumber: number;
  sourceFileName?: string;
  sourceType?: PlanSourceType;
  method: SpatialTextMethod;
  lines: readonly SpatialTextLine[];
  /** Extensión total del texto de la página (si hay coordenadas). */
  extent?: SpatialBBox;
  layoutConfidence: LayoutConfidence;
  layoutConfidenceReason: string;
}

// ---------------------------------------------------------------------------
// Normalización de texto (comparaciones; el texto original nunca se pierde)
// ---------------------------------------------------------------------------

/**
 * Normaliza texto para COMPARAR (mayúsculas, espacios colapsados, variantes
 * de diámetro Ø unificadas). El texto original queda intacto en `text`.
 */
export function normalizeDrawingText(text: string): string {
  return text
    .replace(/[øΦφ⌀]/g, 'Ø')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Construcción del modelo
// ---------------------------------------------------------------------------

export interface BuildSpatialPageOptions {
  pageNumber: number;
  sourceFileName?: string;
  sourceType?: PlanSourceType;
  method?: SpatialTextMethod;
  /** Tolerancia vertical para agrupar tokens en renglones (unidades PDF). */
  yTolerance?: number;
}

function unionBBox(boxes: readonly SpatialBBox[]): SpatialBBox | undefined {
  if (boxes.length === 0) return undefined;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bucket de rotación: tokens horizontales y verticales no comparten renglón. */
function rotationBucket(rotation: number | undefined): number {
  if (rotation === undefined) return 0;
  return Math.round(rotation / 45) * 45;
}

/**
 * Construye la página espacial desde items posicionados. Mismo criterio de
 * agrupación por Y que `buildPageLines` (F6B) para que la vista de líneas y
 * el modelo espacial cuenten la misma historia, pero SIN perder coordenadas.
 */
export function buildSpatialPage(
  items: readonly SpatialTextItemInput[],
  options: BuildSpatialPageOptions,
): SpatialPage {
  const method = options.method ?? 'native_text';
  const yTolerance = options.yTolerance ?? 2.5;
  const meaningful = items.filter((item) => item.str.trim().length > 0);

  interface Row {
    y: number;
    bucket: number;
    items: SpatialTextItemInput[];
  }
  const rows: Row[] = [];
  for (const item of meaningful) {
    const bucket = rotationBucket(item.rotation);
    const row = rows.find((r) => r.bucket === bucket && Math.abs(r.y - item.y) <= yTolerance);
    if (row) {
      row.items.push(item);
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
    } else {
      rows.push({ y: item.y, bucket, items: [item] });
    }
  }

  const lines: SpatialTextLine[] = rows
    .sort((a, b) => b.y - a.y) // PDF: Y crece hacia arriba ⇒ arriba primero
    .map((row, rowIndex) => {
      const lineId = `p${options.pageNumber}-l${rowIndex + 1}`;
      const sorted = [...row.items].sort((a, b) => a.x - b.x);
      const tokens: SpatialTextToken[] = sorted.map((item, tokenIndex) => ({
        tokenId: `${lineId}-t${tokenIndex + 1}`,
        pageNumber: options.pageNumber,
        sourceFileName: options.sourceFileName,
        sourceType: options.sourceType,
        text: item.str.trim(),
        normalizedText: normalizeDrawingText(item.str),
        bbox: {
          x: item.x,
          y: item.y,
          width: item.width ?? 0,
          height: item.height ?? item.fontSize ?? 0,
        },
        rotation: item.rotation,
        fontSize: item.fontSize,
        method,
        lineId,
      }));
      const text = tokens.map((t) => t.text).join(' ').replace(/\s+/g, ' ').trim();
      const fontSizes = tokens
        .map((t) => t.fontSize)
        .filter((size): size is number => size !== undefined && size > 0);
      return {
        lineId,
        pageNumber: options.pageNumber,
        sourceFileName: options.sourceFileName,
        sourceType: options.sourceType,
        text,
        normalizedText: normalizeDrawingText(text),
        bbox: unionBBox(tokens.map((t) => t.bbox).filter((b): b is SpatialBBox => b !== undefined)),
        rotation: row.bucket === 0 ? undefined : row.bucket,
        fontSize: fontSizes.length > 0 ? Math.max(...fontSizes) : undefined,
        method,
        tokens,
      };
    })
    .filter((line) => line.text.length > 0);

  const extent = unionBBox(
    lines.map((line) => line.bbox).filter((b): b is SpatialBBox => b !== undefined),
  );

  const layout: { confidence: LayoutConfidence; reason: string } =
    lines.length === 0
      ? { confidence: 'baja', reason: 'La página no tiene texto posicionado.' }
      : method === 'native_text'
        ? {
            confidence: 'alta',
            reason: 'Coordenadas nativas de pdfjs conservadas para todos los tokens.',
          }
        : {
            confidence: 'media',
            reason: 'Coordenadas presentes pero provenientes de OCR: la posición puede ser imprecisa.',
          };

  return {
    pageNumber: options.pageNumber,
    sourceFileName: options.sourceFileName,
    sourceType: options.sourceType,
    method,
    lines,
    extent,
    layoutConfidence: layout.confidence,
    layoutConfidenceReason: layout.reason,
  };
}

/**
 * Fallback honesto: texto plano SIN coordenadas (pegado manual u OCR sin
 * posiciones). Produce líneas sin bbox y `layoutConfidence: 'baja'` con razón
 * explícita — regiones/ejes/tablas basados en posición no aplican aquí.
 */
export function spatialPageFromPlainText(
  text: string,
  options: BuildSpatialPageOptions,
): SpatialPage {
  const method = options.method ?? 'manual';
  const lines: SpatialTextLine[] = text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw, index) => {
      const lineId = `p${options.pageNumber}-l${index + 1}`;
      return {
        lineId,
        pageNumber: options.pageNumber,
        sourceFileName: options.sourceFileName,
        sourceType: options.sourceType,
        text: raw,
        normalizedText: normalizeDrawingText(raw),
        method,
        tokens: [
          {
            tokenId: `${lineId}-t1`,
            pageNumber: options.pageNumber,
            sourceFileName: options.sourceFileName,
            sourceType: options.sourceType,
            text: raw,
            normalizedText: normalizeDrawingText(raw),
            method,
            lineId,
          },
        ],
      };
    });

  return {
    pageNumber: options.pageNumber,
    sourceFileName: options.sourceFileName,
    sourceType: options.sourceType,
    method,
    lines,
    layoutConfidence: 'baja',
    layoutConfidenceReason:
      'Texto sin coordenadas (pegado manual u OCR plano): no hay posiciones para regiones, ejes ni tablas; solo análisis textual.',
  };
}

/** ¿La página tiene coordenadas utilizables para análisis espacial? */
export function hasUsableLayout(page: Pick<SpatialPage, 'lines'>): boolean {
  return page.lines.some((line) => line.bbox !== undefined);
}

/** Distancia entre centros de dos cajas (unidades de página; solo contexto). */
export function bboxCenterDistance(a: SpatialBBox, b: SpatialBBox): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

/** ¿Las cajas se solapan horizontalmente (comparten banda de columnas)? */
export function horizontalOverlap(a: SpatialBBox, b: SpatialBBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width;
}
