/**
 * structural-drawing-analysis.ts — Orquestador de comprensión F7 (puro).
 *
 * Compone las capas F7 sobre el plan set F6B:
 *   texto posicionado → regiones → ejes/grilla → elementos → nomenclatura →
 *   tablas → hallazgos técnicos.
 *
 * Complementa (no reemplaza) la detección F6: los candidatos F6A/F6C entran
 * como evidencia de refuerzo del registro de elementos y los hallazgos se
 * muestran junto a la revisión existente. Varios planos a la vez: el registro
 * y la nomenclatura cruzan TODAS las fuentes (un elemento puede tener
 * ubicación en un plano y refuerzo en otro — eso se dice, no se inventa).
 *
 * Sin DB, sin red, sin DOM. F1 sigue siendo la única calculadora.
 */
import type { PdfIntakeCandidate } from './pdf-intake-candidates';
import type { PlanSourceType } from './pdf-text-extract';
import {
  buildSpatialPage,
  spatialPageFromPlainText,
  hasUsableLayout,
  type SpatialPage,
  type SpatialTextItemInput,
  type SpatialTextLine,
} from './drawing-spatial-model';
import { classifyPageRegions, regionOfLine, type PageRegionResult } from './drawing-page-regions';
import {
  detectGridContext,
  locateElementInGrid,
  type ElementLocationContext,
  type PageGridContext,
} from './drawing-grid-context';
import {
  buildElementRegistry,
  extractElementMentions,
  type ElementRecord,
  type ElementSourceMention,
} from './drawing-element-registry';
import { resolveNomenclature, type NomenclatureReport } from './drawing-nomenclature';
import { detectTableStructures, type TableDetectionResult } from './drawing-table-structure';
import {
  buildStructuralReviewFindings,
  type StructuralFinding,
} from './structural-review-findings';

// ---------------------------------------------------------------------------
// Entrada / salida
// ---------------------------------------------------------------------------

export interface DrawingAnalysisPageInput {
  pageNumber: number;
  included: boolean;
  sourceType?: PlanSourceType;
  /** Texto por líneas de la capa nativa (F6B) o pegado manual. */
  nativeText: string;
  /** Método del texto base (default `native_text`; pegado manual ⇒ `manual`). */
  method?: 'native_text' | 'manual';
  /** Items posicionados de pdfjs si la extracción los conservó (F7A). */
  spatialItems?: readonly SpatialTextItemInput[];
  /** Texto OCR de la página, si el usuario lo pidió (F6C). */
  ocrText?: string;
}

export interface DrawingAnalysisSourceInput {
  fileName: string;
  pages: readonly DrawingAnalysisPageInput[];
}

