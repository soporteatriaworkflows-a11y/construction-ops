/**
 * drawing-page-regions.ts — Clasificación de REGIONES de página (F7A, puro).
 *
 * Un plano estructural no es un flujo de texto: tiene rotulado, notas,
 * leyenda/nomenclatura, cuadros, planta con ejes, detalles/cortes y llamados
 * de acero. Este módulo agrupa las líneas espaciales en regiones tipadas con
 * heurísticas de posición, densidad, palabras clave, cercanía y tamaño de
 * texto.
 *
 * Honestidad primero:
 * - Cada región lleva su razón en lenguaje humano y una confianza.
 * - No pretende ser perfecta: es una BASE para revisión humana, siempre
 *   corregible (mismo espíritu que `suggestSourceTypeFromText` de F6B, pero
 *   POR REGIÓN y no por página completa).
 * - Sin coordenadas (texto pegado/OCR plano) la clasificación degrada a
 *   bloques secuenciales por palabra clave, con confianza `baja`.
 */
import {
  hasUsableLayout,
  type LayoutConfidence,
  type SpatialBBox,
  type SpatialPage,
  type SpatialTextLine,
} from './drawing-spatial-model';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PageRegionType =
  | 'title_block'
  | 'notes'
  | 'legend'
  | 'table'
  | 'plan_grid'
  | 'detail'
  | 'reinforcement_callout'
  | 'unknown';

export const PAGE_REGION_TYPE_LABEL: Record<PageRegionType, string> = {
  title_block: 'Rotulado',
  notes: 'Notas',
  legend: 'Leyenda/nomenclatura',
  table: 'Tabla/cuadro',
  plan_grid: 'Planta/ejes',
  detail: 'Detalle/corte',
  reinforcement_callout: 'Llamado de acero',
  unknown: 'Sin clasificar',
};

export interface PageRegion {
  regionId: string;
  pageNumber: number;
  sourceFileName?: string;
  regionType: PageRegionType;
  /** Caja envolvente de las líneas de la región (si hay coordenadas). */
  bbox?: SpatialBBox;
  lineIds: readonly string[];
  /** Línea-título que ancló la región (p. ej. "CUADRO DE ZAPATAS"). */
  titleText?: string;
  reason: string;
  confidence: LayoutConfidence;
}

export interface PageRegionResult {
  pageNumber: number;
  regions: readonly PageRegion[];
  /** Diagnóstico honesto del análisis (p. ej. sin coordenadas). */
  note?: string;
}

// ---------------------------------------------------------------------------
// Palabras clave por tipo de región (anclas)
// ---------------------------------------------------------------------------

interface RegionAnchorRule {
  type: PageRegionType;
  pattern: RegExp;
  reason: string;
}

const REGION_ANCHOR_RULES: readonly RegionAnchorRule[] = [
  {
    type: 'legend',
    pattern: /\bNOMENCLATURA\b|\bCONVENCIONES\b|\bSIMBOLOG[IÍ]A\b|\bLEYENDA\b/i,
    reason: 'contiene "NOMENCLATURA"/"CONVENCIONES"/"SIMBOLOGIA"/"LEYENDA"',
  },
  {
    type: 'table',
    pattern: /\bCUADROS?\s+DE\s+\w+/i,
    reason: 'contiene "CUADRO DE …"',
  },
  {
    type: 'notes',
    pattern: /\bNOTAS?\b(\s+(GENERALES?|ESTRUCTURALES?|DE\s+\w+))?/i,
    reason: 'contiene "NOTAS"',
  },
  {
    type: 'detail',
    pattern: /\bDETALLES?\b|\bCORTES?\s+[A-Z0-9]['’]?\s*-\s*[A-Z0-9]['’]?\b|\bSECCION(?:ES)?\b|\bDESPIECES?\b/i,
    reason: 'contiene "DETALLE"/"CORTE X-X"/"SECCION"/"DESPIECE"',
  },
  {
    type: 'plan_grid',
    pattern: /\bPLANTA\b|\bLOCALIZACI[OÓ]N\b/i,
    reason: 'contiene "PLANTA"/"LOCALIZACION"',
  },
];

