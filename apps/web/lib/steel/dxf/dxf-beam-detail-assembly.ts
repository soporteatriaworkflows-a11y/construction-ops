/**
 * dxf-beam-detail-assembly.ts — Beam Detail Assembly (F8C, puro).
 *
 * Lee cada dibujo/corte de viga como UN elemento compuesto, no como textos
 * sueltos: agrupa por cercanía espacial/capa/color las entidades alrededor de
 * cada viga y arma su detalle completo — refuerzo longitudinal superior e
 * inferior (con longitudes compactas normalizadas), zonas de estribos con
 * subtotal vs resumen tipo `2x240E#3184`, verificación por segmentos y
 * MARCADORES de varilla en el corte.
 *
 * Marcadores (aclaración de la usuaria): la detección es SHAPE/ENTITY-DRIVEN
 * y context-driven, jamás color-driven. Los círculos "rojos" del plano actual
 * pueden venir en otro color/capa, como CIRCLE, INSERT repetido u otra
 * entidad cerrada. El color/capa estructural solo SUBE confianza; un color
 * genérico baja confianza y pide revisión, nunca descarta. Los marcadores
 * fuera del cluster del corte o en capas de rótulo no cuentan.
 *
 * Honestidad: la cantidad de longitudinales NUNCA sale del primer dígito del
 * texto (`6#6330` no son 6 varillas): sale del conteo gráfico de marcadores
 * o queda en revisión. Nada se aprueba solo; nada se inventa.
 *
 * F8E: la secuencia longitudinal se lee COMPLETA dentro de cada vista (todos
 * los tramos tras traslapos/cambios de tramo, ordenados por el eje dominante,
 * clasificados por banda con zona `sin_clasificar` explícita) y el envío al
 * takeoff manda cada barra superior/inferior computable + UNA línea de
 * estribos según el contrato F8D — jamás solo estribos ni solo extremos.
 */
import type { ManualLineRecord } from '../manual-takeoff';
import { buildBeamSchedule, type BeamScheduleRow } from './beam-schedule';
import {
  evaluateStirrupSegmentSum,
  normalizeCompactLongitudinalNotation,
  normalizeCompactStirrupNotation,
  type StirrupSegmentEvaluation,
} from './compact-stirrup-notation';
import {
  isDxfTextEntity,
  isRedEntity,
  type DxfCircleEntity,
  type DxfEntity,
  type DxfInsertEntity,
  type DxfTextEntity,
} from './dxf-entities';
import type { DxfParseSuccess } from './dxf-parser';
import {
  dxfNeighborhoodRadius,
  isStructuralLayer,
  isTitleBlockNoise,
  isTitleLayer,
  type DxfStructuralExtraction,
} from './dxf-structural-extractor';
import { DXF_EVIDENCE_METHOD, DXF_SOURCE_TYPE } from './dxf-to-steel-evidence';
import {
  entityViewAssignment,
  segmentDxfViews,
  viewForBeamKey,
  viewForPoint,
  type DxfViewSegmentation,
  type DxfViewType,
} from './dxf-view-segmentation';
import {
  buildStirrupSummaryContract,
  resolveStirrupTakeoffChoice,
  type StirrupSummaryContract,
  type StirrupTakeoffChoice,
} from './stirrup-summary-contract';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface LongitudinalBarReading {
  /** Descripción normalizada ("6#6330"). */
  description: string;
  /** Texto original del plano ("6#6 33 L"). */
  sourceText: string;
  /** Código/diámetro de varilla (2.º dígito de la notación). */
  barCode: number;
  /** Longitud de corte en metros ("3.30") si la notación la trae. */
  cutLengthM?: string;
  position: 'superior' | 'inferior' | 'sin_clasificar';
  /** Cantidad desde el conteo gráfico de marcadores (jamás del texto). */
  quantityFromGraphic?: number;
  quantityStatus: 'from_markers' | 'requires_review';
  warnings: readonly string[];
}

export interface StirrupZone {
  count: number;
  barCode: number;
  spacingCm: number;
  sourceText: string;
  x?: number;
}

export interface StirrupSummary {
  raw: string;
  /** Normalizado si la longitud venía compacta decimal ("2x240E#3184"). */
  normalized: string;
  groups: number;
  countPerGroup: number;
  barCode: number;
  lengthCm?: number;
}

export type StirrupZoneComparisonStatus = 'match' | 'zone_count_mismatch' | 'graphic_stirrup_zone_unverified';

export interface StirrupZoneComparison {
  status: StirrupZoneComparisonStatus;
  zonesTotal?: number;
  summaryCount?: number;
  message: string;
}

export interface CrossSectionMarkers {
  /** Marcadores contados arriba/abajo del eje del corte. */
  top: number;
  bottom: number;
  ambiguous: number;
  /** Detectados por geometría (CIRCLE / INSERT repetido en el corte). */
  byShape: number;
  /** Subconjunto reforzado por capa/color estructural (señal, no requisito). */
  byLayerColor: number;
  confidence: 'alto' | 'medio' | 'bajo';
  status: 'from_markers' | 'unavailable' | 'requires_review';
}

