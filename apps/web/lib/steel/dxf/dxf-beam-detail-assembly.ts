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
  stirrupZones: readonly StirrupZone[];
  stirrupZonesTotal?: number;
  stirrupSummary?: StirrupSummary;
  zoneComparison?: StirrupZoneComparison;
  segmentCheck?: StirrupSegmentEvaluation;
  crossSectionMarkers: CrossSectionMarkers;
  sourceLayer: string;
  sourceColor?: number;
  sourceEntityHandles: readonly string[];
  sourceFragments: readonly string[];
  coordinates?: { x: number; y: number };
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
/** Token longitudinal normalizado: "6#6330" (3–4 dígitos de longitud). */
const LONGITUDINAL_TOKEN_PATTERN = /\b(\d)#(\d)(\d{3,4})\b/g;
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
): BarMarker[] {
  const circles = entities.filter((e): e is DxfCircleEntity => e.type === 'CIRCLE');
  const inserts = entities.filter((e): e is DxfInsertEntity => e.type === 'INSERT');

  const candidates: BarMarker[] = [];
  for (const circle of circles) {
    if (!hasPoint(circle)) continue;
    if (isTitleLayer(circle.layer)) continue; // rótulo jamás cuenta
    if (distance(circle, anchor) > radius) continue; // fuera del corte
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
    (insert) => hasPoint(insert) && !isTitleLayer(insert.layer) && distance(insert as Point, anchor) <= radius,
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
): BeamDetail[] {
  const schedule = buildBeamSchedule(parse, extraction);
  if (schedule.length === 0) return [];
  const radius = dxfNeighborhoodRadius(parse.entities) * 1.5;
  return schedule.map((row) => assembleDetail(row, parse.entities, radius));
}

interface RegionText {
  entity: DxfTextEntity;
  line: string;
}

function assembleDetail(row: BeamScheduleRow, entities: readonly DxfEntity[], radius: number): BeamDetail {
  const anchor = row.coordinates;
  const warnings: string[] = [];
  const fragments = new Set<string>([row.sourceText]);
  const handles = new Set<string>();

  // Región del detalle: entidades dentro del radio alrededor del código.
  const regionTexts: RegionText[] = [];
  if (anchor) {
    for (const entity of entities) {
      if (!isDxfTextEntity(entity) || !hasPoint(entity)) continue;
      if (distance(entity, anchor) > radius) continue;
      for (const line of entity.rawText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || isTitleBlockNoise(trimmed, entity.layer)) continue;
        regionTexts.push({ entity, line: trimmed });
        if (entity.handle) handles.add(entity.handle);
      }
    }
  }

  // ---- Marcadores del corte (shape-driven) --------------------------------
  const markers = anchor ? collectBarMarkers(entities, anchor, radius) : [];
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

  // ---- Longitudinales superior/inferior -----------------------------------
  const longitudinal: Array<{ reading: LongitudinalBarReading; y?: number }> = [];
  for (const { entity, line } of regionTexts) {
    if (!HAS_LONGITUDINAL_HINT.test(line)) continue;
    if (/E\s*#/i.test(line)) continue; // estribos van aparte

    const normalization = normalizeCompactLongitudinalNotation(line, { structuralContext: true });
    const normalizedLine = normalization.applied ? normalization.normalizedText : line;

    LONGITUDINAL_TOKEN_PATTERN.lastIndex = 0;
    for (const match of normalizedLine.matchAll(LONGITUDINAL_TOKEN_PATTERN)) {
      const barCode = Number.parseInt(match[2] ?? '', 10);
      const lengthCm = Number.parseInt(match[3] ?? '', 10);
      const tokenWarnings = [...normalization.warnings];
      longitudinal.push({
        y: entity.y,
        reading: {
          description: match[0],
          sourceText: line,
          barCode,
          cutLengthM: Number.isFinite(lengthCm) ? String(lengthCm / 100) : undefined,
          position: 'sin_clasificar',
          quantityStatus: 'requires_review',
          warnings: tokenWarnings,
        },
      });
      fragments.add(line);
    }
  }

  // Banda superior/inferior: divisor por marcadores o por mayor salto en Y.
  const dividerY = longitudinalDivider(markers, longitudinal);
  const top: LongitudinalBarReading[] = [];
  const bottom: LongitudinalBarReading[] = [];
  for (const item of longitudinal) {
    let position: LongitudinalBarReading['position'] = 'sin_clasificar';
    if (dividerY !== undefined && item.y !== undefined) {
      position = item.y >= dividerY ? 'superior' : 'inferior';
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
    if (position === 'superior') top.push(reading);
    else if (position === 'inferior') bottom.push(reading);
    else {
      warnings.push(`"${item.reading.sourceText}": sin banda superior/inferior clara — requiere revisión.`);
      top.push(reading);
    }
  }

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

  const segmentCheck =
    summary?.lengthCm !== undefined && segmentNumbers.length >= 2
      ? evaluateStirrupSegmentSum(segmentNumbers, summary.lengthCm, { assumeSymmetry: true })
      : undefined;

  // ---- Estado y confianza ---------------------------------------------------
  const statusReasons: string[] = [...row.statusReasons];
  if (zoneComparison?.status === 'zone_count_mismatch') statusReasons.push(zoneComparison.message);
  if (crossSectionMarkers.status !== 'from_markers' && longitudinal.length > 0) {
    statusReasons.push('Cantidad de longitudinales sin conteo gráfico confiable.');
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
    stirrupZones: zones,
    stirrupZonesTotal: zonesTotal,
    stirrupSummary: summary,
    zoneComparison,
    segmentCheck,
    crossSectionMarkers,
    sourceLayer: row.layer,
    sourceColor: row.colorIndex,
    sourceEntityHandles: [...handles],
    sourceFragments: [...fragments],
    coordinates: row.coordinates,
    confidence,
    warnings,
    status,
    statusReasons,
  };
}

/** Divisor Y del corte: marcadores si existen; si no, mayor salto entre textos. */
function longitudinalDivider(
  markers: readonly BarMarker[],
  longitudinal: ReadonlyArray<{ y?: number }>,
): number | undefined {
  if (markers.length >= 2) {
    const ys = markers.map((m) => m.y);
    return (Math.min(...ys) + Math.max(...ys)) / 2;
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
  return bestGap > range * 0.2 ? dividerY : undefined;
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

/**
 * Convierte UN beam detail en líneas F3 con evidencia dxf completa. Solo
 * entra lo verificable: el resumen de estribos interpretable por F1, y los
 * longitudinales cuya CANTIDAD viene del conteo gráfico (`4#6330` = 4
 * marcadores × varilla #6 de 330 cm). Lo demás queda en revisión, jamás se
 * inventa.
 */
export function beamDetailToManualLines(
  detail: BeamDetail,
  sourceFileName: string,
  options: { assumedWastePct?: string } = {},
): readonly Omit<ManualLineRecord, 'id'>[] {
  const assumedWastePct = options.assumedWastePct ?? '5';
  const lines: Array<Omit<ManualLineRecord, 'id'>> = [];

  const baseEvidence = {
    sourceFileName,
    pageNumber: 1,
    sourceType: DXF_SOURCE_TYPE,
    readingMethod: DXF_EVIDENCE_METHOD,
    elementKey: detail.beamKey,
    locationText: detail.locationText,
    beamDetailId: detail.beamDetailId,
  };

  const observationBase = [
    `Viga ${detail.beamKey}`,
    detail.locationText ? `Ubicación ${detail.locationText}` : undefined,
    detail.sectionSpec ? `Sección ${detail.sectionSpec}` : undefined,
    `Capa: ${detail.sourceLayer}`,
    detail.sourceColor !== undefined ? `Color ACI ${detail.sourceColor}` : undefined,
    detail.coordinates ? `Coords (${detail.coordinates.x.toFixed(1)}, ${detail.coordinates.y.toFixed(1)})` : undefined,
    detail.sourceEntityHandles.length > 0 ? `Handles: ${detail.sourceEntityHandles.slice(0, 6).join(',')}` : undefined,
  ].filter((part): part is string => Boolean(part));

  if (detail.stirrupSummary) {
    lines.push({
      originalDescription: detail.stirrupSummary.normalized,
      assumedWastePct,
      evidence: {
        ...baseEvidence,
        position: 'estribo',
        confidence: detail.zoneComparison?.status === 'match' ? '0.9' : '0.75',
        originalFragment: detail.stirrupSummary.raw,
        observation: [
          ...observationBase,
          'Posición: estribos/flejado',
          detail.zoneComparison?.message,
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · '),
      },
    });
  }

  for (const reading of [...detail.topLongitudinalBars, ...detail.bottomLongitudinalBars]) {
    if (reading.quantityFromGraphic === undefined || !reading.cutLengthM) continue;
    const lengthCm = Math.round(Number(reading.cutLengthM) * 100);
    lines.push({
      originalDescription: `${reading.quantityFromGraphic}#${reading.barCode}${lengthCm}`,
      assumedWastePct,
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

  return lines;
}