/** Señales de rotulado: escala, proyecto, dibujó, fecha, número de plano. */
const TITLE_BLOCK_PATTERN =
  /\bESC(?:ALA)?\.?\s*1\s*:\s*\d+|\bPROYECTO\b|\bDIBUJ[OÓ]\b|\bREVIS[OÓ]\b|\bAPROB[OÓ]\b|\bFECHA\b|\bPLANO\s*(?:No\.?|N[°º])|\bCONTIENE\b|\bPROPIETARIO\b|\bING\.\s|\bARQ\.\s/i;

// ---------------------------------------------------------------------------
// Ruido de rótulo / metadato del plano (F7.1)
// ---------------------------------------------------------------------------

/** Frase canónica visible cuando un texto se clasifica como rótulo/metadato. */
export const TITLE_BLOCK_NOISE_REASON =
  'Texto descartado como posible rótulo / metadato del plano.';

interface NoiseRule {
  pattern: RegExp;
  detail: string;
}

/**
 * Señales de que una LÍNEA pertenece al rótulo/metadatos y no a información
 * técnica: responsables (ING./ARQ./DIBUJÓ), direcciones (CALLE/CARRERA/CRA),
 * escala/fecha/número de plano/propietario/revisión. Los planos reales traen
 * cosas como "VC-7 ING. MARIO ..." o "VC-2 VC-(50x60) CALLE 14 OESTE ENTRE
 * CARRERAS 55 Y 56": el código del elemento es real, pero la línea es el
 * NOMBRE del plano, no un dato técnico.
 */
const TITLE_BLOCK_NOISE_RULES: readonly NoiseRule[] = [
  {
    pattern: /\b(?:ING|ARQ)\.?\s+[A-ZÁÉÍÓÚÑ]{2,}|\b(?:INGENIER[OA]|ARQUITECT[OA])\b/i,
    detail: 'nombre de responsable profesional (ING./ARQ.)',
  },
  {
    pattern: /\b(?:DIBUJ[OÓ]|DISEÑ[OÓ]|REVIS[OÓ]|APROB[OÓ]|CALCUL[OÓ]|INTERVENTOR|PROPIETARIO|CONSTRUCTOR[A]?)\b/i,
    detail: 'campo de responsables del rotulado',
  },
  {
    pattern: /\b(?:CALLE|CARRERA|CRA|CLL|KRA?|AVENIDA|AV|DIAGONAL|DG|TRANSVERSAL|TV)\.?\s*\d+[A-Z]?\b|\bENTRE\s+(?:CALLES?|CARRERAS?)\b|\b(?:BARRIO|MUNICIPIO|VEREDA|LOTE|MANZANA|MZ)\b/i,
    detail: 'dirección / ubicación urbana (calle, carrera, barrio…)',
  },
  {
    pattern: /\bESC(?:ALA)?\.?\s*1\s*:\s*\d+/i,
    detail: 'escala anotada del rotulado',
  },
  {
    pattern: /\bFECHA\b|\bPLANO\s*(?:No\.?|N[°º])|\bLAMINA\b|\bHOJA\s+\d+\s+DE\s+\d+|\bREVISI[OÓ]N\b|\bVERSI[OÓ]N\b/i,
    detail: 'metadato de plano (fecha, número de lámina, revisión)',
  },
];

export interface TitleBlockNoiseCheck {
  noise: boolean;
  /** Frase canónica + detalle del patrón que disparó la clasificación. */
  reason?: string;
}

/**
 * Clasifica si un texto parece rótulo/metadato del plano. NO elimina nada:
 * quien la usa penaliza (advertencia + revisión) y conserva la evidencia.
 * Un elemento que además aparece en región técnica NUNCA se pierde por esto.
 */