export interface BeamDetail {
  beamDetailId: string;
  beamKey: string;
  /** Fila base del listado (ubicación/sección/estado F8B). */
  schedule: BeamScheduleRow;
  locationText?: string;
  sectionSpec?: string;
  topLongitudinalBars: readonly LongitudinalBarReading[];
  bottomLongitudinalBars: readonly LongitudinalBarReading[];
  /**
   * F8E: textos longitudinales detectados SIN banda superior/inferior clara.
   * No se descartan (se muestran en "Sin clasificar / revisar") pero jamás
   * entran al takeoff sin decisión humana.
   */
  unclassifiedLongitudinalBars: readonly LongitudinalBarReading[];
  /**
   * F8E: textos longitudinales dentro del bbox de la vista recuperados pese a
   * haber quedado fuera de la asignación estricta (franja ambigua/segmento):
   * así no se pierden barras intermedias tras traslapos o cambios de tramo.
   */
  rescuedLongitudinalTextCount: number;
  stirrupZones: readonly StirrupZone[];
  stirrupZonesTotal?: number;
  stirrupSummary?: StirrupSummary;
  zoneComparison?: StirrupZoneComparison;
  /** F8D: contrato zonas vs resumen con estado y reglas de envío. */
  stirrupContract?: StirrupSummaryContract;
  segmentCheck?: StirrupSegmentEvaluation;
  crossSectionMarkers: CrossSectionMarkers;
  sourceLayer: string;
  sourceColor?: number;
  sourceEntityHandles: readonly string[];
  sourceFragments: readonly string[];
  coordinates?: { x: number; y: number };
  /** F8D: vista/detalle del DXF a la que pertenece el corte. */
  viewId?: string;
  viewType?: DxfViewType;
  /** F8D: entidades cercanas EXCLUIDAS por pertenecer a otra vista. */
  crossViewExcludedCount: number;
  /** F8D: entidades cercanas EXCLUIDAS por caer entre dos vistas. */
  ambiguousExcludedCount: number;
  confidence: number;
  warnings: readonly string[];
  status: 'ok' | 'missing_location' | 'requires_review';
  statusReasons: readonly string[];
}

/** Resumen de marcadores para el CAD Drawing Quality Report. */
export interface MarkerQualitySummary {
  markersByShape: number;
  markersByLayerColor: number;
  ambiguousMarkers: number;
  markerConfidence: 'alto' | 'medio' | 'bajo' | null;
}

// ---------------------------------------------------------------------------
// Patrones
// ---------------------------------------------------------------------------

/** Zona de estribos: "27 E#3@12". */
const STIRRUP_ZONE_PATTERN = /(\d{1,3})\s*E\s*#\s*(\d)\s*@\s*(\d{1,3})\b/gi;
/** Resumen de estribos: "2x240E#3184" / "2x303E#318.4". */
const STIRRUP_SUMMARY_PATTERN = /(\d+)\s*[xX]\s*(\d+)\s*E\s*#\s*(\d)(\d{2,4})\b/;
/** Token longitudinal: "6#6330" y variantes con espacios ("6 # 6 330"). */
const LONGITUDINAL_TOKEN_PATTERN = /\b(\d)\s*#\s*(\d)\s?(\d{3,4})\b/g;
/** ¿La línea es candidata longitudinal? (tiene #, no es estribo E#). */
const HAS_LONGITUDINAL_HINT = /\d\s*#\s*\d/;
const SEGMENT_TEXT_PATTERN = /^\d{1,3}$/;

interface Point {
  x: number;
  y: number;
}

