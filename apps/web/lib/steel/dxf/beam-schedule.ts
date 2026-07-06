/**
 * beam-schedule.ts — Beam Schedule Extraction: listado profesional por viga
 * desde DXF (F8B, puro).
 *
 * La usuaria no quiere estribos sueltos: quiere una fila por viga —
 * `VC-01 / EJE 1B-A / sección 50x60 / 6#655 / E#3@12 / fuente DXF` —
 * agrupando por elemento y asociando por cercanía espacial, capa/color y
 * texto: eje/ubicación, sección, refuerzo longitudinal, estribos/flejes
 * (con la normalización decimal compacta F8B) y verificación por segmentos.
 *
 * Honestidad: sin ubicación ⇒ `missing_location`; vecindad ambigua (varias
 * secciones o demasiados estribos distintos) ⇒ `requires_review`. Nada se
 * aprueba solo; enviar una fila al takeoff es un clic humano explícito.
 */
import {
  detectPdfIntakeCandidates,
} from '../pdf-intake-candidates';
import type { ManualLineRecord } from '../manual-takeoff';
import {
  evaluateStirrupSegmentSum,
  normalizeCompactStirrupNotation,
  type StirrupSegmentEvaluation,
} from './compact-stirrup-notation';
import { isDxfTextEntity, type DxfTextEntity } from './dxf-entities';
import type { DxfParseSuccess } from './dxf-parser';
import {
  dxfNeighborhoodRadius,
  isTitleBlockNoise,
  type DxfElementCandidate,
  type DxfStructuralExtraction,
} from './dxf-structural-extractor';
import { DXF_EVIDENCE_METHOD, DXF_SOURCE_TYPE } from './dxf-to-steel-evidence';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type BeamScheduleStatus = 'ok' | 'missing_location' | 'requires_review';

export const BEAM_SCHEDULE_STATUS_LABEL: Record<BeamScheduleStatus, string> = {
  ok: 'OK',
  missing_location: 'Sin ubicación',
  requires_review: 'Requiere revisión',
};

export interface BeamStirrupEntry {
  /** Token tal como aparece en el plano ("E#3@12", "2x153E#318.4"). */
  raw: string;
  /** Token/línea normalizada si aplicó la regla decimal compacta. */
  normalized?: string;
  /** Longitud de corte en cm si la nomenclatura la trae. */
  lengthCm?: number;
  warnings: readonly string[];
}

export interface BeamScheduleRow {
  elementKey: string;
  /** Eje/ubicación ("EJE 1B-A"), del propio código o de textos cercanos. */
  location?: string;
  sectionSpec?: string;
  /** Tokens de refuerzo longitudinal crudos ("6#655"). */
  longitudinalBars: readonly string[];
  stirrups: readonly BeamStirrupEntry[];
  /** Observación de longitud (verificación por segmentos u otra nota). */
  lengthObservation?: string;
  layer: string;
  colorIndex?: number;
  redSignal?: boolean;
  confidence: number;
  sourceText: string;
  coordinates?: { x: number; y: number };
  /** Líneas de texto cercanas usadas como contexto (transparencia). */
  nearbyTexts: readonly string[];
  status: BeamScheduleStatus;
  statusReasons: readonly string[];
  segmentCheck?: StirrupSegmentEvaluation;
}

// ---------------------------------------------------------------------------
// Patrones
// ---------------------------------------------------------------------------

/** Eje/ubicación: "EJE 1B-A", "EJES A-3", "EJE 1". */
const AXIS_PATTERN = /\bEJES?\s*[.:]?\s*([A-Z0-9]{1,3}(?:\s*[-–]\s*[A-Z0-9]{1,3})?)/i;
/** Longitudinal: "6#655" (cantidad#barra+long) SIN prefijo E de estribo. */
const LONGITUDINAL_PATTERN = /\d{1,2}\s*#\s*\d{2,4}\b/g;
/** Estribo/fleje: "E#3@12", "153E#3184", "2x153E#318.4". */
const STIRRUP_PATTERN = /(?:\d+\s*[xX]\s*)?\d*\s*E\s*#\s*\d{1,5}(?:\.\d)?(?:\s*@\s*\d+(?:[.,]\d+)?)?/gi;
/** Segmento gráfico de flejado: número corto puro ("50", "30", "12"). */
const SEGMENT_TEXT_PATTERN = /^\d{1,3}$/;
const SECTION_PATTERN = /(\d{2,3})\s*[xX×]\s*(\d{2,3})/g;
/** Longitud declarada dentro del token de estribo normalizado E#<bar><cm>. */
const STIRRUP_LENGTH_PATTERN = /E\s*#\s*(\d)(\d{2,4})\b/i;

