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
 * texto (`6#6330` no son 6 varillas). Nada se aprueba solo; nada se inventa.
 *
 * F8E: la secuencia longitudinal se lee COMPLETA dentro de cada vista (todos
 * los tramos tras traslapos/cambios de tramo, ordenados por el eje dominante,
 * clasificados por banda con zona `sin_clasificar` explícita) y el envío al
 * takeoff manda cada barra superior/inferior computable + UNA línea de
 * estribos según el contrato F8D — jamás solo estribos ni solo extremos.
 *
 * F8F: contrato de cantidad corregido — cada texto longitudinal válido del
 * DXF es UNA línea computable con cantidad 1 por aparición textual
 * (`quantityMode: textual_occurrence`, editable por la usuaria); los
 * marcadores gráficos pasan a `markerEvidence`/`markerConfidence` (apoyo
 * visual) y NUNCA bloquean el envío. Las barras sin banda clara se asignan
 * con decisión de la usuaria en vez de congelarse. La cantidad 1 por
 * ocurrencia textual NO es inventada: es la regla operativa del takeoff.
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

/**
 * F8F: modo de cantidad de una barra longitudinal. Regla operativa corregida:
 * cada texto longitudinal válido del DXF representa UNA línea computable con
 * cantidad 1 (`textual_occurrence`), editable por la usuaria. Los marcadores
 * gráficos son EVIDENCIA de apoyo (`markerEvidence`/`markerConfidence`) —
 * validan la sección pero jamás bloquean el envío.
 */
export type LongitudinalQuantityMode = 'textual_occurrence' | 'graphic_marker' | 'manual' | 'unresolved';

/** Fuente legible de la cantidad por ocurrencia textual (F8F). */
export const TEXTUAL_OCCURRENCE_QUANTITY_SOURCE = 'aparición textual DXF';

/** Advertencia informativa (NO bloqueante) cuando no hay marcadores confiables. */
export const LONGITUDINAL_NO_MARKER_WARNING =
  'Marcadores gráficos no confiables o no disponibles; se usa cantidad 1 por aparición textual DXF. Puedes editar la cantidad.';

export interface LongitudinalBarReading {
  /** Id estable dentro del detalle para decisiones de revisión (F8F). */
  readingId: string;
  /** Descripción normalizada ("6#6330"). */
  description: string;
  /** Texto original del plano ("6#6 33 L"). */
  sourceText: string;
  /** Código/diámetro de varilla (2.º dígito de la notación). */
  barCode: number;
  /** Longitud de corte en metros ("3.30") si la notación la trae. */
  cutLengthM?: string;
  position: 'superior' | 'inferior' | 'sin_clasificar';
  /**
   * Cantidad computable de la línea (F8F): 1 por aparición textual DXF.
   * El primer dígito del texto (`6#6350`) JAMÁS es la cantidad.
   */
  quantity: number;
  quantityMode: LongitudinalQuantityMode;
  /** Fuente legible de la cantidad ("aparición textual DXF"). */
  quantitySource: string;
  /** Marcadores gráficos contados en la banda — apoyo visual, no requisito. */
  markerEvidence?: number;
  markerConfidence?: 'alto' | 'medio' | 'bajo';
  warnings: readonly string[];
}

/**
 * F8F.1: razón por la que un texto longitudinal detectado NO quedó en las
 * bandas superior/inferior de ESTE detalle. Diagnóstico de exclusión
 * obligatorio: un texto longitudinal jamás desaparece en silencio — o es
 * visible en el detalle (superior/inferior/sin clasificar) o queda registrado
 * aquí con su razón. `banda_ambigua` además es visible y accionable en
 * "Sin clasificar / revisar".
 */
export type LongitudinalExclusionReason =
  | 'fuera_de_vista'
  | 'asignada_a_otra_vista'
  | 'deduplicada'
  | 'no_parseable'
  | 'banda_ambigua'
  | 'descartada_por_title_block'
  | 'descartada_por_radio'
  | 'descartada_por_bbox';