function hasPoint(entity: { x?: number; y?: number }): entity is { x: number; y: number } {
  return typeof entity.x === 'number' && typeof entity.y === 'number';
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// ---------------------------------------------------------------------------
// Marcadores de varilla (shape/entity-driven; color = señal de apoyo)
// ---------------------------------------------------------------------------

interface BarMarker extends Point {
  source: 'circle' | 'insert';
  layer: string;
  structuralSignal: boolean;
}

function collectBarMarkers(
  entities: readonly DxfEntity[],
  anchor: Point,
  radius: number,
  allowEntity: (entity: DxfEntity) => boolean = () => true,
  // F8D: con vista segmentada el ámbito es LA VISTA (reach ∞); el radio se
  // conserva para las guardas geométricas (tamaño de círculo, outliers).
  reach: number = radius,
): BarMarker[] {
  const circles = entities.filter((e): e is DxfCircleEntity => e.type === 'CIRCLE');
  const inserts = entities.filter((e): e is DxfInsertEntity => e.type === 'INSERT');

  const candidates: BarMarker[] = [];
  for (const circle of circles) {
    if (!hasPoint(circle)) continue;
    if (isTitleLayer(circle.layer)) continue; // rótulo jamás cuenta
    if (!allowEntity(circle)) continue; // otra vista/franja ambigua (F8D)
    if (distance(circle, anchor) > reach) continue; // fuera del corte
    // Un círculo enorme no es una varilla en sección (contornos, símbolos).
    if (circle.radius !== undefined && circle.radius > radius * 0.25) continue;
    candidates.push({
      x: circle.x,
      y: circle.y,
      source: 'circle',
      layer: circle.layer,
      structuralSignal: isStructuralLayer(circle.layer) || isRedEntity(circle),
    });
  }

  // INSERTs repetidos y compactos dentro del corte = posible símbolo de barra
  // (donut/bloque). Se exige repetición (≥2 del mismo bloque) para no contar
  // logos o referencias sueltas.
  const insertsInRegion = inserts.filter(
    (insert) =>
      hasPoint(insert) &&
      !isTitleLayer(insert.layer) &&
      allowEntity(insert) &&
      distance(insert as Point, anchor) <= reach,
  );
  const byBlock = new Map<string, DxfInsertEntity[]>();
  for (const insert of insertsInRegion) {
    const list = byBlock.get(insert.blockName) ?? [];
    list.push(insert);
    byBlock.set(insert.blockName, list);
  }
  for (const [, group] of byBlock) {
    if (group.length < 2) continue;
    for (const insert of group) {
      if (!hasPoint(insert)) continue;
      candidates.push({
        x: insert.x,
        y: insert.y,
        source: 'insert',
        layer: insert.layer,
        structuralSignal: isStructuralLayer(insert.layer) || isRedEntity(insert),
      });
    }
  }

  if (candidates.length === 0) return [];

  // Cluster espacial del corte: descarta outliers lejos del grupo compacto
  // (círculos de otro detalle/escala dentro del mismo radio de vecindad).
  const centroid: Point = {
    x: candidates.reduce((acc, m) => acc + m.x, 0) / candidates.length,
    y: candidates.reduce((acc, m) => acc + m.y, 0) / candidates.length,
  };
  const distances = candidates.map((m) => distance(m, centroid));
  const med = median(distances);
  const limit = Math.max(med * 2.5, radius * 0.15);
  return candidates.filter((m) => distance(m, centroid) <= limit);
}

function classifyMarkers(markers: readonly BarMarker[]): CrossSectionMarkers {
  if (markers.length === 0) {
    return {
      top: 0,
      bottom: 0,
      ambiguous: 0,
      byShape: 0,
      byLayerColor: 0,
      confidence: 'bajo',
      status: 'unavailable',
    };
  }
  const ys = markers.map((m) => m.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY;
  const divider = (minY + maxY) / 2;
  const epsilon = Math.max(range * 0.1, 0.001);

  let top = 0;
  let bottom = 0;
  let ambiguous = 0;
  if (range <= epsilon) {
    // Todos a la misma altura: no hay banda superior/inferior distinguible.
    ambiguous = markers.length;
  } else {
    for (const marker of markers) {
      if (marker.y > divider + epsilon) top += 1;
      else if (marker.y < divider - epsilon) bottom += 1;
      else ambiguous += 1;
    }
  }

  const byLayerColor = markers.filter((m) => m.structuralSignal).length;
  const structuralRatio = byLayerColor / markers.length;
  const confidence: CrossSectionMarkers['confidence'] =
    structuralRatio >= 0.6 ? 'alto' : structuralRatio > 0 ? 'medio' : 'bajo';

  return {
    top,
    bottom,
    ambiguous,
    byShape: markers.length,
    byLayerColor,
    confidence,
    status: ambiguous > 0 ? 'requires_review' : 'from_markers',
  };
}

// ---------------------------------------------------------------------------
// Ensamblaje principal
// ---------------------------------------------------------------------------

export function assembleBeamDetails(
  parse: DxfParseSuccess,
  extraction: DxfStructuralExtraction,
  options: { segmentation?: DxfViewSegmentation } = {},
): BeamDetail[] {
  // F8D: primero se segmentan las vistas/detalles independientes del DXF;
  // el ensamblaje solo asocia entidades DENTRO de la vista de cada viga.
  const segmentation = options.segmentation ?? segmentDxfViews(parse);
  const schedule = buildBeamSchedule(parse, extraction, { segmentation });
  if (schedule.length === 0) return [];
  const radius = dxfNeighborhoodRadius(parse.entities) * 1.5;
  return schedule.map((row) => assembleDetail(row, parse.entities, radius, segmentation));
}

interface RegionText {
  entity: DxfTextEntity;
  line: string;
}

function assembleDetail(
  row: BeamScheduleRow,
  entities: readonly DxfEntity[],
  radius: number,
  segmentation: DxfViewSegmentation,
): BeamDetail {
  const anchor = row.coordinates;
  const warnings: string[] = [];
  const fragments = new Set<string>([row.sourceText]);
  const handles = new Set<string>();

  // Vista de la viga (F8D): las entidades de OTRAS vistas jamás se asocian;
  // las que caen entre dos vistas quedan ambiguas y también se excluyen.
  const beamView =
    viewForBeamKey(segmentation, row.elementKey, anchor) ??
    (anchor ? viewForPoint(segmentation, anchor) : undefined);
  const crossViewExcluded = new Set<DxfEntity>();
  const ambiguousExcluded = new Set<DxfEntity>();
  const allowEntity = (entity: DxfEntity): boolean => {
    if (!beamView) return true; // sin segmentación clara ⇒ solo radio (F8C)
    const assignment = entityViewAssignment(segmentation, entity);
    if (assignment.ambiguous) {
      ambiguousExcluded.add(entity);
      return false;
    }
    if (assignment.viewId !== undefined && assignment.viewId !== beamView.viewId) {
      crossViewExcluded.add(entity);
      return false;
    }
    return true;
  };

  // Región del detalle: con vista segmentada el ámbito ES la vista completa
  // (una viga larga excede el radio euclidiano); sin vista, solo el radio.
  const reach = beamView ? Number.POSITIVE_INFINITY : radius;
  const regionTexts: RegionText[] = [];
  if (anchor) {
    for (const entity of entities) {
      if (!isDxfTextEntity(entity) || !hasPoint(entity)) continue;
      if (distance(entity, anchor) > reach) continue;
      if (!allowEntity(entity)) continue;
      for (const line of entity.rawText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || isTitleBlockNoise(trimmed, entity.layer)) continue;
        regionTexts.push({ entity, line: trimmed });
        if (entity.handle) handles.add(entity.handle);
      }
    }
  }

  // ---- Marcadores del corte (shape-driven) --------------------------------
  const markers = anchor ? collectBarMarkers(entities, anchor, radius, allowEntity, reach) : [];
  const crossSectionMarkers = classifyMarkers(markers);
  if (crossSectionMarkers.status === 'unavailable') {
    warnings.push('Sin marcadores gráficos de varilla en el corte: la cantidad de longitudinales requiere revisión.');
  } else if (crossSectionMarkers.status === 'requires_review') {
    warnings.push(
      `${crossSectionMarkers.ambiguous} marcador(es) laterales/ambiguos en el corte: confirmar banda superior/inferior.`,
    );
  }
  if (crossSectionMarkers.byShape > 0 && crossSectionMarkers.byLayerColor === 0) {
    warnings.push('Marcadores detectados por geometría sin capa/color estructural: confianza reducida, revisar.');
  }

  // ---- Longitudinales superior/inferior (F8E: secuencia COMPLETA) ---------
  // 1) TODOS los textos candidatos de la vista, no solo los extremos: los que
  //    la asignación estricta dejó en franja ambigua o en un cluster suelto
  //    pero caen dentro del bbox de ESTA vista (y de ninguna otra vista con
  //    viga) se recuperan — así los tramos intermedios tras traslapos o
  //    cambios de tramo no se pierden.
  const isLongitudinalLine = (line: string): boolean =>
    HAS_LONGITUDINAL_HINT.test(line) && !/E\s*#/i.test(line);
  const longitudinalTexts: RegionText[] = [];
  const seenLongitudinalEntities = new Set<DxfTextEntity>();
  for (const { entity, line } of regionTexts) {
    if (!isLongitudinalLine(line)) continue;
    longitudinalTexts.push({ entity, line });
    seenLongitudinalEntities.add(entity);
  }
  let rescuedLongitudinalTextCount = 0;
  if (beamView) {
    const margin = segmentation.linkRadius;
    const otherBeamViews = segmentation.views.filter(
      (view) => view.viewId !== beamView.viewId && view.candidateBeamKeys.length > 0,
    );
    for (const entity of entities) {
      if (!isDxfTextEntity(entity) || !hasPoint(entity)) continue;
      if (seenLongitudinalEntities.has(entity)) continue;
      const assignment = entityViewAssignment(segmentation, entity);
      if (assignment.viewId === beamView.viewId) continue; // ya recorrido arriba
      // Lo asignado FIRMEMENTE a otra vista de viga es contenido ajeno.
      if (
        assignment.viewId !== undefined &&
        !assignment.ambiguous &&
        otherBeamViews.some((view) => view.viewId === assignment.viewId)
      ) {
        continue;
      }
      const point = { x: entity.x, y: entity.y };
      if (!pointInViewBBox(point, beamView.bbox, margin)) continue;
      // ESTRICTAMENTE dentro del bbox de otra vista de viga ⇒ contenido
      // contestado de verdad: sigue excluido (sin margen — el margen solo
      // amplía la vista propia).
      if (otherBeamViews.some((view) => pointInViewBBox(point, view.bbox, 0))) continue;
      let rescuedFromEntity = false;
      for (const line of entity.rawText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || isTitleBlockNoise(trimmed, entity.layer)) continue;
        if (!isLongitudinalLine(trimmed)) continue;
        longitudinalTexts.push({ entity, line: trimmed });
        if (entity.handle) handles.add(entity.handle);
        rescuedFromEntity = true;
      }
      if (rescuedFromEntity) {
        seenLongitudinalEntities.add(entity);
        rescuedLongitudinalTextCount += 1;
        crossViewExcluded.delete(entity);
        ambiguousExcluded.delete(entity);
      }
    }
  }
  if (rescuedLongitudinalTextCount > 0) {
    warnings.push(
      `${rescuedLongitudinalTextCount} texto(s) de barras longitudinales dentro del área de la vista se recuperaron aunque la segmentación los dejaba en franja ambigua/cluster suelto: verificar la secuencia contra el plano.`,
    );
  }

  // 2) Tokens normalizados. Dedupe SOLO de texto superpuesto (mismo token en
  //    la MISMA posición) — jamás por compartir diámetro o longitud similar:
  //    un 6#6840 arriba y otro abajo son DOS barras distintas.
  interface LongitudinalCandidate {
    reading: LongitudinalBarReading;
    x?: number;
    y?: number;
  }
  const longitudinal: LongitudinalCandidate[] = [];
  const dedupeKeys = new Set<string>();
  for (const { entity, line } of longitudinalTexts) {
    const normalization = normalizeCompactLongitudinalNotation(line, { structuralContext: true });
    const normalizedLine = normalization.applied ? normalization.normalizedText : line;

    LONGITUDINAL_TOKEN_PATTERN.lastIndex = 0;
    for (const match of normalizedLine.matchAll(LONGITUDINAL_TOKEN_PATTERN)) {
      const description = `${match[1]}#${match[2]}${match[3]}`;
      const dedupeKey = `${description}|${entity.x?.toFixed(1) ?? '?'},${entity.y?.toFixed(1) ?? '?'}|${match.index ?? 0}`;
      if (dedupeKeys.has(dedupeKey)) continue;
      dedupeKeys.add(dedupeKey);
      const barCode = Number.parseInt(match[2] ?? '', 10);
      const lengthCm = Number.parseInt(match[3] ?? '', 10);
      longitudinal.push({
        x: entity.x,
        y: entity.y,
        reading: {
          description,
          sourceText: line,
          barCode,
          cutLengthM: Number.isFinite(lengthCm) ? String(lengthCm / 100) : undefined,
          position: 'sin_clasificar',
          quantityStatus: 'requires_review',
          warnings: [...normalization.warnings],
        },
      });
      fragments.add(line);
    }
  }

  // 3) Banda superior/inferior por BANDA (marcadores o salto dominante en Y),
  //    no por cercanía al primer texto. La zona intermedia queda
  //    `sin_clasificar` con advertencia visible — jamás se descarta.
  const bandSplit = longitudinalBandSplit(markers, longitudinal);
  const topCandidates: LongitudinalCandidate[] = [];
  const bottomCandidates: LongitudinalCandidate[] = [];
  const unclassifiedCandidates: LongitudinalCandidate[] = [];
  for (const item of longitudinal) {
    let position: LongitudinalBarReading['position'] = 'sin_clasificar';
    if (bandSplit && item.y !== undefined) {
      if (item.y >= bandSplit.dividerY + bandSplit.epsilon) position = 'superior';
      else if (item.y <= bandSplit.dividerY - bandSplit.epsilon) position = 'inferior';
    }
    const band = position === 'superior' ? crossSectionMarkers.top : position === 'inferior' ? crossSectionMarkers.bottom : 0;
    const canCount = crossSectionMarkers.status === 'from_markers' && band > 0 && position !== 'sin_clasificar';
    const reading: LongitudinalBarReading = {
      ...item.reading,
      position,
      quantityFromGraphic: canCount ? band : undefined,
      quantityStatus: canCount ? 'from_markers' : 'requires_review',
      warnings: canCount
        ? item.reading.warnings
        : [
            ...item.reading.warnings,
            'Cantidad sin conteo gráfico confiable: el primer dígito de la notación NO es cantidad; requiere revisión.',
          ],
    };
    const classified = { ...item, reading };
    if (position === 'superior') topCandidates.push(classified);
    else if (position === 'inferior') bottomCandidates.push(classified);
    else {
      warnings.push(
        `"${item.reading.sourceText}": sin banda superior/inferior clara — queda en "Sin clasificar / revisar" y no se envía sin decisión.`,
      );
      unclassifiedCandidates.push(classified);
    }
  }

  // 4) Orden por el eje dominante de la vista (X en vigas horizontales; Y si
  //    la vista está rotada/vertical) para conservar la secuencia del plano.
  const sequenceAxis = dominantSequenceAxis(longitudinal, beamView?.bbox);
  const top = sortBySequenceAxis(topCandidates, sequenceAxis);
  const bottom = sortBySequenceAxis(bottomCandidates, sequenceAxis);
  const unclassified = sortBySequenceAxis(unclassifiedCandidates, sequenceAxis);

  // ---- Zonas de estribos + resumen ----------------------------------------
  const zones: StirrupZone[] = [];
  let summary: StirrupSummary | undefined;
  const segmentNumbers: number[] = [];
  for (const { entity, line } of regionTexts) {
    STIRRUP_ZONE_PATTERN.lastIndex = 0;
    for (const match of line.matchAll(STIRRUP_ZONE_PATTERN)) {
      zones.push({
        count: Number.parseInt(match[1] ?? '0', 10),
        barCode: Number.parseInt(match[2] ?? '0', 10),
        spacingCm: Number.parseInt(match[3] ?? '0', 10),
        sourceText: line,
        x: entity.x,
      });
      fragments.add(line);
    }
    if (!summary) {
      const stirrupNormalization = normalizeCompactStirrupNotation(line, { structuralContext: true });
      const normalizedLine = stirrupNormalization.applied ? stirrupNormalization.normalizedText : line;
      const summaryMatch = STIRRUP_SUMMARY_PATTERN.exec(normalizedLine);
      if (summaryMatch) {
        const lengthDigits = summaryMatch[4] ?? '';
        summary = {
          raw: line,
          normalized: summaryMatch[0],
          groups: Number.parseInt(summaryMatch[1] ?? '0', 10),
          countPerGroup: Number.parseInt(summaryMatch[2] ?? '0', 10),
          barCode: Number.parseInt(summaryMatch[3] ?? '0', 10),
          lengthCm: lengthDigits.length >= 2 ? Number.parseInt(lengthDigits, 10) : undefined,
        };
        fragments.add(line);
      }
    }
    if (SEGMENT_TEXT_PATTERN.test(line)) {
      const value = Number.parseInt(line, 10);
      if (value >= 2 && value <= 300) segmentNumbers.push(value);
    }
  }
  zones.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  const zonesTotal = zones.length > 0 ? zones.reduce((acc, z) => acc + z.count, 0) : undefined;

  // OJO al parsear el resumen: en "2x240E#3184" la longitud son los dígitos
  // tras el código de varilla (3 → bar, 184 → cm).
  const zoneComparison = compareZonesWithSummary(zonesTotal, zones.length, summary);
  if (zoneComparison && zoneComparison.status !== 'match') warnings.push(zoneComparison.message);

  // ---- Contrato de resumen de estribos (F8D) -------------------------------
  let ambiguousZoneCount = 0;
  for (const entity of ambiguousExcluded) {
    if (!isDxfTextEntity(entity)) continue;
    STIRRUP_ZONE_PATTERN.lastIndex = 0;
    if (STIRRUP_ZONE_PATTERN.test(entity.rawText)) ambiguousZoneCount += 1;
  }
  const stirrupContract = buildStirrupSummaryContract({ summary, zones, ambiguousZoneCount });
  if (stirrupContract && stirrupContract.comparisonStatus !== 'match') {
    warnings.push(stirrupContract.message);
  }

  // ---- Transparencia de segmentación (F8D) ----------------------------------
  if (crossViewExcluded.size > 0) {
    warnings.push(
      `${crossViewExcluded.size} entidad(es) cercanas pertenecen a OTRA vista del plano y quedaron excluidas del detalle (segmentación de vistas).`,
    );
  }
  if (ambiguousExcluded.size > 0) {
    warnings.push(
      `${ambiguousExcluded.size} entidad(es) caen entre dos vistas (ambiguas) y quedaron excluidas: confirmar contra el plano.`,
    );
  }
  if (!beamView && segmentation.views.length > 0) {
    warnings.push('La viga no quedó dentro de una vista segmentada: la asociación usa solo el radio de vecindad.');
  }
  if (segmentation.views.length === 0) {
    warnings.push(...segmentation.warnings);
  } else if (beamView && beamView.confidence < 0.6) {
    warnings.push(...beamView.warnings);
  }

  const segmentCheck =
    summary?.lengthCm !== undefined && segmentNumbers.length >= 2
      ? evaluateStirrupSegmentSum(segmentNumbers, summary.lengthCm, { assumeSymmetry: true })
      : undefined;

  // ---- Estado y confianza ---------------------------------------------------
  const statusReasons: string[] = [...row.statusReasons];
  if (zoneComparison?.status === 'zone_count_mismatch') statusReasons.push(zoneComparison.message);
  if (stirrupContract?.comparisonStatus === 'ambiguous') statusReasons.push(stirrupContract.message);
  if (crossSectionMarkers.status !== 'from_markers' && longitudinal.length > 0) {
    statusReasons.push('Cantidad de longitudinales sin conteo gráfico confiable.');
  }
  if (unclassified.length > 0) {
    statusReasons.push(
      `${unclassified.length} texto(s) longitudinales sin banda superior/inferior clara: revisar en "Sin clasificar / revisar".`,
    );
  }
  if (segmentCheck?.status === 'segment_sum_mismatch') statusReasons.push(segmentCheck.message);

  let status: BeamDetail['status'] = row.status;
  if (statusReasons.length > row.statusReasons.length || zoneComparison?.status === 'zone_count_mismatch') {
    status = 'requires_review';
  }

  const markerBoost = crossSectionMarkers.confidence === 'alto' ? 0 : crossSectionMarkers.confidence === 'medio' ? -0.03 : -0.05;
  const confidence = Math.max(0.4, Math.min(0.95, row.confidence + markerBoost));

  return {
    beamDetailId: `bd-${row.elementKey}`,
    beamKey: row.elementKey,
    schedule: row,
    locationText: row.location,
    sectionSpec: row.sectionSpec,
    topLongitudinalBars: top,
    bottomLongitudinalBars: bottom,
    unclassifiedLongitudinalBars: unclassified,
    rescuedLongitudinalTextCount,
    stirrupZones: zones,
    stirrupZonesTotal: zonesTotal,
    stirrupSummary: summary,
    zoneComparison,
    stirrupContract,
    segmentCheck,
    crossSectionMarkers,
    sourceLayer: row.layer,
    sourceColor: row.colorIndex,
    sourceEntityHandles: [...handles],
    sourceFragments: [...fragments],
    coordinates: row.coordinates,
    viewId: beamView?.viewId,
    viewType: beamView?.type,
    crossViewExcludedCount: crossViewExcluded.size,
    ambiguousExcludedCount: ambiguousExcluded.size,
    confidence,
    warnings,
    status,
    statusReasons,
  };
}

