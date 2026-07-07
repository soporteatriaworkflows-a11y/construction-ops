/**
 * dxf-view-segmentation.ts — DXF View / Detail Segmentation (F8D, puro).
 *
 * Problema real (plano "Refuerzo Vigas de Cimentación"): F8C agrupaba por
 * radio espacial alrededor del código de la viga y, en láminas densas, ese
 * radio capturaba zonas de estribos y marcadores de OTROS detalles contiguos
 * (subtotales tipo 1808 vs resumen 153 que no eran errores del plano).
 *
 * Este motor detecta las vistas/detalles/cortes INDEPENDIENTES del DXF antes
 * de asociar textos, en dos etapas:
 *
 * 1. CLUSTERS geométricos: entidades ancladas (texto, bloques, círculos,
 *    trazos con vértice) unidas por separación espacial adaptativa — el
 *    espaciado típico entre vecinos de un mismo dibujo es mucho menor que el
 *    espacio en blanco entre dibujos.
 * 2. ANCLAJE a códigos de viga: los clusters que contienen un código de viga
 *    son semillas de vista; los clusters sin código (zonas de estribos,
 *    marcadores, cotas) se adhieren a la vista cuyo código queda CLARAMENTE
 *    más cerca. Un cluster en la franja entre dos códigos queda `ambiguous`
 *    y no se asigna a ninguna vista (decisión humana, no adivinanza).
 *
 * Honestidad: si no hay separación clara (varios códigos de viga dentro del
 * mismo cluster), la segmentación lo dice de frente con advertencia de
 * confianza baja; jamás inventa recuadros. Este módulo no calcula ml/kg ni
 * costos (F1 única calculadora) y no aprueba nada.
 */
import { extractElementMentions } from '../drawing-element-registry';
import { isDxfTextEntity, type DxfEntity } from './dxf-entities';
import type { DxfParseSuccess } from './dxf-parser';
import {
  dxfNeighborhoodRadius,
  isTitleBlockNoise,
  isTitleLayer,
} from './dxf-structural-extractor';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type DxfViewType =
  | 'beam_detail'
  | 'beam_longitudinal'
  | 'cross_section'
  | 'table'
  | 'title_block'
  | 'unknown';

export const DXF_VIEW_TYPE_LABEL: Record<DxfViewType, string> = {
  beam_detail: 'Detalle de viga',
  beam_longitudinal: 'Vista longitudinal',
  cross_section: 'Corte/sección',
  table: 'Tabla/cuadro',
  title_block: 'Rótulo',
  unknown: 'Sin clasificar',
};

export interface DxfViewBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DxfViewSegment {
  viewId: string;
  type: DxfViewType;
  bbox: DxfViewBBox;
  sourceLayers: readonly string[];
  sourceColors: readonly number[];
  /** Handles de las entidades de la vista (los que el DXF trae). */
  entityHandles: readonly string[];
  entityCount: number;
  /** Códigos de viga detectados dentro de la vista ("VC-EJE-3"). */
  candidateBeamKeys: readonly string[];
  /** 0–1: separación clara y contenido coherente suben; mezcla baja. */
  confidence: number;
  warnings: readonly string[];
}

export interface DxfEntityViewAssignment {
  viewId?: string;
  /** true cuando la entidad cae en la franja entre dos vistas. */
  ambiguous: boolean;
}