export function classifyTitleBlockNoise(text: string): TitleBlockNoiseCheck {
  for (const rule of TITLE_BLOCK_NOISE_RULES) {
    if (rule.pattern.test(text)) {
      return { noise: true, reason: `${TITLE_BLOCK_NOISE_REASON} Señal: ${rule.detail}.` };
    }
  }
  return { noise: false };
}

/** Señales de llamado de acero: notación de despiece o separaciones. */
const REINFORCEMENT_PATTERN = /#\s*\d{1,2}|@\s*\d|\bESTRIBOS?\b|\bFLEJES?\b|\bVARILLAS?\b|\bREFUERZO\b/i;

/** Etiqueta corta de eje: un token tipo "A", "B", "1", "12", "A1". */
const AXIS_TOKEN_PATTERN = /^(?:[A-Z]{1,2}|\d{1,2}|[A-Z]\d)$/;

/**
 * Línea de burbujas de eje: TODOS sus tokens son etiquetas cortas (las
 * burbujas de una banda — A · B · C — comparten renglón en el modelo espacial).
 */
function isAxisLabelLine(line: SpatialTextLine): boolean {
  return (
    line.tokens.length > 0 &&
    line.tokens.every((token) => AXIS_TOKEN_PATTERN.test(token.normalizedText))
  );
}

function axisTokenCount(lines: readonly SpatialTextLine[]): number {
  return lines.reduce((acc, line) => acc + line.tokens.length, 0);
}

// ---------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------