/**
 * Divisor de banda del corte con zona intermedia explícita: marcadores si
 * existen (divisor = centro del rango; epsilon = 15% del rango); si no, el
 * mayor salto en Y entre textos (epsilon = 25% del salto). Sin separación
 * clara ⇒ undefined y TODO queda `sin_clasificar` (jamás se adivina banda).
 */
function longitudinalBandSplit(
  markers: readonly BarMarker[],
  longitudinal: ReadonlyArray<{ y?: number }>,
): { dividerY: number; epsilon: number } | undefined {
  if (markers.length >= 2) {
    const ys = markers.map((m) => m.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const range = maxY - minY;
    if (range > 0) return { dividerY: (minY + maxY) / 2, epsilon: range * 0.15 };
  }
  const ys = longitudinal.map((item) => item.y).filter((y): y is number => typeof y === 'number');
  if (ys.length < 2) return undefined;
  const sorted = [...ys].sort((a, b) => a - b);
  let bestGap = 0;
  let dividerY: number | undefined;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0);
    if (gap > bestGap) {
      bestGap = gap;
      dividerY = ((sorted[i] ?? 0) + (sorted[i - 1] ?? 0)) / 2;
    }
  }
  const range = (sorted[sorted.length - 1] ?? 0) - (sorted[0] ?? 0);
  if (dividerY === undefined || bestGap <= range * 0.2) return undefined;
  return { dividerY, epsilon: bestGap * 0.25 };
}