export const LONGITUDINAL_EXCLUSION_REASON_LABEL: Record<LongitudinalExclusionReason, string> = {
  fuera_de_vista: 'fuera del territorio de la vista',
  asignada_a_otra_vista: 'asignada a otra vista',
  deduplicada: 'texto superpuesto deduplicado',
  no_parseable: 'notación no parseable',
  banda_ambigua: 'banda ambigua (visible en "Sin clasificar / revisar")',
  descartada_por_title_block: 'descartada por rótulo/tabla',
  descartada_por_radio: 'fuera del radio de vecindad',
  descartada_por_bbox: 'dentro del área de otra vista de viga',
};

export interface LongitudinalExclusionRecord {
  /** Línea de texto tal como aparece en el plano. */
  sourceText: string;
  reason: LongitudinalExclusionReason;
  /** Contexto adicional legible ("vista view-2", "leída en el detalle de VC-EJE-4"). */
  detail?: string;
  x?: number;
  y?: number;
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
   * F8F.1: el rescate cubre el TERRITORIO de la fila de la vista (hasta el
   * inicio de la siguiente vista de viga), no solo el bbox recortado.
   */
  rescuedLongitudinalTextCount: number;
  /**
   * F8F.1: diagnóstico de exclusión — todo texto longitudinal del DXF que NO
   * aparece en superior/inferior de este detalle queda registrado aquí con su
   * razón. Jamás desaparece en silencio.
   */
  longitudinalExclusions: readonly LongitudinalExclusionRecord[];
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
  // F8F.1: qué detalle leyó cada texto longitudinal (clave texto|x,y). Con el
  // mapa completo, las exclusiones "fuera de vista/radio/bbox" cuyo texto SÍ
  // quedó leído en otra viga se re-etiquetan (no hay pérdida); las restantes
  // generan advertencia visible — nada desaparece en silencio.
  const claimedBy = new Map<string, string>();
  const details = schedule.map((row) => assembleDetail(row, parse.entities, radius, segmentation, claimedBy));
  return details.map((detail) => finalizeLongitudinalExclusions(detail, claimedBy));
}

/** Clave estable de un texto longitudinal por contenido y posición. */
function longitudinalTextKey(sourceText: string, x?: number, y?: number): string {
  return `${sourceText}|${x?.toFixed(1) ?? '?'},${y?.toFixed(1) ?? '?'}`;
}

/** Exclusiones que implican riesgo de pérdida real de un texto. */
const LONGITUDINAL_LOSS_REASONS: ReadonlySet<LongitudinalExclusionReason> = new Set([
  'fuera_de_vista',
  'descartada_por_radio',
  'descartada_por_bbox',
  'no_parseable',
]);

/** Exclusiones re-etiquetables cuando OTRO detalle sí leyó el texto. */
const LONGITUDINAL_RELABELABLE_REASONS: ReadonlySet<LongitudinalExclusionReason> = new Set([
  'fuera_de_vista',
  'descartada_por_radio',
  'descartada_por_bbox',
]);