function anchorFor(line: SpatialTextLine): RegionAnchorRule | undefined {
  return REGION_ANCHOR_RULES.find((rule) => rule.pattern.test(line.normalizedText));
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
 * ¿La línea está "debajo y cerca" del ancla (misma banda horizontal)?
 * Umbral vertical relativo a la extensión de la página: las regiones de un
 * plano suelen ser bloques compactos bajo su título. La banda horizontal se
 * limita al ancho del ancla + margen: un título angosto NO absorbe columnas
 * vecinas (la leyenda no debe tragarse las filas del cuadro de al lado).
 */
function belongsBelowAnchor(
  line: SpatialTextLine,
  anchor: SpatialTextLine,
  pageExtent: SpatialBBox,
): boolean {
  if (!line.bbox || !anchor.bbox) return false;
  const verticalWindow = Math.max(pageExtent.height * 0.25, 40);
  const isBelow = line.bbox.y <= anchor.bbox.y && anchor.bbox.y - line.bbox.y <= verticalWindow;
  const horizontalWindow = Math.max(pageExtent.width * 0.05, 20);
  const sharesBand =
    line.bbox.x < anchor.bbox.x + anchor.bbox.width + horizontalWindow &&
    anchor.bbox.x < line.bbox.x + line.bbox.width + horizontalWindow;
  return isBelow && sharesBand;
}

/** ¿La línea cae en la franja inferior/derecha típica del rotulado? */
function inTitleBlockZone(line: SpatialTextLine, pageExtent: SpatialBBox): boolean {
  if (!line.bbox) return false;
  const rightBand = pageExtent.x + pageExtent.width * 0.72;
  const bottomBand = pageExtent.y + pageExtent.height * 0.18;
  return line.bbox.x >= rightBand || line.bbox.y <= bottomBand;
}

/**
 * Clasifica las regiones de una página espacial. Con coordenadas usa anclas
 * de palabra clave + absorción por cercanía + zonas típicas; sin coordenadas
 * degrada a bloques secuenciales con confianza `baja`.
 */
export function classifyPageRegions(page: SpatialPage): PageRegionResult {
  if (page.lines.length === 0) {
    return { pageNumber: page.pageNumber, regions: [], note: 'Página sin texto: nada que clasificar.' };
  }
  return hasUsableLayout(page) ? classifyWithLayout(page) : classifySequential(page);
}

function classifyWithLayout(page: SpatialPage): PageRegionResult {
  const extent = page.extent ?? unionBBox(
    page.lines.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined),
  );
  if (!extent) return classifySequential(page);

  const regions: PageRegion[] = [];
  const assigned = new Set<string>();
  let regionSeq = 0;
  const nextId = () => `p${page.pageNumber}-r${++regionSeq}`;

  // 1. Anclas por palabra clave: cada ancla crea una región y absorbe las
  //    líneas cercanas debajo (bloque compacto bajo su título).
  const anchors = page.lines
    .map((line) => ({ line, rule: anchorFor(line) }))
    .filter((entry): entry is { line: SpatialTextLine; rule: RegionAnchorRule } => entry.rule !== undefined)
    // El rotulado gana sobre anclas dentro de su zona (un "ESC 1:50" en el
    // cajetín no convierte el rotulado en detalle).
    .filter(({ line }) => !(TITLE_BLOCK_PATTERN.test(line.normalizedText) && inTitleBlockZone(line, extent)));

  for (const { line: anchorLine, rule } of anchors) {
    if (assigned.has(anchorLine.lineId)) continue;
    const memberIds = [anchorLine.lineId];
    assigned.add(anchorLine.lineId);
    for (const line of page.lines) {
      if (assigned.has(line.lineId)) continue;
      if (anchorFor(line)) continue; // otra ancla arranca su propia región
      if (belongsBelowAnchor(line, anchorLine, extent)) {
        memberIds.push(line.lineId);
        assigned.add(line.lineId);
      }
    }
    const memberLines = page.lines.filter((l) => memberIds.includes(l.lineId));
    regions.push({
      regionId: nextId(),
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      regionType: rule.type,
      bbox: unionBBox(memberLines.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined)),
      lineIds: memberIds,
      titleText: anchorLine.text,
      reason: `Ancla "${anchorLine.text}" (${rule.reason}); ${memberIds.length - 1} línea(s) cercana(s) absorbida(s).`,
      confidence: 'media',
    });
  }

  // 2. Rotulado: líneas con señales de cajetín en la zona inferior/derecha.
  const titleLines = page.lines.filter(
    (line) =>
      !assigned.has(line.lineId) &&
      TITLE_BLOCK_PATTERN.test(line.normalizedText) &&
      inTitleBlockZone(line, extent),
  );
  if (titleLines.length > 0) {
    titleLines.forEach((line) => assigned.add(line.lineId));
    regions.push({
      regionId: nextId(),
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      regionType: 'title_block',
      bbox: unionBBox(titleLines.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined)),
      lineIds: titleLines.map((l) => l.lineId),
      reason:
        'Señales de rotulado (escala/proyecto/dibujó/fecha/plano №) en la franja inferior/derecha de la página.',
      confidence: 'media',
    });
  }

  // 2b. Ruido de rótulo fuera de la zona típica: responsables, direcciones y
  //     metadatos también viven en franjas laterales o títulos del plano.
  const noiseLines = page.lines.filter(
    (line) => !assigned.has(line.lineId) && classifyTitleBlockNoise(line.normalizedText).noise,
  );
  if (noiseLines.length > 0) {
    noiseLines.forEach((line) => assigned.add(line.lineId));
    regions.push({
      regionId: nextId(),
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      regionType: 'title_block',
      bbox: unionBBox(noiseLines.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined)),
      lineIds: noiseLines.map((l) => l.lineId),
      reason: `${noiseLines.length} línea(s) con señales de rótulo/metadato (responsables, dirección, escala, fecha) fuera de la zona típica.`,
      confidence: 'media',
    });
  }

  // 3. Etiquetas de eje sueltas: tokens cortos aislados (A, B, 1, 2…) son
  //    contexto de planta/grilla, no ruido. Se cuentan TOKENS (varias
  //    burbujas de una banda comparten renglón).
  const axisLines = page.lines.filter((line) => !assigned.has(line.lineId) && isAxisLabelLine(line));
  if (axisTokenCount(axisLines) >= 2) {
    axisLines.forEach((line) => assigned.add(line.lineId));
    regions.push({
      regionId: nextId(),
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      regionType: 'plan_grid',
      bbox: unionBBox(axisLines.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined)),
      lineIds: axisLines.map((l) => l.lineId),
      reason: `${axisTokenCount(axisLines)} etiquetas cortas tipo eje (letras/números sueltos): posible grilla de planta.`,
      confidence: 'baja',
    });
  }

  // 4. Llamados de acero: líneas con notación de despiece fuera de regiones.
  const calloutLines = page.lines.filter(
    (line) => !assigned.has(line.lineId) && REINFORCEMENT_PATTERN.test(line.normalizedText),
  );
  if (calloutLines.length > 0) {
    calloutLines.forEach((line) => assigned.add(line.lineId));
    regions.push({
      regionId: nextId(),
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      regionType: 'reinforcement_callout',
      bbox: unionBBox(calloutLines.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined)),
      lineIds: calloutLines.map((l) => l.lineId),
      reason: `${calloutLines.length} línea(s) con notación de acero (#, @, estribos, refuerzo) fuera de otras regiones.`,
      confidence: 'media',
    });
  }

  // 5. Resto: sin clasificar (honesto, revisable).
  const rest = page.lines.filter((line) => !assigned.has(line.lineId));
  if (rest.length > 0) {
    regions.push({
      regionId: nextId(),
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      regionType: 'unknown',
      bbox: unionBBox(rest.map((l) => l.bbox).filter((b): b is SpatialBBox => b !== undefined)),
      lineIds: rest.map((l) => l.lineId),
      reason: 'Líneas sin ancla ni patrón reconocido: requieren clasificación humana.',
      confidence: 'baja',
    });
  }

  return { pageNumber: page.pageNumber, regions };
}