/** ¿Punto dentro del bbox de una vista (con margen)? */
function pointInViewBBox(
  point: Point,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  margin: number,
): boolean {
  return (
    point.x >= bbox.minX - margin &&
    point.x <= bbox.maxX + margin &&
    point.y >= bbox.minY - margin &&
    point.y <= bbox.maxY + margin
  );
}

type SequenceAxis = 'x' | 'y';

/**
 * Eje dominante de la secuencia: X para vigas horizontales (lo usual), Y si
 * los textos —o el bbox de la vista— se extienden más en vertical (vista
 * rotada/vertical).
 */
function dominantSequenceAxis(
  candidates: ReadonlyArray<{ x?: number; y?: number }>,
  bbox?: { minX: number; minY: number; maxX: number; maxY: number },
): SequenceAxis {
  const xs = candidates.map((c) => c.x).filter((v): v is number => typeof v === 'number');
  const ys = candidates.map((c) => c.y).filter((v): v is number => typeof v === 'number');
  if (xs.length >= 2 && ys.length >= 2) {
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    if (xRange !== yRange) return xRange > yRange ? 'x' : 'y';
  }
  if (bbox) {
    return bbox.maxX - bbox.minX >= bbox.maxY - bbox.minY ? 'x' : 'y';
  }
  return 'x';
}