function finalizeLongitudinalExclusions(
  detail: BeamDetail,
  claimedBy: ReadonlyMap<string, string>,
): BeamDetail {
  const exclusions = detail.longitudinalExclusions.map((record) => {
    if (!LONGITUDINAL_RELABELABLE_REASONS.has(record.reason)) return record;
    const owner = claimedBy.get(longitudinalTextKey(record.sourceText, record.x, record.y));
    if (owner && owner !== detail.beamKey) {
      return {
        ...record,
        reason: 'asignada_a_otra_vista' as const,
        detail: `leída en el detalle de ${owner}`,
      };
    }
    return record;
  });
  const lost = exclusions.filter((record) => LONGITUDINAL_LOSS_REASONS.has(record.reason));
  if (lost.length === 0) {
    return exclusions === detail.longitudinalExclusions
      ? detail
      : { ...detail, longitudinalExclusions: exclusions };
  }
  const byReason = new Map<LongitudinalExclusionReason, number>();
  for (const record of lost) byReason.set(record.reason, (byReason.get(record.reason) ?? 0) + 1);
  const summary = [...byReason.entries()]
    .map(([reason, count]) => `${LONGITUDINAL_EXCLUSION_REASON_LABEL[reason]}: ${count}`)
    .join(' · ');
  return {
    ...detail,
    longitudinalExclusions: exclusions,
    warnings: [
      ...detail.warnings,
      `${lost.length} texto(s) longitudinales detectados NO entraron a este detalle ni a otro (${summary}): verificar contra el plano en el diagnóstico de exclusiones.`,
    ],
  };
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
  claimedBy: Map<string, string>,
): BeamDetail {
  const anchor = row.coordinates;
  const warnings: string[] = [];
  const fragments = new Set<string>([row.sourceText]);
  const handles = new Set<string>();

  // F8F.1: diagnóstico de exclusión de textos longitudinales — cada decisión
  // de descarte queda registrada con razón; nada desaparece en silencio.
  const longitudinalExclusions: LongitudinalExclusionRecord[] = [];
  const exclusionKeys = new Set<string>();
  const recordExclusion = (
    sourceText: string,
    reason: LongitudinalExclusionReason,
    at: { x?: number; y?: number },
    detailNote?: string,
  ): void => {
    const key = `${reason}|${longitudinalTextKey(sourceText, at.x, at.y)}`;
    if (exclusionKeys.has(key)) return;
    exclusionKeys.add(key);
    longitudinalExclusions.push({ sourceText, reason, detail: detailNote, x: at.x, y: at.y });
  };

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
    warnings.push(
      'Sin marcadores gráficos de varilla en el corte: se usa cantidad 1 por aparición textual DXF para las longitudinales (editable); los marcadores son solo evidencia de apoyo.',
    );
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
  // F8F.1: recorrido de RESCATE + DIAGNÓSTICO sobre TODOS los textos del DXF.
  // La segmentación puede dejar la vista RECORTADA (viga larga que es la única
  // de su fila: los tramos intermedios caen en clusters sueltos sin código),
  // así que el rescate ya no exige el bbox recortado de la vista sino el
  // TERRITORIO de su fila — hasta el inicio de la siguiente vista de viga, la
  // convención con la que se dibujan los despieces. Jamás se toma "solo
  // extremos" ni se filtra por cercanía al código; todo texto longitudinal que
  // NO entra queda registrado con razón en `longitudinalExclusions`.
  let rescuedLongitudinalTextCount = 0;
  {
    const margin = segmentation.linkRadius;
    const otherBeamViews = beamView
      ? segmentation.views.filter(
          (view) => view.viewId !== beamView.viewId && view.candidateBeamKeys.length > 0,
        )
      : [];
    // Tablas de despiece y rótulos contienen notación longitudinal que NO es
    // una barra dibujada del detalle: jamás se rescatan como barras.
    const nonContentViewIds = new Set(
      segmentation.views
        .filter((view) => view.type === 'table' || view.type === 'title_block')
        .map((view) => view.viewId),
    );
    for (const entity of entities) {
      if (!isDxfTextEntity(entity)) continue;
      const hintLines: string[] = [];
      for (const line of entity.rawText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || !isLongitudinalLine(trimmed)) continue;
        if (isTitleBlockNoise(trimmed, entity.layer)) {
          recordExclusion(trimmed, 'descartada_por_title_block', entity);
          continue;
        }
        hintLines.push(trimmed);
      }
      if (hintLines.length === 0 || seenLongitudinalEntities.has(entity)) continue;
      if (!hasPoint(entity)) {
        for (const line of hintLines) {
          recordExclusion(line, 'fuera_de_vista', entity, 'texto sin coordenadas en el DXF');
        }
        continue;
      }
      if (!beamView) {
        // Sin vista segmentada (modo F8C) la asociación es solo por radio.
        for (const line of hintLines) {
          recordExclusion(line, 'descartada_por_radio', entity, 'fuera del radio de vecindad del corte');
        }
        continue;
      }
      const assignment = entityViewAssignment(segmentation, entity);
      if (anchor && assignment.viewId === beamView.viewId) continue; // ya recorrido arriba
      if (assignment.viewId !== undefined && !assignment.ambiguous && assignment.viewId !== beamView.viewId) {
        // Lo asignado FIRMEMENTE a otra vista de viga es contenido ajeno.
        if (otherBeamViews.some((view) => view.viewId === assignment.viewId)) {
          for (const line of hintLines) {
            recordExclusion(line, 'asignada_a_otra_vista', entity, `vista ${assignment.viewId}`);
          }
          continue;
        }
        if (nonContentViewIds.has(assignment.viewId)) {
          for (const line of hintLines) {
            recordExclusion(line, 'descartada_por_title_block', entity, `tabla/rótulo ${assignment.viewId}`);
          }
          continue;
        }
      }
      const point = { x: entity.x, y: entity.y };
      // ESTRICTAMENTE dentro del bbox de otra vista de viga ⇒ contenido
      // contestado de verdad: sigue excluido (sin margen — el margen solo
      // amplía la vista propia).
      if (otherBeamViews.some((view) => pointInViewBBox(point, view.bbox, 0))) {
        for (const line of hintLines) {
          recordExclusion(line, 'descartada_por_bbox', entity, 'dentro del área de otra vista de viga');
        }
        continue;
      }
      if (!inBeamRowTerritory(point, beamView.bbox, otherBeamViews, margin)) {
        for (const line of hintLines) recordExclusion(line, 'fuera_de_vista', entity);
        continue;
      }
      for (const line of hintLines) longitudinalTexts.push({ entity, line });
      if (entity.handle) handles.add(entity.handle);
      seenLongitudinalEntities.add(entity);
      rescuedLongitudinalTextCount += 1;
      crossViewExcluded.delete(entity);
      ambiguousExcluded.delete(entity);
    }
  }
  if (rescuedLongitudinalTextCount > 0) {
    warnings.push(
      `${rescuedLongitudinalTextCount} texto(s) de barras longitudinales dentro del territorio de la vista se recuperaron aunque la segmentación los dejaba en franja ambigua/cluster suelto: verificar la secuencia contra el plano.`,
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

    let tokensInLine = 0;
    LONGITUDINAL_TOKEN_PATTERN.lastIndex = 0;
    for (const match of normalizedLine.matchAll(LONGITUDINAL_TOKEN_PATTERN)) {
      tokensInLine += 1;
      const description = `${match[1]}#${match[2]}${match[3]}`;
      const dedupeKey = `${description}|${entity.x?.toFixed(1) ?? '?'},${entity.y?.toFixed(1) ?? '?'}|${match.index ?? 0}`;
      if (dedupeKeys.has(dedupeKey)) {
        // SOLO texto superpuesto idéntico (mismo token en la MISMA posición).
        recordExclusion(line, 'deduplicada', entity, `duplicado superpuesto de ${description}`);
        continue;
      }
      dedupeKeys.add(dedupeKey);
      const barCode = Number.parseInt(match[2] ?? '', 10);
      const lengthCm = Number.parseInt(match[3] ?? '', 10);
      const computable = Number.isFinite(barCode) && Number.isFinite(lengthCm) && lengthCm > 0;
      longitudinal.push({
        x: entity.x,
        y: entity.y,
        reading: {
          readingId: '', // se asigna al final, sobre la secuencia ordenada
          description,
          sourceText: line,
          barCode,
          cutLengthM: Number.isFinite(lengthCm) ? String(lengthCm / 100) : undefined,
          position: 'sin_clasificar',
          // F8F: cada texto válido = UNA línea computable con cantidad 1.
          quantity: 1,
          quantityMode: computable ? 'textual_occurrence' : 'unresolved',
          quantitySource: TEXTUAL_OCCURRENCE_QUANTITY_SOURCE,
          warnings: [...normalization.warnings],
        },
      });
      fragments.add(line);
    }
    if (tokensInLine === 0) {
      // La línea parecía longitudinal pero ningún token es interpretable:
      // queda registrada, jamás desaparece en silencio.
      recordExclusion(line, 'no_parseable', entity, 'notación longitudinal no interpretable');
      continue;
    }
    // F8F.1: este detalle LEYÓ el texto (clave por contenido+posición) — las
    // exclusiones de otros detalles sobre el mismo texto se re-etiquetan.
    const claimKey = longitudinalTextKey(line, entity.x, entity.y);
    if (!claimedBy.has(claimKey)) claimedBy.set(claimKey, row.elementKey);
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
    // F8F: los marcadores de la banda son EVIDENCIA de apoyo — validan la
    // sección pero nunca definen ni bloquean la cantidad (1 por texto).
    const band = position === 'superior' ? crossSectionMarkers.top : position === 'inferior' ? crossSectionMarkers.bottom : 0;
    const hasMarkerSupport = crossSectionMarkers.status === 'from_markers' && band > 0 && position !== 'sin_clasificar';
    const reading: LongitudinalBarReading = {
      ...item.reading,
      position,
      markerEvidence: hasMarkerSupport ? band : undefined,
      markerConfidence: hasMarkerSupport ? crossSectionMarkers.confidence : undefined,
      warnings: hasMarkerSupport
        ? item.reading.warnings
        : [...item.reading.warnings, LONGITUDINAL_NO_MARKER_WARNING],
    };
    const classified = { ...item, reading };
    if (position === 'superior') topCandidates.push(classified);
    else if (position === 'inferior') bottomCandidates.push(classified);
    else {
      warnings.push(
        `"${item.reading.sourceText}": sin banda superior/inferior clara — queda en "Sin clasificar / revisar"; asígnala a superior/inferior o acéptala sin clasificar antes de enviar.`,
      );
      recordExclusion(
        item.reading.sourceText,
        'banda_ambigua',
        { x: item.x, y: item.y },
        'visible en "Sin clasificar / revisar" — requiere decisión',
      );
      unclassifiedCandidates.push(classified);
    }
  }

  // 4) Orden por el eje dominante de la vista (X en vigas horizontales; Y si
  //    la vista está rotada/vertical) para conservar la secuencia del plano.
  //    El readingId se asigna sobre la secuencia final (estable por posición).
  const sequenceAxis = dominantSequenceAxis(longitudinal, beamView?.bbox);
  const assignReadingIds = (bars: LongitudinalBarReading[], prefix: string): LongitudinalBarReading[] =>
    bars.map((bar, index) => ({ ...bar, readingId: `${row.elementKey}:${prefix}:${index + 1}` }));
  const top = assignReadingIds(sortBySequenceAxis(topCandidates, sequenceAxis), 'sup');
  const bottom = assignReadingIds(sortBySequenceAxis(bottomCandidates, sequenceAxis), 'inf');
  const unclassified = assignReadingIds(sortBySequenceAxis(unclassifiedCandidates, sequenceAxis), 'sc');

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
  // F8F: la falta de marcadores NO congela las longitudinales — la cantidad
  // es 1 por aparición textual DXF (editable) y ya quedó advertida arriba.
  if (unclassified.length > 0) {
    statusReasons.push(
      `${unclassified.length} texto(s) longitudinales sin banda superior/inferior clara: asignar superior/inferior (o aceptar sin clasificar) en "Ver detalle".`,
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
    longitudinalExclusions,
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

/**
 * Territorio de fila/columna de la vista de una viga (F8F.1). La segmentación
 * puede recortar la vista de una viga LARGA que es la única de su fila: los
 * tramos intermedios quedan en clusters sueltos sin código y el bbox de la
 * vista no cubre la longitud real del dibujo. El rescate de textos
 * longitudinales usa la franja de la banda de la vista extendida por el eje
 * de la secuencia hasta el inicio de la SIGUIENTE vista de viga — la misma
 * convención con la que se dibujan los despieces (el territorio de un detalle
 * va desde su código hasta el siguiente). Sin vecino en esa dirección, la
 * franja llega al borde de la lámina; nunca invade el área de otra viga.
 */
function inBeamRowTerritory(
  point: Point,
  ownBBox: { minX: number; minY: number; maxX: number; maxY: number },
  otherBeamViews: ReadonlyArray<{ bbox: { minX: number; minY: number; maxX: number; maxY: number } }>,
  margin: number,
): boolean {
  const withinX = point.x >= ownBBox.minX - margin && point.x <= ownBBox.maxX + margin;
  const withinY = point.y >= ownBBox.minY - margin && point.y <= ownBBox.maxY + margin;
  if (withinX && withinY) return true;
  if (!withinX && !withinY) return false;
  if (withinY) {
    // Fila horizontal: extensión en X hasta el detalle vecino de la fila.
    const rowViews = otherBeamViews.filter(
      (view) => view.bbox.maxY >= ownBBox.minY - margin && view.bbox.minY <= ownBBox.maxY + margin,
    );
    if (point.x > ownBBox.maxX) {
      // Derecha: el territorio termina donde EMPIEZA el siguiente detalle.
      return !rowViews.some((view) => view.bbox.minX > ownBBox.minX && point.x >= view.bbox.minX - margin);
    }
    // Izquierda: el territorio del vecino izquierdo llega hasta nuestro código.
    return !rowViews.some((view) => view.bbox.minX < ownBBox.minX && point.x >= view.bbox.minX - margin);
  }
  // Columna vertical (vista rotada): misma convención sobre Y, de arriba abajo.
  const columnViews = otherBeamViews.filter(
    (view) => view.bbox.maxX >= ownBBox.minX - margin && view.bbox.minX <= ownBBox.maxX + margin,
  );
  if (point.y < ownBBox.minY) {
    // Abajo: hasta el borde superior del siguiente detalle de la columna.
    return !columnViews.some((view) => view.bbox.maxY < ownBBox.maxY && point.y <= view.bbox.maxY + margin);
  }
  // Arriba: el territorio del vecino superior llega hasta nuestro código.
  return !columnViews.some((view) => view.bbox.maxY > ownBBox.maxY && point.y <= view.bbox.maxY + margin);
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
 * F8F: decisión de la usuaria sobre UNA barra longitudinal del panel.
 * Permite asignar banda a las barras sin clasificar, aceptar una barra sin
 * clasificar tal cual, editar cantidad/longitud y marcar para revisión.
 * Nada se autoaprueba: el envío sigue siendo el clic "Enviar al takeoff".
 */
export interface LongitudinalBarDecision {
  /** Asignar la barra a la banda superior o inferior. */
  assignPosition?: 'superior' | 'inferior';
  /** Aceptar la barra COMO sin clasificar (decisión explícita de la usuaria). */
  acceptUnclassified?: boolean;
  /** Excluir la barra del envío hasta revisarla. */
  markForReview?: boolean;
  /** Cantidad editada por la usuaria (entero > 0). */
  quantity?: number;
  /** Longitud de corte editada por la usuaria, en metros. */
  cutLengthM?: string;
}

/** Decisiones por barra, indexadas por `readingId`. */
export type BeamLongitudinalDecisions = Readonly<Record<string, LongitudinalBarDecision>>;

/**
 * Resultado del "Enviar al takeoff" de UNA viga (F8E/F8F): las líneas listas,
 * el desglose superior/inferior/sin clasificar/estribo, lo que quedó
 * bloqueado y por qué, y el texto de preview ("Se enviarán 9 línea(s):
 * 4 superior, 4 inferior, 1 estribo."). Contrato F8F: cada texto longitudinal
 * válido entra con cantidad 1 por aparición textual DXF (editable); los
 * marcadores gráficos son evidencia de apoyo y jamás bloquean.
 */
export interface BeamTakeoffDispatch {
  lines: readonly Omit<ManualLineRecord, 'id'>[];
  topCount: number;
  bottomCount: number;
  /** F8F: líneas aceptadas explícitamente como sin clasificar. */
  unclassifiedCount: number;
  stirrupIncluded: boolean;
  /** Motivo cuando hay estribos detectados pero la línea NO entra. */
  stirrupBlockedReason?: string;
  /** Barras detectadas que no entran (longitud ilegible / banda sin decisión / revisión). */
  skippedBars: readonly BeamTakeoffSkippedBar[];
  previewText: string;
  /** Motivos legibles cuando se envía poco o nada. */
  explanations: readonly string[];
}

/**
 * Arma el envío al takeoff de un beam detail completo (F8E/F8F):
 *
 * - CADA texto longitudinal superior/inferior válido entra como línea propia
 *   con CANTIDAD 1 por aparición textual DXF (`6#6330` = 1 línea de varilla
 *   #6 de 330 cm, editable) — el primer dígito del texto JAMÁS es cantidad y
 *   los marcadores gráficos son evidencia de apoyo, no requisito.
 * - Barras sin clasificar: entran solo con decisión de la usuaria (asignar a
 *   superior/inferior o aceptar sin clasificar); sin decisión quedan en
 *   `skippedBars`, visibles en el panel.
 * - Bloqueos reales que sí excluyen: longitud/diámetro no parseables,
 *   cantidad editada inválida o barra marcada para revisión.
 * - Estribos: UNA sola línea — el resumen sugerido en `match`; en
 *   `mismatch`/`unverified` solo con `stirrupChoice` explícita de la usuaria
 *   (resumen del plano / suma por zonas); `ambiguous` no entra nunca; las
 *   zonas sueltas jamás se envían por defecto.
 */
export function buildBeamTakeoffDispatch(
  detail: BeamDetail,
  sourceFileName: string,
  options: {
    assumedWastePct?: string;
    stirrupChoice?: StirrupTakeoffChoice;
    decisions?: BeamLongitudinalDecisions;
  } = {},
): BeamTakeoffDispatch {
  const assumedWastePct = options.assumedWastePct ?? '5';
  const decisions = options.decisions ?? {};
  const lines: Array<Omit<ManualLineRecord, 'id'>> = [];
  const skippedBars: BeamTakeoffSkippedBar[] = [];
  const explanations: string[] = [];

  const baseEvidence = beamDetailBaseEvidence(detail, sourceFileName);
  const observationBase = beamDetailObservationBase(detail);

  // Candidatas al envío: las clasificadas entran por defecto; las sin
  // clasificar SOLO con decisión explícita (asignar banda o aceptar tal cual).
  interface SendCandidate {
    reading: LongitudinalBarReading;
    effectivePosition: 'superior' | 'inferior' | 'sin_clasificar';
    decision?: LongitudinalBarDecision;
  }
  const candidates: SendCandidate[] = [];
  for (const reading of [...detail.topLongitudinalBars, ...detail.bottomLongitudinalBars]) {
    candidates.push({
      reading,
      effectivePosition: reading.position,
      decision: decisions[reading.readingId],
    });
  }
  for (const reading of detail.unclassifiedLongitudinalBars) {
    const decision = decisions[reading.readingId];
    if (decision?.markForReview) {
      skippedBars.push({
        position: reading.position,
        description: reading.description,
        sourceText: reading.sourceText,
        reason: 'Marcada para revisión por la usuaria: no se envía.',
      });
      continue;
    }
    if (decision?.assignPosition) {
      candidates.push({ reading, effectivePosition: decision.assignPosition, decision });
    } else if (decision?.acceptUnclassified) {
      candidates.push({ reading, effectivePosition: 'sin_clasificar', decision });
    } else {
      skippedBars.push({
        position: reading.position,
        description: reading.description,
        sourceText: reading.sourceText,
        reason:
          'Sin banda superior/inferior clara: asígnala a superior/inferior o acéptala sin clasificar en "Ver detalle".',
      });
    }
  }

  let topCount = 0;
  let bottomCount = 0;
  let unclassifiedCount = 0;
  for (const { reading, effectivePosition, decision } of candidates) {
    if (decision?.markForReview) {
      skippedBars.push({
        position: effectivePosition,
        description: reading.description,
        sourceText: reading.sourceText,
        reason: 'Marcada para revisión por la usuaria: no se envía.',
      });
      continue;
    }
    const cutLengthM = decision?.cutLengthM ?? reading.cutLengthM;
    if (!cutLengthM || !(Number(cutLengthM) > 0)) {
      skippedBars.push({
        position: effectivePosition,
        description: reading.description,
        sourceText: reading.sourceText,
        reason: 'Sin longitud de corte legible en la notación: no es computable por F1.',
      });
      continue;
    }
    if (!Number.isFinite(reading.barCode)) {
      skippedBars.push({
        position: effectivePosition,
        description: reading.description,
        sourceText: reading.sourceText,
        reason: 'Sin diámetro/código de varilla legible: no es computable por F1.',
      });
      continue;
    }
    if (decision?.quantity !== undefined && (!Number.isInteger(decision.quantity) || decision.quantity <= 0)) {
      skippedBars.push({
        position: effectivePosition,
        description: reading.description,
        sourceText: reading.sourceText,
        reason: 'Cantidad editada inválida: debe ser un entero mayor que 0.',
      });
      continue;
    }
    const quantity = decision?.quantity ?? reading.quantity;
    const edited = decision?.quantity !== undefined;
    const quantityMode: LongitudinalQuantityMode = edited ? 'manual' : reading.quantityMode;
    const quantitySource = edited ? 'editada por la usuaria' : reading.quantitySource;
    if (effectivePosition === 'superior') topCount += 1;
    else if (effectivePosition === 'inferior') bottomCount += 1;
    else unclassifiedCount += 1;
    lines.push({
      // La descripción/código es el texto normalizado del plano ("6#6350");
      // los campos estructurados (manualQuantity/manualCutLengthM) evitan que
      // F1 reinterprete su primer dígito como cantidad.
      originalDescription: reading.description,
      assumedWastePct,
      manualBarNumber: reading.barCode,
      manualQuantity: String(quantity),
      manualCutLengthM: cutLengthM,
      evidence: {
        ...baseEvidence,
        position: effectivePosition,
        confidence: '0.8',
        originalFragment: reading.sourceText,
        quantityMode,
        quantitySource,
        observation: [
          ...observationBase,
          `Posición: ${effectivePosition}${decision?.assignPosition ? ' (asignada por la usuaria)' : ''}`,
          edited
            ? `Cantidad ${quantity} editada por la usuaria (el primer dígito del texto "${reading.sourceText}" NO es cantidad)`
            : `Cantidad ${quantity} por aparición textual DXF (el primer dígito del texto "${reading.sourceText}" NO es cantidad)`,
          reading.markerEvidence !== undefined
            ? `Marcadores gráficos de apoyo: ${reading.markerEvidence} (confianza ${reading.markerConfidence ?? 'bajo'})`
            : 'Marcadores gráficos: no confiables / no disponibles (evidencia de apoyo, no bloquean)',
          decision?.cutLengthM !== undefined ? `Longitud de corte editada por la usuaria: ${decision.cutLengthM} m` : undefined,
          ...reading.warnings.filter((warning) => warning !== LONGITUDINAL_NO_MARKER_WARNING),
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · '),
      },
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
      : `Se enviarán ${lines.length} línea(s): ${topCount} superior, ${bottomCount} inferior, ${
          unclassifiedCount > 0 ? `${unclassifiedCount} sin clasificar, ` : ''
        }${stirrupIncluded ? 1 : 0} estribo.`;

  return {
    lines,
    topCount,
    bottomCount,
    unclassifiedCount,
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
  options: {
    assumedWastePct?: string;
    stirrupChoice?: StirrupTakeoffChoice;
    decisions?: BeamLongitudinalDecisions;
  } = {},
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