function longitudinalTokens(text: string): string[] {
  const out: string[] = [];
  LONGITUDINAL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(LONGITUDINAL_PATTERN)) {
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 2), start);
    // Excluye estribos (E#) y prefijos de grupo tipo "2x" pegados al token.
    if (/E\s*$/i.test(before)) continue;
    out.push(match[0].replace(/\s+/g, ''));
  }
  return out;
}

function stirrupTokens(text: string): string[] {
  STIRRUP_PATTERN.lastIndex = 0;
  return [...text.matchAll(STIRRUP_PATTERN)]
    .map((m) => m[0].trim())
    .filter((token) => /E\s*#/i.test(token));
}

/** Ubicación desde el propio código: VC-EJE-1 → "EJE 1"; VC-EJE-1A → "EJE 1A". */
function locationFromKey(elementKey: string): string | undefined {
  const match = /(?:^|-)EJE-?([A-Z0-9]+(?:-[A-Z0-9]+)?)$/i.exec(elementKey);
  return match ? `EJE ${match[1]}` : undefined;
}

/** Ubicación desde textos cercanos: "EJE 1B-A" → "EJE 1B-A". */
function locationFromContext(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    const match = AXIS_PATTERN.exec(line);
    if (match?.[1]) return `EJE ${match[1].toUpperCase().replace(/\s*[-–]\s*/g, '-')}`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Construcción del listado
// ---------------------------------------------------------------------------

export function buildBeamSchedule(
  parse: DxfParseSuccess,
  extraction: DxfStructuralExtraction,
): BeamScheduleRow[] {
  const beams = extraction.elements.filter((el) => el.elementType === 'beam');
  if (beams.length === 0) return [];

  const radius = dxfNeighborhoodRadius(parse.entities) * 1.5;
  const texts = parse.entities.filter(isDxfTextEntity);

  return beams.map((beam) => buildRow(beam, texts, radius));
}

function buildRow(
  beam: DxfElementCandidate,
  texts: readonly DxfTextEntity[],
  radius: number,
): BeamScheduleRow {
  // Vecindad espacial propia (más amplia que la del extractor, cap 12).
  const nearbyTexts: string[] = [];
  if (beam.coordinates) {
    for (const text of texts) {
      if (typeof text.x !== 'number' || typeof text.y !== 'number') continue;
      const distance = Math.hypot(text.x - beam.coordinates.x, text.y - beam.coordinates.y);
      if (distance > radius) continue;
      for (const line of text.rawText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || isTitleBlockNoise(trimmed, text.layer)) continue;
        if (trimmed === beam.sourceText) continue;
        if (nearbyTexts.length < 12 && !nearbyTexts.includes(trimmed)) nearbyTexts.push(trimmed);
      }
    }
  }
  const contextLines = [beam.sourceText, ...nearbyTexts];

  // Ubicación: primero el propio código (VC-EJE-1), luego textos cercanos.
  const location = locationFromKey(beam.elementKey) ?? locationFromContext(contextLines);

  // Secciones: la del elemento + las distintas que aparezcan cerca.
  const sections = new Set<string>();
  if (beam.sectionSpec) sections.add(beam.sectionSpec.toLowerCase());
  for (const line of contextLines) {
    SECTION_PATTERN.lastIndex = 0;
    for (const match of line.matchAll(SECTION_PATTERN)) {
      sections.add(`${match[1]}x${match[2]}`.toLowerCase());
    }
  }
  const sectionSpec = beam.sectionSpec ?? [...sections][0]?.replace('x', 'x');

  // Refuerzo longitudinal y estribos desde el contexto.
  const longitudinal = new Set<string>();
  const stirrupsByRaw = new Map<string, BeamStirrupEntry>();
  const segmentNumbers: number[] = [];

  for (const line of contextLines) {
    for (const token of longitudinalTokens(line)) longitudinal.add(token);
    for (const raw of stirrupTokens(line)) {
      if (stirrupsByRaw.has(raw)) continue;
      const normalization = normalizeCompactStirrupNotation(raw, { structuralContext: true });
      const normalized = normalization.applied ? normalization.normalizedText : undefined;
      const lengthMatch = STIRRUP_LENGTH_PATTERN.exec(normalized ?? raw);
      const lengthCm = lengthMatch ? Number.parseInt(lengthMatch[2] ?? '', 10) : undefined;
      stirrupsByRaw.set(raw, {
        raw,
        normalized,
        lengthCm: Number.isFinite(lengthCm) ? lengthCm : undefined,
        warnings: normalization.warnings,
      });
    }
    if (SEGMENT_TEXT_PATTERN.test(line)) {
      const value = Number.parseInt(line, 10);
      if (value >= 2 && value <= 300) segmentNumbers.push(value);
    }
  }

  // Verificación por segmentos gráficos contra el primer estribo con longitud.
  const stirrups = [...stirrupsByRaw.values()];
  const declared = stirrups.find((s) => s.lengthCm !== undefined)?.lengthCm;
  const segmentCheck =
    declared !== undefined && segmentNumbers.length >= 2
      ? evaluateStirrupSegmentSum(segmentNumbers, declared, { assumeSymmetry: true })
      : undefined;

  // Estado honesto.
  const statusReasons: string[] = [];
  if (sections.size > 1) {
    statusReasons.push(`Secciones distintas cerca del elemento: ${[...sections].join(', ')} — confirmar contra el detalle.`);
  }
  if (stirrups.length >= 3) {
    statusReasons.push(`Varios textos de estribo cercanos (${stirrups.length}): asociación ambigua, confirmar cuál pertenece a esta viga.`);
  }
  if (segmentCheck?.status === 'segment_sum_mismatch') {
    statusReasons.push(segmentCheck.message);
  }
  let status: BeamScheduleStatus = 'ok';
  if (statusReasons.length > 0) status = 'requires_review';
  else if (!location) {
    status = 'missing_location';
    statusReasons.push('No se encontró eje/ubicación en el código ni en los textos cercanos.');
  }

  return {
    elementKey: beam.elementKey,
    location: location ?? undefined,
    sectionSpec,
    longitudinalBars: [...longitudinal],
    stirrups,
    lengthObservation: segmentCheck?.message,
    layer: beam.sourceLayer,
    colorIndex: beam.colorIndex,
    redSignal: beam.redSignal,
    confidence: beam.confidence,
    sourceText: beam.sourceText,
    coordinates: beam.coordinates,
    nearbyTexts,
    status,
    statusReasons,
    segmentCheck,
  };
}

// ---------------------------------------------------------------------------
// Fila seleccionada → líneas del takeoff (clic humano = aprobación)
// ---------------------------------------------------------------------------

/**
 * Convierte los tokens interpretables por F1 de UNA fila del listado en
 * líneas del takeoff con evidencia `dxf` (viga, capa, coordenadas). El clic
 * de la usuaria sobre la fila ES la aprobación; F1 recalcula todo al entrar.
 */
export function beamScheduleRowToManualLines(
  row: BeamScheduleRow,
  sourceFileName: string,
  options: { assumedWastePct?: string } = {},
): readonly Omit<ManualLineRecord, 'id'>[] {
  const assumedWastePct = options.assumedWastePct ?? '5';
  const tokens = [
    ...row.stirrups.map((s) => s.normalized ?? s.raw),
    ...row.longitudinalBars,
  ];
  if (tokens.length === 0) return [];

  const candidates = detectPdfIntakeCandidates(tokens.join('\n'), {
    pageNumber: 1,
    fileName: sourceFileName,
  });

  return candidates
    .filter((candidate) => candidate.f1Ready)
    .map((candidate) => ({
      originalDescription: candidate.candidateText,
      assumedWastePct,
      evidence: {
        sourceFileName,
        pageNumber: 1,
        sourceType: DXF_SOURCE_TYPE,
        readingMethod: DXF_EVIDENCE_METHOD,
        confidence: candidate.confidenceScore,
        originalFragment: candidate.evidence.originalText,
        observation: [
          `Viga ${row.elementKey}`,
          row.location ? `Ubicación ${row.location}` : undefined,
          row.sectionSpec ? `Sección ${row.sectionSpec}` : undefined,
          `Capa: ${row.layer}`,
          'Listado de vigas DXF (F8B)',
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · '),
      },
    }));
}