/** Ordena por el eje de secuencia (X ascendente; Y descendente = de arriba abajo). */
function sortBySequenceAxis(
  candidates: ReadonlyArray<{ reading: LongitudinalBarReading; x?: number; y?: number }>,
  axis: SequenceAxis,
): LongitudinalBarReading[] {
  return [...candidates]
    .sort((a, b) =>
      axis === 'x' ? (a.x ?? 0) - (b.x ?? 0) : (b.y ?? 0) - (a.y ?? 0),
    )
    .map((candidate) => candidate.reading);
}

function compareZonesWithSummary(
  zonesTotal: number | undefined,
  zoneCount: number,
  summary: StirrupSummary | undefined,
): StirrupZoneComparison | undefined {
  if (!summary && zonesTotal === undefined) return undefined;
  if (!summary) {
    return {
      status: 'graphic_stirrup_zone_unverified',
      zonesTotal,
      message: `Zonas de estribos detectadas (${zonesTotal} en total) sin resumen tipo 2xN para verificar.`,
    };
  }
  if (zonesTotal === undefined || zoneCount < 2) {
    return {
      status: 'graphic_stirrup_zone_unverified',
      summaryCount: summary.countPerGroup,
      message: `Resumen ${summary.normalized} sin zonas suficientes en el detalle para verificar el conteo.`,
    };
  }
  if (zonesTotal === summary.countPerGroup) {
    return {
      status: 'match',
      zonesTotal,
      summaryCount: summary.countPerGroup,
      message: `Conteo de estribos confirmado: las zonas suman ${zonesTotal} y el resumen indica ${summary.countPerGroup} por cara (${summary.normalized}).`,
    };
  }
  // Subtotal desproporcionado = la vecindad mezcló zonas de varios detalles
  // (típico en láminas densas): evidencia insuficiente, no un mismatch real.
  if (zonesTotal > summary.countPerGroup * 2 || zonesTotal * 2 < summary.countPerGroup) {
    return {
      status: 'graphic_stirrup_zone_unverified',
      zonesTotal,
      summaryCount: summary.countPerGroup,
      message: `Las zonas capturadas suman ${zonesTotal} vs ${summary.countPerGroup} del resumen: la vecindad parece mezclar zonas de varios detalles — conteo gráfico sin verificar.`,
    };
  }
  return {
    status: 'zone_count_mismatch',
    zonesTotal,
    summaryCount: summary.countPerGroup,
    message: `Diferencia de conteo de estribos: zonas del detalle sugieren ${zonesTotal} por repetición, pero el resumen indica ${summary.countPerGroup}. Diferencia: ${Math.abs(zonesTotal - summary.countPerGroup)}. Requiere revisión.`,
  };
}