export interface DxfViewSegmentation {
  views: readonly DxfViewSegment[];
  /** Asignación entidad → vista (por referencia de entidad del parse). */
  assignments: ReadonlyMap<DxfEntity, DxfEntityViewAssignment>;
  /** Distancia de enlace usada para clusterizar (unidades del dibujo). */
  linkRadius: number;
  confidence: 'alto' | 'medio' | 'bajo';
  warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface AnchoredEntity {
  entity: DxfEntity;
  /** Punto principal (inserción/primer vértice). */
  point: Point;
  /** Todos los puntos de anclaje (LINE aporta sus DOS extremos: la geometría
   * conectada del dibujo es la que une un detalle en franja). */
  points: readonly Point[];
}

function anchoredEntities(entities: readonly DxfEntity[], maxLineLength: number): AnchoredEntity[] {
  const out: AnchoredEntity[] = [];
  for (const entity of entities) {
    const candidate = entity as { x?: number; y?: number; x2?: number; y2?: number };
    if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') continue;
    const start = { x: candidate.x, y: candidate.y };
    const points: Point[] = [start];
    if (typeof candidate.x2 === 'number' && typeof candidate.y2 === 'number') {
      const length = distance(start, { x: candidate.x2, y: candidate.y2 });
      // Líneas MUY largas (ejes/bordes de lámina) cruzan varios detalles y
      // NO deben coser vistas: se excluyen del anclaje por completo.
      if (length > maxLineLength) continue;
      points.push({ x: candidate.x2, y: candidate.y2 });
    }
    out.push({ entity, point: start, points });
  }
  return out;
}

/** Distancia mínima entre los puntos de anclaje de dos entidades. */
function entityDistance(a: AnchoredEntity, b: AnchoredEntity): number {
  let best = Infinity;
  for (const pa of a.points) {
    for (const pb of b.points) {
      const d = distance(pa, pb);
      if (d < best) best = d;
    }
  }
  return best;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mediana de la distancia al vecino más cercano (muestra determinista ≤400). */
function medianNearestNeighbor(points: readonly Point[]): number {
  const sample = points.length > 400 ? points.slice(0, 400) : points;
  const nearest: number[] = [];
  for (let i = 0; i < sample.length; i += 1) {
    let best = Infinity;
    for (let j = 0; j < points.length; j += 1) {
      if (points[j] === sample[i]) continue;
      const d = distance(sample[i]!, points[j]!);
      if (d > 0 && d < best) best = d;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  if (nearest.length === 0) return 0;
  const sorted = nearest.sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Union-find simple con compresión de camino. */
function findRoot(parents: number[], index: number): number {
  let root = index;
  while (parents[root] !== root) root = parents[root]!;
  let current = index;
  while (parents[current] !== root) {
    const next = parents[current]!;
    parents[current] = root;
    current = next;
  }
  return root;
}

/** Códigos de viga de una línea de texto (sin ruido de rótulo). */
function beamKeysOfLine(line: string): string[] {
  const keys: string[] = [];
  for (const mention of extractElementMentions(line)) {
    if (mention.kind === 'viga') keys.push(mention.elementKey);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Patrones de clasificación
// ---------------------------------------------------------------------------

const STIRRUP_TEXT_PATTERN = /E\s*#\s*\d/i;
const LONGITUDINAL_TEXT_PATTERN = /\d\s*#\s*\d/;
const SECTION_TEXT_PATTERN = /\d{2,3}\s*[xX×]\s*\d{2,3}/;
const TABLE_TEXT_PATTERN = /\bCUADRO\b|\bTABLA\b|\bDESPIECE\b/i;

// ---------------------------------------------------------------------------
// Segmentación principal
// ---------------------------------------------------------------------------

const MIN_ANCHORED_FOR_SEGMENTATION = 4;
/** Un cluster sin código se adhiere solo si el 2.º código está ≥1.5× más lejos. */
const ATTACH_CLARITY_RATIO = 1.5;

export function segmentDxfViews(parse: DxfParseSuccess): DxfViewSegmentation {
  // Extensión aproximada del dibujo (todos los puntos, incluidos extremos de
  // línea) para el filtro de líneas larguísimas (ejes/bordes de lámina).
  let extMinX = Infinity;
  let extMinY = Infinity;
  let extMaxX = -Infinity;
  let extMaxY = -Infinity;
  for (const entity of parse.entities) {
    const candidate = entity as { x?: number; y?: number; x2?: number; y2?: number };
    for (const [px, py] of [
      [candidate.x, candidate.y],
      [candidate.x2, candidate.y2],
    ] as const) {
      if (typeof px !== 'number' || typeof py !== 'number') continue;
      extMinX = Math.min(extMinX, px);
      extMinY = Math.min(extMinY, py);
      extMaxX = Math.max(extMaxX, px);
      extMaxY = Math.max(extMaxY, py);
    }
  }
  const extentDiagonal = Number.isFinite(extMinX)
    ? Math.hypot(extMaxX - extMinX, extMaxY - extMinY)
    : 0;
  const maxLineLength = extentDiagonal > 0 ? extentDiagonal * 0.3 : Infinity;

  const anchored = anchoredEntities(parse.entities, maxLineLength);
  if (anchored.length < MIN_ANCHORED_FOR_SEGMENTATION) {
    return {
      views: [],
      assignments: new Map(),
      linkRadius: 0,
      confidence: 'bajo',
      warnings: [
        'Muy pocas entidades con coordenadas para segmentar vistas: la asociación usa solo el radio de vecindad (confianza de segmentación baja).',
      ],
    };
  }

  const points = anchored.map((item) => item.point);

  // Distancia de enlace adaptativa: proporcional al espaciado típico entre
  // entidades vecinas del MISMO dibujo (no a la diagonal completa, que crece
  // con rótulos lejanos).
  const medianNN = medianNearestNeighbor(points);
  const linkRadius = Math.max(4, medianNN * 4);

  // ---- Etapa 1: clustering single-linkage por union-find --------------------
  // La distancia entre entidades usa TODOS sus puntos de anclaje: una LINE
  // aporta sus dos extremos, así la geometría dibujada (contorno de la viga)
  // cose la franja del detalle aunque los textos queden lejos entre sí.
  const parents = anchored.map((_, index) => index);
  for (let i = 0; i < anchored.length; i += 1) {
    for (let j = i + 1; j < anchored.length; j += 1) {
      if (entityDistance(anchored[i]!, anchored[j]!) <= linkRadius) {
        const rootI = findRoot(parents, i);
        const rootJ = findRoot(parents, j);
        if (rootI !== rootJ) parents[rootJ] = rootI;
      }
    }
  }

  const clusterMap = new Map<number, AnchoredEntity[]>();
  anchored.forEach((item, index) => {
    const root = findRoot(parents, index);
    const list = clusterMap.get(root) ?? [];
    list.push(item);
    clusterMap.set(root, list);
  });
  const clusters = [...clusterMap.values()];

  // ---- Etapa 2: semillas por código de viga + retícula de bandas -----------
  // Los planos reales de despiece organizan los detalles en FILAS (o
  // columnas): los propios códigos de viga revelan esa retícula. Con retícula,
  // cada cluster se REBANA por banda (las cotas/secciones entre renglones
  // cosen clusters que cruzan varias filas y no deben decidir la asignación) y
  // cada rebanada se asigna por cercanía transversal DENTRO de su banda. Sin
  // retícula, se usa la distancia isotrópica a las semillas. En ambos casos,
  // lo que dos semillas reclaman con distancias comparables queda `ambiguous`.

  /** Códigos de viga por entidad (texto sin ruido de rótulo). */
  const anchorsByEntity = new Map<DxfEntity, string[]>();
  for (const { entity } of anchored) {
    if (!isDxfTextEntity(entity)) continue;
    const keys: string[] = [];
    for (const line of entity.rawText.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || isTitleBlockNoise(trimmed, entity.layer)) continue;
      keys.push(...beamKeysOfLine(trimmed));
    }
    if (keys.length > 0) anchorsByEntity.set(entity, keys);
  }

  // Radio de adhesión: el MISMO radio de vecindad que usa el ensamblador
  // (5% de la diagonal ×1.5) — contenido más lejos que eso no pertenece al
  // detalle de ninguna viga.
  const attachRadius = dxfNeighborhoodRadius(parse.entities) * 1.5;

  interface ViewDraft {
    members: AnchoredEntity[];
    beamKeys: Set<string>;
  }

  const drafts: ViewDraft[] = [];
  const ambiguousMembers: AnchoredEntity[] = [];
  const standaloneDrafts: ViewDraft[] = [];

  const globalAnchorPoints: Point[] = [];
  for (const { entity, point } of anchored) {
    if (anchorsByEntity.has(entity)) globalAnchorPoints.push(point);
  }
  const bandLayout = detectBandLayout(globalAnchorPoints);

  if (globalAnchorPoints.length === 0) {
    for (const members of clusters) standaloneDrafts.push({ members: [...members], beamKeys: new Set() });
  } else if (!bandLayout) {
    // Sin retícula: semillas = clusters con código; el resto por distancia.
    const seedInfos = clusters
      .filter((members) => members.some(({ entity }) => anchorsByEntity.has(entity)))
      .map((members) => ({ members }));
    for (const seed of seedInfos) {
      const keys = new Set<string>();
      for (const { entity } of seed.members) {
        for (const key of anchorsByEntity.get(entity) ?? []) keys.add(key);
      }
      drafts.push({ members: [...seed.members], beamKeys: keys });
    }
    for (const members of clusters) {
      if (members.some(({ entity }) => anchorsByEntity.has(entity))) continue;
      const claim = claimIsotropic({ members }, seedInfos, attachRadius);
      if (claim.kind === 'attach') drafts[claim.index]!.members.push(...members);
      else if (claim.kind === 'ambiguous') ambiguousMembers.push(...members);
      else standaloneDrafts.push({ members: [...members], beamKeys: new Set() });
    }
  } else {
    // Con retícula: cada banda (fila/columna de detalles) se PARTE en
    // segmentos por los códigos de viga que contiene — el territorio de un
    // detalle va desde su código hasta el siguiente código de la banda (así
    // se dibujan los despieces reales). Cada entidad se asigna al segmento
    // de su banda; cerca de una frontera de segmento o entre bandas queda
    // `ambiguous`. Las cotas/secciones que cruzan varias filas ya no cosen
    // detalles: la asignación es por entidad, no por cluster.
    interface RowSeed {
      band: number;
      cross: number;
      keys: Set<string>;
      draft: ViewDraft;
    }

    // Semillas por banda, ordenadas por coordenada transversal; códigos casi
    // superpuestos (≤ enlace) se funden en una sola vista multi-código.
    const seedsByBand = new Map<number, RowSeed[]>();
    for (const { entity, point } of anchored) {
      const keys = anchorsByEntity.get(entity);
      if (!keys || keys.length === 0) continue;
      const stack = stackCoord(point, bandLayout.axis);
      const band = bandLayout.bands.find((value) => Math.abs(stack - value) <= bandLayout.tolerance);
      if (band === undefined) continue;
      const cross = crossCoord(point, bandLayout.axis);
      const rowSeeds = seedsByBand.get(band) ?? [];
      const existing = rowSeeds.find((seed) => Math.abs(seed.cross - cross) <= linkRadius);
      if (existing) {
        for (const key of keys) existing.keys.add(key);
      } else {
        const draft: ViewDraft = { members: [], beamKeys: new Set(keys) };
        rowSeeds.push({ band, cross, keys: draft.beamKeys, draft });
        drafts.push(draft);
      }
      seedsByBand.set(band, rowSeeds);
    }
    for (const rowSeeds of seedsByBand.values()) rowSeeds.sort((a, b) => a.cross - b.cross);

    // Ancho típico de segmento acotado (entre dos códigos de una banda):
    // limita hasta dónde se extiende el ÚLTIMO segmento de cada banda.
    const boundedWidths: number[] = [];
    for (const rowSeeds of seedsByBand.values()) {
      for (let i = 1; i < rowSeeds.length; i += 1) {
        boundedWidths.push(rowSeeds[i]!.cross - rowSeeds[i - 1]!.cross);
      }
    }
    const lastSegmentReach =
      boundedWidths.length > 0
        ? boundedWidths.sort((a, b) => a - b)[Math.floor(boundedWidths.length / 2)]! * 2
        : attachRadius;

    const farByCluster = new Map<AnchoredEntity[], AnchoredEntity[]>();
    for (const members of clusters) {
      for (const member of members) {
        const stack = stackCoord(member.point, bandLayout.axis);
        const band = bandLayout.bands.find((value) => Math.abs(stack - value) <= bandLayout.tolerance);
        const markFar = () => {
          const list = farByCluster.get(members) ?? [];
          list.push(member);
          farByCluster.set(members, list);
        };

        if (band === undefined) {
          // Entre bandas: ¿franja entre detalles (cerca) o contenido ajeno?
          let nearest = Infinity;
          for (const anchorPoint of globalAnchorPoints) {
            const d = distance(member.point, anchorPoint);
            if (d < nearest) nearest = d;
          }
          if (nearest <= attachRadius) ambiguousMembers.push(member);
          else markFar();
          continue;
        }

        const rowSeeds = seedsByBand.get(band);
        if (!rowSeeds || rowSeeds.length === 0) {
          markFar();
          continue;
        }
        const cross = crossCoord(member.point, bandLayout.axis);
        // Segmento: el último código con cross ≤ posición (piso).
        let segmentIndex = -1;
        for (let i = 0; i < rowSeeds.length; i += 1) {
          if (rowSeeds[i]!.cross <= cross) segmentIndex = i;
        }
        if (segmentIndex === -1) {
          // Antes del primer código de la banda.
          const first = rowSeeds[0]!;
          if (first.cross - cross <= linkRadius) first.draft.members.push(member);
          else if (first.cross - cross <= attachRadius) ambiguousMembers.push(member);
          else markFar();
          continue;
        }
        const seed = rowSeeds[segmentIndex]!;
        const nextSeed = rowSeeds[segmentIndex + 1];
        if (nextSeed && nextSeed.cross - cross <= linkRadius) {
          // Pegado a la frontera del siguiente detalle: decisión humana.
          ambiguousMembers.push(member);
          continue;
        }
        if (!nextSeed && cross - seed.cross > lastSegmentReach) {
          // Más allá del alcance razonable del último detalle de la banda.
          markFar();
          continue;
        }
        seed.draft.members.push(member);
      }
    }
    for (const far of farByCluster.values()) {
      standaloneDrafts.push({ members: far, beamKeys: new Set() });
    }
  }

  const orderedDrafts = [...drafts, ...standaloneDrafts].sort((a, b) => {
    const bboxA = draftBBox(a);
    const bboxB = draftBBox(b);
    return bboxA.minX - bboxB.minX || bboxB.maxY - bboxA.maxY;
  });

  // ---- Construcción de vistas + clasificación -------------------------------
  const views: DxfViewSegment[] = [];
  const assignments = new Map<DxfEntity, DxfEntityViewAssignment>();
  const globalWarnings: string[] = [];

  orderedDrafts.forEach((draft, index) => {
    const viewId = `view-${index + 1}`;
    const bbox = draftBBox(draft);
    const layers = new Set<string>();
    const colors = new Set<number>();
    const handles: string[] = [];
    let textLineCount = 0;
    let noiseLineCount = 0;
    let stirrupTexts = 0;
    let longitudinalTexts = 0;
    let sectionTexts = 0;
    let tableTexts = 0;
    let circleCount = 0;
    let titleLayerCount = 0;

    for (const { entity } of draft.members) {
      layers.add(entity.layer);
      if (entity.colorIndex !== undefined) colors.add(entity.colorIndex);
      if (entity.handle) handles.push(entity.handle);
      if (entity.type === 'CIRCLE') circleCount += 1;
      if (isTitleLayer(entity.layer)) titleLayerCount += 1;
      if (!isDxfTextEntity(entity)) continue;
      for (const line of entity.rawText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        textLineCount += 1;
        if (isTitleBlockNoise(trimmed, entity.layer)) {
          noiseLineCount += 1;
          continue;
        }
        if (STIRRUP_TEXT_PATTERN.test(trimmed)) stirrupTexts += 1;
        else if (LONGITUDINAL_TEXT_PATTERN.test(trimmed)) longitudinalTexts += 1;
        if (SECTION_TEXT_PATTERN.test(trimmed)) sectionTexts += 1;
        if (TABLE_TEXT_PATTERN.test(trimmed)) tableTexts += 1;
      }
    }

    // ---- Tipo de vista -----------------------------------------------------
    let type: DxfViewType = 'unknown';
    const noiseRatio = textLineCount > 0 ? noiseLineCount / textLineCount : 0;
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    if (titleLayerCount > draft.members.length / 2 || (textLineCount > 0 && noiseRatio >= 0.6)) {
      type = 'title_block';
    } else if (draft.beamKeys.size > 0) {
      if (stirrupTexts + longitudinalTexts > 0) {
        type = 'beam_detail';
      } else {
        type = width > height * 3 ? 'beam_longitudinal' : 'beam_detail';
      }
    } else if (circleCount >= 3 && sectionTexts > 0) {
      type = 'cross_section';
    } else if (tableTexts > 0) {
      type = 'table';
    }

    // ---- Confianza y advertencias --------------------------------------------
    const warnings: string[] = [];
    let confidence = 0.9;
    if (draft.beamKeys.size > 1) {
      confidence = 0.5;
      warnings.push(
        `La vista contiene ${draft.beamKeys.size} códigos de viga (${[...draft.beamKeys].join(', ')}): no hay separación/recuadro claro entre detalles — confianza de segmentación baja.`,
      );
    }
    if (draft.members.length < 3) {
      confidence = Math.min(confidence, 0.6);
      warnings.push('Vista con muy pocas entidades: puede ser un fragmento suelto.');
    }

    views.push({
      viewId,
      type,
      bbox,
      sourceLayers: [...layers].sort(),
      sourceColors: [...colors].sort((a, b) => a - b),
      entityHandles: handles,
      entityCount: draft.members.length,
      candidateBeamKeys: [...draft.beamKeys],
      confidence,
      warnings,
    });
    for (const { entity } of draft.members) {
      assignments.set(entity, { viewId, ambiguous: false });
    }
  });

  for (const { entity } of ambiguousMembers) {
    assignments.set(entity, { viewId: undefined, ambiguous: true });
  }

  // Entidades de vistas SIN viga en la franja entre dos vistas sin viga
  // (clusters vecinos casi pegados) ⇒ ambiguous también.
  const ambiguityRadius = linkRadius * 1.25;
  const standaloneViewIds = new Set(
    views.filter((view) => view.candidateBeamKeys.length === 0).map((view) => view.viewId),
  );
  const clusterViewOf = new Map<DxfEntity, string | undefined>(
    anchored.map(({ entity }) => [entity, assignments.get(entity)?.viewId]),
  );
  for (const { entity, point } of anchored) {
    const own = clusterViewOf.get(entity);
    if (!own || !standaloneViewIds.has(own)) continue;
    for (const { entity: otherEntity, point: otherPoint } of anchored) {
      if (otherEntity === entity) continue;
      const otherView = clusterViewOf.get(otherEntity);
      if (!otherView || otherView === own || !standaloneViewIds.has(otherView)) continue;
      if (distance(point, otherPoint) <= ambiguityRadius) {
        assignments.set(entity, { viewId: undefined, ambiguous: true });
        break;
      }
    }
  }

  const lowConfidence = views.some((view) => view.confidence < 0.6);
  if (lowConfidence) {
    globalWarnings.push(
      'Confianza de segmentación baja: al menos una vista no tiene límites claros. Revisar la asociación de zonas/marcadores contra el plano.',
    );
  }
  const confidence: DxfViewSegmentation['confidence'] = lowConfidence
    ? 'bajo'
    : views.some((view) => view.confidence < 0.8)
      ? 'medio'
      : 'alto';

  return { views, assignments, linkRadius, confidence, warnings: globalWarnings };
}

// ---------------------------------------------------------------------------
// Retícula de bandas (filas/columnas de detalles inferidas de los códigos)
// ---------------------------------------------------------------------------

interface BandLayout {
  /** Eje de apilado: 'y' = detalles en filas; 'x' = detalles en columnas. */
  axis: 'y' | 'x';
  /** Centros de banda sobre el eje de apilado. */
  bands: readonly number[];
  /** Paso típico entre bandas. */
  pitch: number;
  /** Media banda: tolerancia de pertenencia. */
  tolerance: number;
}

const MIN_BAND_GAP = 20;

function bandsForAxis(coords: readonly number[]): { bands: number[]; pitch: number } {
  const sorted = [...coords].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap > MIN_BAND_GAP) gaps.push(gap);
  }
  if (gaps.length === 0) {
    return { bands: sorted.length > 0 ? [sorted.reduce((a, b) => a + b, 0) / sorted.length] : [], pitch: 0 };
  }
  const pitch = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
  const bands: number[] = [];
  let group: number[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]! - group[group.length - 1]! <= pitch * 0.5) {
      group.push(sorted[i]!);
    } else {
      bands.push(group.reduce((a, b) => a + b, 0) / group.length);
      group = [sorted[i]!];
    }
  }
  bands.push(group.reduce((a, b) => a + b, 0) / group.length);
  return { bands, pitch };
}

/**
 * Detecta la retícula de los códigos de viga: el eje con MÁS bandas es el
 * eje de apilado (filas u columnas de detalles). Sin ≥2 bandas no hay
 * retícula y la adhesión cae al modo isotrópico.
 */
function detectBandLayout(anchorPoints: readonly Point[]): BandLayout | null {
  if (anchorPoints.length < 2) return null;
  const byY = bandsForAxis(anchorPoints.map((p) => p.y));
  const byX = bandsForAxis(anchorPoints.map((p) => p.x));
  const pick = byY.bands.length >= byX.bands.length ? { axis: 'y' as const, ...byY } : { axis: 'x' as const, ...byX };
  if (pick.bands.length < 2 || pick.pitch <= 0) return null;
  // Paso real entre centros de banda (más estable que la mediana de gaps).
  const centers = [...pick.bands].sort((a, b) => a - b);
  const centerGaps: number[] = [];
  for (let i = 1; i < centers.length; i += 1) centerGaps.push(centers[i]! - centers[i - 1]!);
  const pitch = centerGaps.sort((a, b) => a - b)[Math.floor(centerGaps.length / 2)]!;
  return { axis: pick.axis, bands: centers, pitch, tolerance: pitch * 0.45 };
}

type LooseClaim = { kind: 'attach'; index: number } | { kind: 'ambiguous' } | { kind: 'standalone' };

function stackCoord(point: Point, axis: BandLayout['axis']): number {
  return axis === 'y' ? point.y : point.x;
}

function crossCoord(point: Point, axis: BandLayout['axis']): number {
  return axis === 'y' ? point.x : point.y;
}

/** Adhesión isotrópica (sin retícula): distancia mínima a cada semilla. */
function claimIsotropic(
  loose: { members: readonly AnchoredEntity[] },
  seeds: ReadonlyArray<{ members: readonly AnchoredEntity[] }>,
  attachRadius: number,
): LooseClaim {
  let best: { index: number; d: number } | undefined;
  let second: number | undefined;
  seeds.forEach((seed, index) => {
    let d = Infinity;
    for (const seedMember of seed.members) {
      for (const member of loose.members) {
        const dist = entityDistance(member, seedMember);
        if (dist < d) d = dist;
      }
    }
    if (!best || d < best.d) {
      second = best?.d;
      best = { index, d };
    } else if (second === undefined || d < second) {
      second = d;
    }
  });
  if (!best || best.d > attachRadius) return { kind: 'standalone' };
  if (second !== undefined && second < best.d * ATTACH_CLARITY_RATIO) return { kind: 'ambiguous' };
  return { kind: 'attach', index: best.index };
}

function draftBBox(draft: { members: readonly AnchoredEntity[] }): DxfViewBBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { points } of draft.members) {
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function pointInBBox(point: Point, bbox: DxfViewBBox, margin: number): boolean {
  return (
    point.x >= bbox.minX - margin &&
    point.x <= bbox.maxX + margin &&
    point.y >= bbox.minY - margin &&
    point.y <= bbox.maxY + margin
  );
}

// ---------------------------------------------------------------------------
// Consultas (las usa el Beam Detail Assembly)
// ---------------------------------------------------------------------------

/** Asignación de UNA entidad: su vista, o ambiguous si quedó en franja compartida. */
export function entityViewAssignment(
  segmentation: DxfViewSegmentation,
  entity: DxfEntity,
): DxfEntityViewAssignment {
  return segmentation.assignments.get(entity) ?? { viewId: undefined, ambiguous: false };
}

/** Vista de un código de viga concreto (la más cercana al punto si hay varias). */
export function viewForBeamKey(
  segmentation: DxfViewSegmentation,
  beamKey: string,
  point?: Point,
): DxfViewSegment | undefined {
  const candidates = segmentation.views.filter((view) => view.candidateBeamKeys.includes(beamKey));
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1 || !point) return candidates[0];
  let best = candidates[0]!;
  let bestDistance = Infinity;
  for (const view of candidates) {
    const center = {
      x: (view.bbox.minX + view.bbox.maxX) / 2,
      y: (view.bbox.minY + view.bbox.maxY) / 2,
    };
    const d = distance(point, center);
    if (d < bestDistance) {
      bestDistance = d;
      best = view;
    }
  }
  return best;
}

/** Vista que contiene un punto (la más cercana por centro si varias lo contienen). */
export function viewForPoint(
  segmentation: DxfViewSegmentation,
  point: Point,
): DxfViewSegment | undefined {
  const margin = segmentation.linkRadius / 2;
  const containing = segmentation.views.filter((view) => pointInBBox(point, view.bbox, margin));
  if (containing.length === 0) return undefined;
  if (containing.length === 1) return containing[0];
  let best = containing[0]!;
  let bestDistance = Infinity;
  for (const view of containing) {
    const center = {
      x: (view.bbox.minX + view.bbox.maxX) / 2,
      y: (view.bbox.minY + view.bbox.maxY) / 2,
    };
    const d = distance(point, center);
    if (d < bestDistance) {
      bestDistance = d;
      best = view;
    }
  }
  return best;
}
