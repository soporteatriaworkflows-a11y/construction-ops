/**
 * dxf-structural-extractor.ts — Detección estructural desde entidades DXF
 * (F8A, puro). LAYER-AWARE pero LAYER-RESILIENT:
 *
 * - Capas limpias (semánticas: VIGAS/ZAPATAS/PILOTES/…) ⇒ evidencia fuerte.
 * - Todo en Layer 0 / capas genéricas ⇒ se usan texto, MTEXT, bloques,
 *   coordenadas y cercanía espacial, con confianza menor y advertencia.
 * - Sin bloques ⇒ conteo por repetición de textos con confianza BAJA.
 * - Sin estructura suficiente ⇒ hallazgos honestos; JAMÁS se inventa.
 *
 * El ruido de rótulo (ING./CALLE/ESCALA/fechas/láminas) se filtra SIEMPRE con
 * las reglas F7 (`classifyTitleBlockNoise`), independiente de la capa; si
 * además hay capas de rótulo, se filtran por capa. No calcula ml/kg/costos
 * (F1 única calculadora) y no aprueba nada.
 */
import { extractElementMentions, type ElementKind } from '../drawing-element-registry';
import { classifyTitleBlockNoise } from '../drawing-page-regions';
import type {
  DxfEntity,
  DxfInsertEntity,
  DxfTextEntity,
} from './dxf-entities';
import { isDxfTextEntity } from './dxf-entities';
import type { DxfParseSuccess } from './dxf-parser';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type DxfElementType = 'beam' | 'footing' | 'pile' | 'column' | 'unknown';

export interface DxfElementCandidate {
  elementKey: string;
  elementType: DxfElementType;
  /** Sección "50x60" si la línea o el contexto cercano la trae. */
  sectionSpec?: string;
  /** Diámetro "Ø60" si aplica (pilotes/columnas circulares). */
  diameter?: string;
  sourceLayer: string;
  sourceEntityType: 'TEXT' | 'MTEXT';
  /** Línea de texto literal que sustenta el candidato. */
  sourceText: string;
  coordinates?: { x: number; y: number };
  /** Textos cercanos espacialmente (contexto para revisión humana). */
  nearbyTexts: readonly string[];
  /** Bloques insertados cerca (candidatos a instancia gráfica). */
  nearbyInserts: readonly string[];
  /** 0–1 según fuerza de la señal (capa semántica > capa genérica). */
  confidence: number;
  warnings: readonly string[];
}

export interface DxfBlockCount {
  blockName: string;
  layer: string;
  count: number;
  /** Código de elemento asociado (por cercanía o nombre de bloque). */
  elementKey?: string;
  /** Cómo se asoció ("texto más cercano" / "nombre del bloque"). */
  linkBasis?: string;
}

export interface DxfListedCount {
  elementKey: string;
  count: number;
  sourceText: string;
  layer: string;
}

export type DxfCountFindingKind = 'count_match' | 'count_mismatch' | 'graphic_count_unverified';