// ---------------------------------------------------------------------------
// Quality report — resumen de marcadores
// ---------------------------------------------------------------------------

export function summarizeMarkersForQuality(details: readonly BeamDetail[]): MarkerQualitySummary {
  let byShape = 0;
  let byLayerColor = 0;
  let ambiguous = 0;
  const confidences: Array<CrossSectionMarkers['confidence']> = [];
  for (const detail of details) {
    byShape += detail.crossSectionMarkers.byShape;
    byLayerColor += detail.crossSectionMarkers.byLayerColor;
    ambiguous += detail.crossSectionMarkers.ambiguous;
    if (detail.crossSectionMarkers.byShape > 0) confidences.push(detail.crossSectionMarkers.confidence);
  }
  let markerConfidence: MarkerQualitySummary['markerConfidence'] = null;
  if (confidences.length > 0) {
    markerConfidence = confidences.includes('bajo') ? 'bajo' : confidences.includes('medio') ? 'medio' : 'alto';
  }
  return { markersByShape: byShape, markersByLayerColor: byLayerColor, ambiguousMarkers: ambiguous, markerConfidence };
}

// ---------------------------------------------------------------------------
// Beam detail → líneas del takeoff (clic humano = aprobación)
// ---------------------------------------------------------------------------

/** Barra que NO entra al takeoff todavía (se queda visible en el panel). */
export interface BeamTakeoffSkippedBar {
  position: LongitudinalBarReading['position'];
  description: string;
  sourceText: string;
  reason: string;
}

/**
 * Resultado del "Enviar al takeoff" de UNA viga (F8E): las líneas listas,
 * el desglose superior/inferior/estribo, lo que quedó bloqueado y por qué, y
 * el texto de preview ("Se enviarán 9 líneas: 4 superior, 4 inferior,
 * 1 estribo"). Contrato: al takeoff SOLO entran líneas computables (cantidad
 * numérica + longitud + varilla); el estado de revisión humana es aparte.
 */
export interface BeamTakeoffDispatch {
  lines: readonly Omit<ManualLineRecord, 'id'>[];
  topCount: number;
  bottomCount: number;
  stirrupIncluded: boolean;
  /** Motivo cuando hay estribos detectados pero la línea NO entra. */
  stirrupBlockedReason?: string;
  /** Barras detectadas que no entran (sin cantidad gráfica / sin banda). */
  skippedBars: readonly BeamTakeoffSkippedBar[];
  previewText: string;
  /** Motivos legibles cuando se envía poco o nada. */
  explanations: readonly string[];
}

/**
 * Arma el envío al takeoff de un beam detail completo (F8E):
 *
 * - CADA barra superior e inferior con cantidad del conteo gráfico entra como
 *   línea propia (`4#6330` = 4 marcadores × varilla #6 de 330 cm) — nunca
 *   solo la primera/última.
 * - Barras sin cantidad gráfica confiable NO entran (requieren definir
 *   cantidad): quedan en `skippedBars`, visibles en el panel. Jamás se
 *   inventa cantidad ni entra una línea incomputable al takeoff/Excel.
 * - Estribos: UNA sola línea — el resumen sugerido en `match`; en
 *   `mismatch`/`unverified` solo con `stirrupChoice` explícita de la usuaria
 *   (resumen del plano / suma por zonas); `ambiguous` no entra nunca; las
 *   zonas sueltas jamás se envían por defecto.
 */