export interface StructuralDrawingAnalysis {
  spatialPages: readonly SpatialPage[];
  regionResults: readonly PageRegionResult[];
  gridContexts: readonly PageGridContext[];
  registry: readonly ElementRecord[];
  locationContexts: readonly ElementLocationContext[];
  nomenclature: NomenclatureReport;
  tableResults: readonly TableDetectionResult[];
  findings: readonly StructuralFinding[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clave canónica F7 para el rótulo de un candidato F6 ("PILOTE P-03" → "PILOTE P-03" key). */
export function elementKeyForCandidateLabel(label: string): string | undefined {
  return extractElementMentions(label)[0]?.elementKey;
}

function collectMentionsFromLines(
  lines: readonly SpatialTextLine[],
  regionResult: PageRegionResult | undefined,
): ElementSourceMention[] {
  const mentions: ElementSourceMention[] = [];
  for (const line of lines) {
    for (const match of extractElementMentions(line.text)) {
      mentions.push({
        elementKey: match.elementKey,
        rawLabel: match.rawLabel,
        sourceFileName: line.sourceFileName,
        pageNumber: line.pageNumber,
        lineId: line.lineId,
        lineText: line.text,
        method: line.method,
        regionType: regionResult ? regionOfLine(regionResult.regions, line.lineId)?.regionType : undefined,
        bbox: line.bbox,
      });
    }
  }
  return mentions;
}

function pageKey(fileName: string | undefined, pageNumber: number): string {
  return `${fileName ?? ''}·${pageNumber}`;
}

// ---------------------------------------------------------------------------
// Análisis completo
// ---------------------------------------------------------------------------

export function analyzeStructuralDrawings(
  sources: readonly DrawingAnalysisSourceInput[],
  candidates: readonly PdfIntakeCandidate[] = [],
): StructuralDrawingAnalysis {
  const spatialPages: SpatialPage[] = [];
  const ocrPages: SpatialPage[] = [];
  const ocrTextByPage = new Map<string, string>();

  for (const source of sources) {
    for (const page of source.pages) {
      if (!page.included) continue;
      const options = {
        pageNumber: page.pageNumber,
        sourceFileName: source.fileName,
        sourceType: page.sourceType,
      };
      if (page.spatialItems && page.spatialItems.length > 0) {
        spatialPages.push(buildSpatialPage(page.spatialItems, { ...options, method: 'native_text' }));
      } else if (page.nativeText.trim().length > 0) {
        // Estructura degradada honesta: texto sin coordenadas.
        spatialPages.push(
          spatialPageFromPlainText(page.nativeText, { ...options, method: page.method ?? 'native_text' }),
        );
      }
      if (page.ocrText && page.ocrText.trim().length > 0) {
        ocrPages.push(spatialPageFromPlainText(page.ocrText, { ...options, method: 'ocr' }));
        ocrTextByPage.set(pageKey(source.fileName, page.pageNumber), page.ocrText);
      }
    }
  }

  // Regiones, grilla y tablas por página nativa.
  const regionResults = spatialPages.map((page) => classifyPageRegions(page));
  const gridContexts = spatialPages.map((page) => detectGridContext(page));
  const tableResults = spatialPages.map((page) => detectTableStructures(page));

  // Menciones de elementos: nativas (con región) + OCR (sin región, método ocr).
  const mentions: ElementSourceMention[] = [];
  spatialPages.forEach((page, index) => {
    mentions.push(...collectMentionsFromLines(page.lines, regionResults[index]));
  });
  for (const page of ocrPages) {
    mentions.push(...collectMentionsFromLines(page.lines, undefined));
  }

  // Ubicación por grilla: cada mención con bbox se cruza con la grilla de su página.
  const locationContexts: ElementLocationContext[] = [];
  const keysWithGridLocation = new Set<string>();
  const locatedMentionKeys = new Set<string>();
  for (const mention of mentions) {
    if (!mention.bbox) continue;
    const pageIndex = spatialPages.findIndex(
      (page) => page.sourceFileName === mention.sourceFileName && page.pageNumber === mention.pageNumber,
    );
    if (pageIndex < 0) continue;
    const grid = gridContexts[pageIndex]!;
    if (!grid.gridDetected) continue;
    const dedupe = `${mention.elementKey}·${pageKey(mention.sourceFileName, mention.pageNumber)}`;
    if (locatedMentionKeys.has(dedupe)) continue;
    locatedMentionKeys.add(dedupe);
    const location = locateElementInGrid(
      { text: mention.rawLabel, bbox: mention.bbox, pageNumber: mention.pageNumber },
      grid,
      spatialPages[pageIndex]!.extent,
    );
    locationContexts.push(location);
    if (location.locationConfidence !== 'no_ubicable') {
      keysWithGridLocation.add(mention.elementKey);
    }
  }

  // Candidatos F6 vigentes = evidencia de refuerzo; conflictos F6C se heredan.
  const keysWithSteelCandidates = new Set<string>();
  const conflictsByKey = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (candidate.status === 'discarded' || !candidate.elementLabel) continue;
    const key = elementKeyForCandidateLabel(candidate.elementLabel);
    if (!key) continue;
    keysWithSteelCandidates.add(key);
    if (candidate.crossCheck === 'conflict') {
      const list = conflictsByKey.get(key) ?? [];
      list.push(
        `Lectura en conflicto nativo/OCR para "${candidate.candidateText}" (p.${candidate.evidence.pageNumber}).`,
      );
      conflictsByKey.set(key, list);
    }
  }

  const registry = buildElementRegistry({
    mentions,
    keysWithSteelCandidates,
    conflictsByKey,
    keysWithGridLocation,
  });

  // Nomenclatura: cruza TODAS las líneas del plan set (la leyenda puede vivir
  // en otra página u otro plano — ejemplo 5 del mandato).
  const allLines = [...spatialPages, ...ocrPages].flatMap((page) => page.lines);
  const allRegions = regionResults.flatMap((result) => result.regions);
  const nomenclature = resolveNomenclature({ lines: allLines, regions: allRegions });

  const findings = buildStructuralReviewFindings({
    spatialPages,
    regionResults,
    gridContexts,
    registry,
    locationContexts,
    nomenclature,
    tableResults,
    candidates,
    ocrTextByPage,
  });

  return {
    spatialPages,
    regionResults,
    gridContexts,
    registry,
    locationContexts,
    nomenclature,
    tableResults,
    findings,
  };
}

/** Resumen corto para la evidencia Excel (F4A.2): hallazgos de un elemento. */
export function findingsSummaryForElement(
  findings: readonly StructuralFinding[],
  elementKey: string | undefined,
): string | undefined {
  if (!elementKey) return undefined;
  const related = findings.filter((finding) => finding.elementKey === elementKey);
  if (related.length === 0) return undefined;
  return related
    .slice(0, 3)
    .map((finding) => `Hallazgo ${finding.type}: ${finding.explanation}`)
    .join(' | ');
}

/** ¿La página tiene análisis espacial real (coordenadas) o solo texto? */
export function analysisHasSpatialLayout(analysis: StructuralDrawingAnalysis): boolean {
  return analysis.spatialPages.some((page) => hasUsableLayout(page));
}