export interface DxfCountFinding {
  kind: DxfCountFindingKind;
  elementKey?: string;
  graphicCount?: number;
  listedCount?: number;
  /** Base del conteo gráfico ("bloques INSERT" / "repetición de textos"). */
  graphicBasis?: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface DxfLayerAssessment {
  usefulLayers: boolean;
  /** Capas genéricas presentes (Layer 0, DEFPOINTS, numéricas…). */
  suspiciousLayers: readonly string[];
  /** Capas con nombre semántico estructural. */
  semanticLayers: readonly string[];
  /** % de entidades concentradas en la capa más poblada (0–100). */
  dominantLayerPct: number;
}

export interface DxfStructuralExtraction {
  elements: readonly DxfElementCandidate[];
  blockCounts: readonly DxfBlockCount[];
  listedCounts: readonly DxfListedCount[];
  findings: readonly DxfCountFinding[];
  layerAssessment: DxfLayerAssessment;
  /** Textos descartados como rótulo/metadato (transparencia). */
  noiseDiscarded: number;
  /** Textos de medida/cota detectados (señal de calidad). */
  measurementTextCount: number;
  /** Textos de tabla/cuadro detectados (señal de calidad). */
  tableTextCount: number;
}

// ---------------------------------------------------------------------------
// Capas
// ---------------------------------------------------------------------------

/** Capas genéricas que NO dicen qué es la entidad. */
const GENERIC_LAYER_PATTERN = /^(0|DEFPOINTS|LAYER\s*\d*|CAPA\s*\d*|\d+)$/i;

/** Capas de rótulo/carátula: su texto jamás es elemento estructural. */
const TITLE_LAYER_PATTERN = /ROTUL|CARATULA|MEMBRETE|TITLE|VI[ÑN]ETA/i;

/** Nombre de capa con semántica estructural. */
const SEMANTIC_LAYER_PATTERN =
  /VIGA|ZAPATA|PILOTE|COLUM|CIM|EJE|ACERO|REFUERZO|ESTRIB|FLEJE|DESPIECE|TABLA|CUADRO|LOSA|MURO|TEXTO/i;

export function isGenericLayer(layer: string): boolean {
  return GENERIC_LAYER_PATTERN.test(layer.trim());
}

export function assessLayers(parse: DxfParseSuccess): DxfLayerAssessment {
  const suspicious: string[] = [];
  const semantic: string[] = [];
  for (const layer of parse.layers) {
    if (isGenericLayer(layer)) suspicious.push(layer);
    else if (SEMANTIC_LAYER_PATTERN.test(layer)) semantic.push(layer);
  }
  const total = parse.entities.length;
  let dominant = 0;
  for (const count of parse.entitiesPerLayer.values()) {
    if (count > dominant) dominant = count;
  }
  const dominantLayerPct = total > 0 ? Math.round((dominant / total) * 100) : 100;
  const namedLayers = parse.layers.filter((layer) => !isGenericLayer(layer));
  return {
    usefulLayers: namedLayers.length >= 2 && dominantLayerPct < 95,
    suspiciousLayers: suspicious,
    semanticLayers: semantic,
    dominantLayerPct,
  };
}

// ---------------------------------------------------------------------------
// Patrones de contexto
// ---------------------------------------------------------------------------

const SECTION_PATTERN = /(\d{2,3})\s*[xX×]\s*(\d{2,3})/;
const DIAMETER_PATTERN = /Ø\s*(\d+(?:[.,]\d+)?)/;
/** Conteos declarados en texto: "CANT: 4", "SON 16", "TOTAL = 12". */
const LISTED_COUNT_PATTERN = /\b(?:CANT(?:IDAD)?|SON|TOTAL)\b\s*[.:=]?\s*(\d{1,4})\b/i;
/** Señales de texto de medida/cota. */
const MEASUREMENT_PATTERN = /\bL\s*=\s*\d|@\s*\d|\d+\s*[xX×]\s*\d+|\d+(?:\s*\+\s*\d+)+/;
const TABLE_PATTERN = /\bCUADRO\b|\bTABLA\b|\bDESPIECE\b|\bCANT\b/i;

const KIND_TO_DXF_TYPE: Record<ElementKind, DxfElementType> = {
  viga: 'beam',
  zapata: 'footing',
  pilote: 'pile',
  columna: 'column',
  muro: 'unknown',
  losa: 'unknown',
  otro: 'unknown',
};

/** Palabras de bloque → tipo de elemento (fallback cuando no hay texto cerca). */
const BLOCK_NAME_KIND: ReadonlyArray<{ pattern: RegExp; kind: ElementKind }> = [
  { pattern: /ZAPATA|FOOTING/i, kind: 'zapata' },
  { pattern: /PILOTE|PILE|CAISSON/i, kind: 'pilote' },
  { pattern: /COLUM/i, kind: 'columna' },
  { pattern: /VIGA|BEAM/i, kind: 'viga' },
];

// Confianzas por fuerza de señal (documentadas en el doc F8A).
const CONF_SEMANTIC_LAYER = 0.95;
const CONF_NAMED_LAYER = 0.9;
const CONF_GENERIC_LAYER = 0.75;
export const CONF_TEXT_REPETITION_COUNT = 0.5;

const GENERIC_LAYER_WARNING =
  'Capa genérica (Layer 0 / sin nombre útil): el elemento se clasificó solo por texto y contexto espacial.';

// ---------------------------------------------------------------------------
// Utilidades espaciales
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

function hasPoint(entity: { x?: number; y?: number }): entity is { x: number; y: number } {
  return typeof entity.x === 'number' && typeof entity.y === 'number';
}

/** Radio de vecindad: 5% de la diagonal del dibujo (mínimo 10 unidades). */
function neighborhoodRadius(entities: readonly DxfEntity[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entity of entities) {
    if (entity.type !== 'TEXT' && entity.type !== 'MTEXT' && entity.type !== 'INSERT') continue;
    if (!hasPoint(entity)) continue;
    minX = Math.min(minX, entity.x);
    minY = Math.min(minY, entity.y);
    maxX = Math.max(maxX, entity.x);
    maxY = Math.max(maxY, entity.y);
  }
  if (!Number.isFinite(minX) || maxX === minX) return 10;
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  return Math.max(10, diagonal * 0.05);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------------------------------------------------------------------------
// Extracción principal
// ---------------------------------------------------------------------------

interface TextLineContext {
  entity: DxfTextEntity;
  line: string;
}

/** Descompone entidades de texto en líneas revisables (MTEXT multilinea). */
function textLines(entities: readonly DxfEntity[]): TextLineContext[] {
  const out: TextLineContext[] = [];
  for (const entity of entities) {
    if (!isDxfTextEntity(entity)) continue;
    for (const line of entity.rawText.split('\n')) {
      if (line.trim().length === 0) continue;
      out.push({ entity, line: line.trim() });
    }
  }
  return out;
}

/** ¿La línea es ruido de rótulo? Capa de rótulo O reglas de texto F7. */
export function isTitleBlockNoise(line: string, layer: string): boolean {
  if (TITLE_LAYER_PATTERN.test(layer)) return true;
  return classifyTitleBlockNoise(line).noise;
}

export function extractDxfStructure(parse: DxfParseSuccess): DxfStructuralExtraction {
  const layerAssessment = assessLayers(parse);
  const radius = neighborhoodRadius(parse.entities);
  const lines = textLines(parse.entities);
  const inserts = parse.entities.filter((e): e is DxfInsertEntity => e.type === 'INSERT');

  let noiseDiscarded = 0;
  let measurementTextCount = 0;
  let tableTextCount = 0;

  // ---- Candidatos de elemento -------------------------------------------
  const byKey = new Map<string, DxfElementCandidate>();
  const occurrencesByKey = new Map<string, Point[]>();

  for (const { entity, line } of lines) {
    if (MEASUREMENT_PATTERN.test(line)) measurementTextCount += 1;
    if (TABLE_PATTERN.test(line)) tableTextCount += 1;
    if (isTitleBlockNoise(line, entity.layer)) {
      noiseDiscarded += 1;
      continue;
    }

    const mentions = extractElementMentions(line);
    if (mentions.length === 0) continue;

    // Filtro de prosa: una "mención" sin tipo estructural conocido dentro de
    // una frase larga es casi siempre texto descriptivo ("...EN 8 PISOS..."),
    // no un código de elemento. Con tipo conocido (VC/Z/P/C…) sí pasa.
    const wordCount = line.trim().split(/\s+/).length;

    for (const mention of mentions) {
      const kindKnown = mention.kind !== undefined && mention.kind !== 'otro';
      if (!kindKnown && wordCount >= 5) continue;
      const point = hasPoint(entity) ? { x: entity.x, y: entity.y } : undefined;
      if (point) {
        const occ = occurrencesByKey.get(mention.elementKey) ?? [];
        // Repeticiones REALES: misma clave en posiciones distintas.
        if (!occ.some((p) => distance(p, point) < 1)) occ.push(point);
        occurrencesByKey.set(mention.elementKey, occ);
      }

      if (byKey.has(mention.elementKey)) {
        const existing = byKey.get(mention.elementKey)!;
        const section = SECTION_PATTERN.exec(line);
        if (!existing.sectionSpec && section) {
          byKey.set(mention.elementKey, {
            ...existing,
            sectionSpec: `${section[1]}x${section[2]}`,
          });
        }
        continue;
      }

      const generic = isGenericLayer(entity.layer);
      const semantic = SEMANTIC_LAYER_PATTERN.test(entity.layer);
      const warnings: string[] = [];
      if (generic) warnings.push(GENERIC_LAYER_WARNING);

      const nearbyTexts: string[] = [];
      const nearbyInserts: string[] = [];
      if (point) {
        for (const other of lines) {
          if (other.entity === entity || !hasPoint(other.entity)) continue;
          if (distance(point, { x: other.entity.x, y: other.entity.y }) <= radius) {
            if (nearbyTexts.length < 6) nearbyTexts.push(other.line);
          }
        }
        for (const insert of inserts) {
          if (!hasPoint(insert)) continue;
          if (distance(point, { x: insert.x, y: insert.y }) <= radius) {
            if (!nearbyInserts.includes(insert.blockName)) nearbyInserts.push(insert.blockName);
          }
        }
      }

      const section = SECTION_PATTERN.exec(line) ?? nearbyTexts.map((t) => SECTION_PATTERN.exec(t)).find(Boolean) ?? undefined;
      const diameter = DIAMETER_PATTERN.exec(line);

      byKey.set(mention.elementKey, {
        elementKey: mention.elementKey,
        elementType: KIND_TO_DXF_TYPE[mention.kind ?? 'otro'],
        sectionSpec: section ? `${section[1]}x${section[2]}` : undefined,
        diameter: diameter ? `Ø${diameter[1]}` : undefined,
        sourceLayer: entity.layer,
        sourceEntityType: entity.type,
        sourceText: line,
        coordinates: point,
        nearbyTexts,
        nearbyInserts,
        confidence: semantic && !generic ? CONF_SEMANTIC_LAYER : generic ? CONF_GENERIC_LAYER : CONF_NAMED_LAYER,
        warnings,
      });
    }
  }

  const elements = [...byKey.values()];

  // ---- Conteo gráfico por bloques ----------------------------------------
  const insertsByBlock = new Map<string, DxfInsertEntity[]>();
  for (const insert of inserts) {
    const list = insertsByBlock.get(insert.blockName) ?? [];
    list.push(insert);
    insertsByBlock.set(insert.blockName, list);
  }

  const elementTexts = lines
    .filter(({ entity, line }) => !isTitleBlockNoise(line, entity.layer) && hasPoint(entity))
    .map(({ entity, line }) => {
      const mention = extractElementMentions(line)[0];
      const kindKnown = mention?.kind !== undefined && mention.kind !== 'otro';
      const prose = !kindKnown && line.trim().split(/\s+/).length >= 5;
      return {
        point: { x: entity.x!, y: entity.y! },
        key: mention && !prose ? mention.elementKey : undefined,
      };
    })
    .filter((item): item is { point: Point; key: string } => Boolean(item.key));

  const blockCounts: DxfBlockCount[] = [];
  for (const [blockName, instances] of insertsByBlock) {
    let linkedKey: string | undefined;
    let linkBasis: string | undefined;

    // 1) Texto de código más cercano a alguna instancia.
    let best: { key: string; dist: number } | undefined;
    for (const instance of instances) {
      if (!hasPoint(instance)) continue;
      for (const text of elementTexts) {
        const d = distance({ x: instance.x, y: instance.y }, text.point);
        if (d <= radius && (!best || d < best.dist)) best = { key: text.key, dist: d };
      }
    }
    if (best) {
      linkedKey = best.key;
      linkBasis = 'texto de código más cercano a las instancias';
    } else {
      // 2) Nombre del bloque (ZAPATA_TIPO_1 → única zapata detectada).
      const kindMatch = BLOCK_NAME_KIND.find(({ pattern }) => pattern.test(blockName));
      if (kindMatch) {
        const sameKind = elements.filter((el) => el.elementType === KIND_TO_DXF_TYPE[kindMatch.kind]);
        if (sameKind.length === 1) {
          linkedKey = sameKind[0]?.elementKey;
          linkBasis = 'nombre del bloque (único elemento de ese tipo)';
        }
      }
    }

    blockCounts.push({
      blockName,
      layer: instances[0]?.layer ?? '0',
      count: instances.length,
      elementKey: linkedKey,
      linkBasis,
    });
  }

  // ---- Conteos declarados en texto (CANT/SON/TOTAL) -----------------------
  const listedCounts: DxfListedCount[] = [];
  for (const { entity, line } of lines) {
    const match = LISTED_COUNT_PATTERN.exec(line);
    if (!match) continue;
    const mention = extractElementMentions(line)[0];
    if (!mention) continue;
    listedCounts.push({
      elementKey: mention.elementKey,
      count: Number.parseInt(match[1] ?? '0', 10),
      sourceText: line,
      layer: entity.layer,
    });
  }

  // ---- Hallazgos de conteo ------------------------------------------------
  const findings: DxfCountFinding[] = [];
  for (const listed of listedCounts) {
    const block = blockCounts.find((b) => b.elementKey === listed.elementKey);
    let graphicCount: number | undefined;
    let graphicBasis: string | undefined;

    if (block) {
      graphicCount = block.count;
      graphicBasis = `bloques INSERT "${block.blockName}"`;
    } else {
      const occurrences = occurrencesByKey.get(listed.elementKey)?.length ?? 0;
      if (occurrences >= 2) {
        graphicCount = occurrences;
        graphicBasis = 'repetición de textos con el mismo código (sin bloques; confianza baja)';
      }
    }

    if (graphicCount === undefined) {
      findings.push({
        kind: 'graphic_count_unverified',
        elementKey: listed.elementKey,
        listedCount: listed.count,
        message: `No hay bloques/entidades suficientes para verificar el conteo gráfico de ${listed.elementKey} (listado: ${listed.count}).`,
        severity: 'warning',
      });
    } else if (graphicCount !== listed.count) {
      findings.push({
        kind: 'count_mismatch',
        elementKey: listed.elementKey,
        graphicCount,
        listedCount: listed.count,
        graphicBasis,
        message: `Se detectan ${graphicCount} instancias gráficas en DXF y ${listed.count} listadas. Diferencia: ${Math.abs(graphicCount - listed.count)}. Requiere revisión.`,
        severity: 'critical',
      });
    } else {
      findings.push({
        kind: 'count_match',
        elementKey: listed.elementKey,
        graphicCount,
        listedCount: listed.count,
        graphicBasis,
        message: `${listed.elementKey}: ${graphicCount} instancias gráficas coinciden con las ${listed.count} listadas (${graphicBasis}).`,
        severity: 'info',
      });
    }
  }
  if (listedCounts.length === 0 && inserts.length === 0 && elements.length > 0) {
    findings.push({
      kind: 'graphic_count_unverified',
      message: 'No hay bloques/entidades suficientes para verificar conteo gráfico en este DXF.',
      severity: 'warning',
    });
  }

  return {
    elements,
    blockCounts,
    listedCounts,
    findings,
    layerAssessment,
    noiseDiscarded,
    measurementTextCount,
    tableTextCount,
  };
}