export function buildBeamTakeoffDispatch(
  detail: BeamDetail,
  sourceFileName: string,
  options: { assumedWastePct?: string; stirrupChoice?: StirrupTakeoffChoice } = {},
): BeamTakeoffDispatch {
  const assumedWastePct = options.assumedWastePct ?? '5';
  const lines: Array<Omit<ManualLineRecord, 'id'>> = [];
  const skippedBars: BeamTakeoffSkippedBar[] = [];
  const explanations: string[] = [];

  const baseEvidence = beamDetailBaseEvidence(detail, sourceFileName);
  const observationBase = beamDetailObservationBase(detail);

  let topCount = 0;
  let bottomCount = 0;
  for (const reading of [...detail.topLongitudinalBars, ...detail.bottomLongitudinalBars]) {
    if (reading.quantityFromGraphic === undefined) {
      skippedBars.push({
        position: reading.position,
        description: reading.description,
        sourceText: reading.sourceText,
        reason:
          'Requiere definir cantidad: sin conteo gráfico confiable de marcadores (el primer dígito del texto NO es cantidad).',
      });
      continue;
    }
    if (!reading.cutLengthM) {
      skippedBars.push({
        position: reading.position,
        description: reading.description,
        sourceText: reading.sourceText,
        reason: 'Sin longitud de corte legible en la notación: no es computable por F1.',
      });
      continue;
    }
    const lengthCm = Math.round(Number(reading.cutLengthM) * 100);
    if (reading.position === 'superior') topCount += 1;
    else bottomCount += 1;
    lines.push({
      originalDescription: `${reading.quantityFromGraphic}#${reading.barCode}${lengthCm}`,
      assumedWastePct,
      manualBarNumber: reading.barCode,
      evidence: {
        ...baseEvidence,
        position: reading.position,
        confidence: '0.8',
        originalFragment: reading.sourceText,
        observation: [
          ...observationBase,
          `Posición: ${reading.position}`,
          `Cantidad ${reading.quantityFromGraphic} por conteo gráfico de marcadores (el texto decía "${reading.sourceText}")`,
          ...reading.warnings,
        ].join(' · '),
      },
    });
  }

  for (const reading of detail.unclassifiedLongitudinalBars) {
    skippedBars.push({
      position: reading.position,
      description: reading.description,
      sourceText: reading.sourceText,
      reason: 'Sin banda superior/inferior clara: revisar en "Sin clasificar / revisar" antes de enviar.',
    });
  }

  // ---- Estribos: UNA línea según el contrato F8D ---------------------------
  let stirrupIncluded = false;
  let stirrupBlockedReason: string | undefined;
  const contract = detail.stirrupContract;
  if (contract) {
    const stirrupLine = stirrupChoiceToManualLine(detail, sourceFileName, {
      assumedWastePct,
      stirrupChoice: options.stirrupChoice,
    });
    if (stirrupLine) {
      lines.push(stirrupLine);
      stirrupIncluded = true;
    } else if (options.stirrupChoice === 'mark_for_review') {
      stirrupBlockedReason = 'Estribo marcado para revisión por la usuaria: no se envía.';
    } else if (contract.comparisonStatus === 'ambiguous') {
      stirrupBlockedReason = `Estribo bloqueado: ${contract.message}`;
    } else if (options.stirrupChoice) {
      const resolution = resolveStirrupTakeoffChoice(contract, options.stirrupChoice);
      stirrupBlockedReason = resolution.ok ? undefined : `Estribo bloqueado: ${resolution.reason}`;
    } else {
      stirrupBlockedReason =
        contract.comparisonStatus === 'mismatch'
          ? 'Estribo bloqueado por desfase zonas vs resumen: elige "Usar resumen del plano" o "Usar cálculo por zonas".'
          : 'Estribo sin verificar: requiere elección explícita (resumen del plano / cálculo por zonas) para enviarse.';
    }
  }

  if (skippedBars.length > 0) {
    explanations.push(
      `${skippedBars.length} barra(s) longitudinales detectadas NO se envían: ${[...new Set(skippedBars.map((bar) => bar.reason))].join(' ')}`,
    );
  }
  if (stirrupBlockedReason) explanations.push(stirrupBlockedReason);
  if (lines.length === 0) {
    explanations.push('No hay líneas computables para el takeoff: nada se envía (jamás se inventa cantidad).');
  }

  const previewText =
    lines.length === 0
      ? 'No se enviará ninguna línea.'
      : `Se enviarán ${lines.length} línea(s): ${topCount} superior, ${bottomCount} inferior, ${stirrupIncluded ? 1 : 0} estribo.`;

  return {
    lines,
    topCount,
    bottomCount,
    stirrupIncluded,
    stirrupBlockedReason,
    skippedBars,
    previewText,
    explanations,
  };
}

/**
 * Convierte UN beam detail en líneas F3 con evidencia dxf completa (wrapper
 * de compatibilidad F8C/F8D sobre `buildBeamTakeoffDispatch`).
 */
export function beamDetailToManualLines(
  detail: BeamDetail,
  sourceFileName: string,
  options: { assumedWastePct?: string; stirrupChoice?: StirrupTakeoffChoice } = {},
): readonly Omit<ManualLineRecord, 'id'>[] {
  return buildBeamTakeoffDispatch(detail, sourceFileName, options).lines;
}

function beamDetailBaseEvidence(detail: BeamDetail, sourceFileName: string) {
  return {
    sourceFileName,
    pageNumber: 1,
    sourceType: DXF_SOURCE_TYPE,
    readingMethod: DXF_EVIDENCE_METHOD,
    elementKey: detail.beamKey,
    locationText: detail.locationText,
    beamDetailId: detail.beamDetailId,
  };
}

function beamDetailObservationBase(detail: BeamDetail): string[] {
  return [
    `Viga ${detail.beamKey}`,
    detail.locationText ? `Ubicación ${detail.locationText}` : undefined,
    detail.sectionSpec ? `Sección ${detail.sectionSpec}` : undefined,
    `Capa: ${detail.sourceLayer}`,
    detail.sourceColor !== undefined ? `Color ACI ${detail.sourceColor}` : undefined,
    detail.coordinates ? `Coords (${detail.coordinates.x.toFixed(1)}, ${detail.coordinates.y.toFixed(1)})` : undefined,
    detail.sourceEntityHandles.length > 0 ? `Handles: ${detail.sourceEntityHandles.slice(0, 6).join(',')}` : undefined,
    detail.viewId ? `Vista ${detail.viewId}` : undefined,
  ].filter((part): part is string => Boolean(part));
}

/**
 * Línea de ESTRIBOS de un beam detail según el contrato F8D. Sin elección:
 * solo `match` produce línea (el resumen sugerido). Con elección explícita
 * de la usuaria se resuelve resumen del plano o suma por zonas — nunca en
 * `ambiguous` y nunca `mark_for_review`.
 */
export function stirrupChoiceToManualLine(
  detail: BeamDetail,
  sourceFileName: string,
  options: { assumedWastePct?: string; stirrupChoice?: StirrupTakeoffChoice } = {},
): Omit<ManualLineRecord, 'id'> | null {
  const contract = detail.stirrupContract;
  if (!contract) return null;
  const assumedWastePct = options.assumedWastePct ?? '5';

  let description: string;
  let note: string;
  let confidence: string;
  if (options.stirrupChoice) {
    const resolution = resolveStirrupTakeoffChoice(contract, options.stirrupChoice);
    if (!resolution.ok) return null;
    description = resolution.description;
    note = resolution.note;
    confidence = '0.7';
  } else {
    if (contract.comparisonStatus !== 'match' || !contract.suggestedTakeoffLine) return null;
    description = contract.suggestedTakeoffLine;
    note = contract.message;
    confidence = '0.9';
  }

  return {
    originalDescription: description,
    assumedWastePct,
    evidence: {
      ...beamDetailBaseEvidence(detail, sourceFileName),
      position: 'estribo',
      confidence,
      originalFragment: contract.declaredRaw ?? contract.zones[0]?.sourceText,
      observation: [...beamDetailObservationBase(detail), 'Posición: estribos/flejado', note].join(' · '),
    },
  };
}