/**
 * Degradación sin coordenadas: bloques secuenciales que arrancan en cada
 * línea-ancla. La cercanía es "renglones siguientes", no posición real.
 */
function classifySequential(page: SpatialPage): PageRegionResult {
  const regions: PageRegion[] = [];
  let regionSeq = 0;
  let current: { type: PageRegionType; title?: string; reason: string; lineIds: string[] } | null = null;

  const flush = () => {
    if (!current || current.lineIds.length === 0) return;
    regions.push({
      regionId: `p${page.pageNumber}-r${++regionSeq}`,
      pageNumber: page.pageNumber,
      sourceFileName: page.sourceFileName,
      regionType: current.type,
      lineIds: [...current.lineIds],
      titleText: current.title,
      reason: `${current.reason} (sin coordenadas: bloque secuencial, no posición real).`,
      confidence: 'baja',
    });
    current = null;
  };

  for (const line of page.lines) {
    const rule = anchorFor(line);
    if (rule) {
      flush();
      current = { type: rule.type, title: line.text, reason: `Ancla "${line.text}" (${rule.reason})`, lineIds: [line.lineId] };
      continue;
    }
    // Ruido de rótulo en modo secuencial: bloque title_block propio, para que
    // el registro de elementos pueda penalizarlo aunque no haya coordenadas.
    if (classifyTitleBlockNoise(line.normalizedText).noise) {
      flush();
      current = { type: 'title_block', reason: 'Señales de rótulo/metadato del plano', lineIds: [line.lineId] };
      flush();
      continue;
    }
    if (!current) {
      current = {
        type: REINFORCEMENT_PATTERN.test(line.normalizedText) ? 'reinforcement_callout' : 'unknown',
        reason: REINFORCEMENT_PATTERN.test(line.normalizedText)
          ? 'Notación de acero sin título de región'
          : 'Sin ancla previa',
        lineIds: [line.lineId],
      };
      continue;
    }
    current.lineIds.push(line.lineId);
  }
  flush();

  return {
    pageNumber: page.pageNumber,
    regions,
    note:
      'Página sin coordenadas: las regiones son bloques secuenciales de texto, no zonas reales del plano. Revisar manualmente.',
  };
}

/** Región a la que pertenece una línea (por id), si alguna. */
export function regionOfLine(
  regions: readonly PageRegion[],
  lineId: string,
): PageRegion | undefined {
  return regions.find((region) => region.lineIds.includes(lineId));
}
