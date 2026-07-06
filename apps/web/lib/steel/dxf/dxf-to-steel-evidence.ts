/**
 * dxf-to-steel-evidence.ts — Puente DXF → evidencia Steel Ops (F8A, puro).
 *
 * Dos salidas, ninguna auto-aprobada:
 * 1. Evidencia por elemento (method `dxf`) para revisión/registro.
 * 2. Candidatos de NOTACIÓN de acero (4#5 L=6.00, E#3@15…) detectados en los
 *    textos del DXF con el detector F6A existente, listos para aprobarse
 *    manualmente y entrar al takeoff F3 con evidencia `dxf` — que el Excel
 *    F4A.2 ya muestra en EVIDENCIAS (archivo, fuente, método, fragmento,
 *    observación) sin tocar el export.
 *
 * F8A no calcula ml/kg/costos: F1 parsea/calcula al entrar al takeoff.
 */
import {
  detectPdfIntakeCandidates,
  type PdfIntakeCandidate,
} from '../pdf-intake-candidates';
import type { ManualLineRecord } from '../manual-takeoff';
import { isDxfTextEntity, type DxfTextEntity } from './dxf-entities';
import type { DxfParseSuccess } from './dxf-parser';
import { isTitleBlockNoise, type DxfElementCandidate } from './dxf-structural-extractor';

export const DXF_EVIDENCE_METHOD = 'dxf' as const;
export const DXF_SOURCE_TYPE = 'dxf' as const;

/** Evidencia de un dato leído del DXF (contrato G del mandato F8A). */
export interface DxfEvidenceRecord {
  method: typeof DXF_EVIDENCE_METHOD;
  sourceFileName: string;
  sourceType: typeof DXF_SOURCE_TYPE;
  entityType: string;
  layer: string;
  blockName?: string;
  coordinates?: { x: number; y: number };
  /** Texto/entidad literal que sustenta el dato. */
  originalFragment: string;
  /** 0–1 como string decimal (paridad F1/F6). */
  confidence: string;
  observation: string;
}

/** Evidencia revisable de un candidato de elemento DXF. */
export function dxfElementToEvidence(
  candidate: DxfElementCandidate,
  sourceFileName: string,
): DxfEvidenceRecord {
  const observationParts = [
    `Capa: ${candidate.sourceLayer}`,
    candidate.sectionSpec ? `Sección ${candidate.sectionSpec}` : undefined,
    candidate.diameter ? `Diámetro ${candidate.diameter}` : undefined,
    candidate.nearbyInserts.length > 0 ? `Bloques cercanos: ${candidate.nearbyInserts.join(', ')}` : undefined,
    ...candidate.warnings,
  ].filter((part): part is string => Boolean(part));

  return {
    method: DXF_EVIDENCE_METHOD,
    sourceFileName,
    sourceType: DXF_SOURCE_TYPE,
    entityType: candidate.sourceEntityType,
    layer: candidate.sourceLayer,
    blockName: candidate.nearbyInserts[0],
    coordinates: candidate.coordinates,
    originalFragment: candidate.sourceText,
    confidence: candidate.confidence.toFixed(2),
    observation: observationParts.join(' · '),
  };
}

// ---------------------------------------------------------------------------
// Candidatos de notación de acero desde textos DXF (reusa el detector F6A)
// ---------------------------------------------------------------------------

/** Contexto CAD de la línea de texto de la que salió cada candidato. */
export interface DxfLineContext {
  layer: string;
  entityType: 'TEXT' | 'MTEXT';
  coordinates?: { x: number; y: number };
}

export interface DxfNotationDetection {
  candidates: readonly PdfIntakeCandidate[];
  /** Contexto por índice de línea (mismo orden del texto enviado a F6A). */
  contextByLineIndex: ReadonlyMap<number, DxfLineContext>;
}

/**
 * Corre el detector F6A sobre las líneas de texto del DXF (sin ruido de
 * rótulo). Cada candidato conserva su `lineIndex`, que aquí mapea al
 * contexto CAD (capa/entidad/coordenadas) para construir la evidencia `dxf`.
 */
export function detectDxfNotationCandidates(
  parse: DxfParseSuccess,
  sourceFileName: string,
): DxfNotationDetection {
  const linesWithContext: Array<{ line: string; context: DxfLineContext }> = [];
  for (const entity of parse.entities) {
    if (!isDxfTextEntity(entity)) continue;
    for (const line of entity.rawText.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      if (isTitleBlockNoise(trimmed, entity.layer)) continue;
      linesWithContext.push({
        line: trimmed,
        context: contextOf(entity),
      });
    }
  }

  const contextByLineIndex = new Map<number, DxfLineContext>();
  linesWithContext.forEach((item, index) => contextByLineIndex.set(index, item.context));

  const candidates = detectPdfIntakeCandidates(linesWithContext.map((item) => item.line).join('\n'), {
    pageNumber: 1,
    fileName: sourceFileName,
  });

  return { candidates, contextByLineIndex };
}

function contextOf(entity: DxfTextEntity): DxfLineContext {
  return {
    layer: entity.layer,
    entityType: entity.type,
    coordinates:
      typeof entity.x === 'number' && typeof entity.y === 'number'
        ? { x: entity.x, y: entity.y }
        : undefined,
  };
}

/**
 * Convierte candidatos APROBADOS y parseables por F1 a líneas del takeoff
 * F3 con evidencia `dxf` completa (archivo, capa, entidad, coordenadas,
 * fragmento, observación). Misma compuerta que F6A/F6E: aprobado + f1Ready.
 */
export function dxfCandidatesToManualLines(
  detection: DxfNotationDetection,
  sourceFileName: string,
  options: { assumedWastePct?: string } = {},
): readonly Omit<ManualLineRecord, 'id'>[] {
  const assumedWastePct = options.assumedWastePct ?? '5';
  return detection.candidates
    .filter((candidate) => candidate.status === 'approved' && candidate.f1Ready)
    .map((candidate) => {
      const context = detection.contextByLineIndex.get(candidate.evidence.lineIndex);
      const observationParts = [
        candidate.elementLabel ? `Elemento ${candidate.elementLabel}` : undefined,
        context ? `Capa: ${context.layer}` : undefined,
        context ? `Entidad: ${context.entityType}` : undefined,
        context?.coordinates
          ? `Coords (${context.coordinates.x.toFixed(1)}, ${context.coordinates.y.toFixed(1)})`
          : undefined,
        candidate.evidence.detectionReason,
      ].filter((part): part is string => Boolean(part));

      return {
        originalDescription: candidate.candidateText,
        assumedWastePct,
        evidence: {
          sourceFileName,
          pageNumber: 1,
          sourceType: DXF_SOURCE_TYPE,
          readingMethod: DXF_EVIDENCE_METHOD,
          confidence: candidate.confidenceScore,
          originalFragment: candidate.evidence.originalText,
          observation: observationParts.join(' · '),
        },
      };
    });
}
