/**
 * pdf-ocr.ts — Lógica PURA de la estación híbrida nativo+OCR (F6C).
 *
 * Problema real: los PDF de AutoCAD se ven legibles pero la capa de texto
 * nativa puede omitir textos SHX convertidos a geometría, textos rotados,
 * cotas pequeñas, llamados y tablas. F6C agrega OCR client-side POR PÁGINA
 * elegida y una comparación nativo↔OCR para revisión humana minuciosa.
 *
 * Reglas duras (anti-alucinación, espejo f6-cm-1 / F6-S9):
 * - El OCR nunca aprueba, nunca calcula, nunca usa escala ni geometría.
 * - Todo candidato nacido de OCR tiene TECHO de confianza `low`, estado
 *   `needs_review` y advertencia explícita de verificación.
 * - Si el OCR contradice al texto nativo (mismo elemento y varilla, texto
 *   distinto), ambos candidatos quedan marcados en CONFLICTO.
 * - Nada se corrige "solo": las sospechas (O/0, I/1, S/5) se advierten,
 *   jamás se sustituyen.
 *
 * Este módulo no toca tesseract ni el DOM: es 100 % testeable en Node.
 * El borde browser (render de página + tesseract.js) vive en
 * `pdf-ocr-client.ts`.
 */
import {
  detectPdfIntakeCandidates,
  type PdfIntakeCandidate,
} from './pdf-intake-candidates';
import { elementGroupKey } from './pdf-plan-set';
import type { ExtractedPdfPage, PlanSourceType } from './pdf-text-extract';

// ---------------------------------------------------------------------------
// 1. Diagnóstico de cobertura por página
// ---------------------------------------------------------------------------

export type PageCoverageLevel = 'buena' | 'parcial' | 'pobre' | 'sin_texto';

export interface PageCoverage {
  level: PageCoverageLevel;
  nativeLineCount: number;
  nativeCharCount: number;
  nativeCandidateCount: number;
  /**
   * true cuando hay mucho contenido dibujado y poco texto nativo: típico de
   * textos SHX de AutoCAD convertidos a geometría. Sugiere usar OCR asistido.
   */
  suspectedHiddenText: boolean;
}

/** Umbral de operaciones de dibujo para sospechar texto convertido a geometría. */
const DRAWING_OPS_SUSPECT_THRESHOLD = 200;

export function classifyPageCoverage(
  page: Pick<ExtractedPdfPage, 'text' | 'charCount'>,
  options: { drawingOpCount?: number } = {},
): PageCoverage {
  const nativeLineCount = page.text.length === 0 ? 0 : page.text.split(/\r?\n/).filter((l) => l.trim()).length;
  const nativeCandidateCount = page.text.length === 0 ? 0 : detectPdfIntakeCandidates(page.text).length;
  const drawingOpCount = options.drawingOpCount ?? 0;

  let level: PageCoverageLevel;
  if (page.charCount === 0) level = 'sin_texto';
  else if (page.charCount < 60) level = 'pobre';
  else if (page.charCount < 240) level = 'parcial';
  else level = 'buena';

  return {
    level,
    nativeLineCount,
    nativeCharCount: page.charCount,
    nativeCandidateCount,
    suspectedHiddenText: drawingOpCount >= DRAWING_OPS_SUSPECT_THRESHOLD && page.charCount < 240,
  };
}

export const PAGE_COVERAGE_LABEL: Record<PageCoverageLevel, string> = {
  buena: 'Cobertura buena',
  parcial: 'Cobertura parcial',
  pobre: 'Cobertura pobre',
  sin_texto: 'Sin texto nativo',
};

export const HIDDEN_TEXT_WARNING =
  'Algunos textos visibles pueden estar convertidos a geometria (tipico de fuentes SHX de AutoCAD) y no salir en la extraccion nativa. Usa OCR asistido para intentar leer textos visibles no seleccionables.';

// ---------------------------------------------------------------------------
// 2. Estado del OCR por página
// ---------------------------------------------------------------------------

export type OcrPageStatus = 'pendiente' | 'leyendo' | 'completado' | 'error';

export const OCR_UNAVAILABLE_MESSAGE =
  'OCR no disponible en este navegador o fallo la carga del motor. Continua con el texto nativo, edita el texto de la pagina o pega el texto manualmente.';

export const OCR_REVIEW_WARNING =
  'Leido por OCR sobre la pagina renderizada: el OCR puede confundirse; revisa contra el plano original antes de aprobar.';

/** Sospecha ampliada para OCR: O/0, I/1, l/1 y S/5 pegados a dígitos. */
const OCR_EXTRA_SUSPECT_PATTERN = /\d[OoIlS]|[OoIlS]\d/;

export function hasOcrCharSuspicion(text: string): boolean {
  return OCR_EXTRA_SUSPECT_PATTERN.test(text);
}

export const OCR_CHAR_SUSPICION_WARNING =
  'Posible confusion de caracteres del OCR (O/0, I/1, S/5) en este fragmento: verifica cada digito contra el plano.';

/**
 * Tesseract suele NO reconocer el simbolo `#` de la notacion de despiece
 * (lo lee como 4, :+, etc.). Si el texto OCR de la pagina no trae `#` pero
 * muestra huellas tipicas (bloques largos de digitos o `E` seguida de
 * puntuacion y digitos), se advierte para que el humano corrija el texto
 * ANTES de detectar. Reconstruir el `#` automaticamente seria inventar
 * (¿545600 es 5#5600, 5#45600 o 54#5600?) — prohibido.
 */
const LOST_HASH_HINT_PATTERN = /\d{5,6}\b|\dE\s*[:;+*=.]{1,2}\s*\d{3,5}\b/;

export function hasLostHashSuspicion(ocrText: string): boolean {
  if (ocrText.includes('#')) return false;
  return LOST_HASH_HINT_PATTERN.test(ocrText);
}

export const OCR_LOST_HASH_WARNING =
  'El OCR suele confundir el simbolo # de la notacion de despiece: si ves algo como "545600" o "74E:+3200" donde el plano dice "5#5600" o "74E#3200", corrige el texto OCR antes de detectar. No se reconstruye automaticamente para no inventar.';

/**
 * ¿`ocrToken` es una variante CORRUPTA de `nativeFragment` por pérdida del
 * símbolo `#`? (# omitido: "55600"; # leído como otro carácter: "545600").
 * Comparación de lectura, jamás reconstrucción.
 */
export function isOcrSymbolLossVariant(nativeFragment: string, ocrToken: string): boolean {
  const native = nativeFragment.toUpperCase().replace(/\s+/g, '');
  const ocr = ocrToken.toUpperCase().replace(/\s+/g, '');
  if (!native.includes('#') || ocr.includes('#') || native === ocr) return false;
  const escaped = native.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace('#', '[^#]?')}$`).test(ocr);
}

/** Advertencia ESPECÍFICA por candidato cuando el OCR corrompió su lectura. */
export function ocrSymbolLossCandidateWarning(nativeText: string, ocrReading: string): string {
  return `El OCR leyo "${ocrReading}" donde el texto nativo dice "${nativeText}": se conserva la lectura nativa y la variante OCR se descarta de la lista (no se reconstruye ni se degrada el candidato nativo).`;
}

// ---------------------------------------------------------------------------
// 3. Candidatos desde OCR (con techo de confianza) y comparación nativo↔OCR
// ---------------------------------------------------------------------------

export interface OcrPageInput {
  pageNumber: number;
  ocrText: string;
  sourceType?: PlanSourceType;
}

/**
 * Aplica el TECHO de OCR a un candidato detectado sobre texto OCR:
 * nunca por encima de `low`, nunca `pending`, siempre con advertencia.
 */
export function capOcrCandidate(candidate: PdfIntakeCandidate): PdfIntakeCandidate {
  const cappedLevel =
    candidate.confidenceLevel === 'not_interpretable' || candidate.confidenceLevel === 'needs_review'
      ? candidate.confidenceLevel
      : 'low';
  const warnings = [...candidate.warnings, OCR_REVIEW_WARNING];
  // Sospecha sobre la LINEA completa: los caracteres corruptos suelen quedar
  // justo fuera del fragmento matcheado (leccion F6A, riesgo R1).
  if (hasOcrCharSuspicion(candidate.evidence.lineText)) {
    warnings.push(OCR_CHAR_SUSPICION_WARNING);
  }
  return {
    ...candidate,
    confidenceLevel: cappedLevel,
    confidenceScore: String(Math.min(Number(candidate.confidenceScore), 0.5)),
    confidenceReason: `${candidate.confidenceReason} Origen OCR: techo de confianza baja (regla F6-S9).`,
    status: candidate.status === 'discarded' ? 'discarded' : 'needs_review',
    warnings,
  };
}

/** Detecta candidatos sobre el texto OCR de páginas, ya con techo aplicado. */
export function detectOcrCandidates(
  pages: readonly OcrPageInput[],
  options: { fileName?: string } = {},
): PdfIntakeCandidate[] {
  return pages.flatMap((page) =>
    detectPdfIntakeCandidates(page.ocrText, {
      pageNumber: page.pageNumber,
      fileName: options.fileName,
      sourceType: page.sourceType,
      method: 'ocr',
    })
      .map((candidate) => ({ ...candidate, id: `ocr-${candidate.id}` }))
      .map(capOcrCandidate),
  );
}

/** OCR multi-fuente con ids únicos por fuente (espejo de detectPlanSetCandidates). */
export function detectPlanSetOcrCandidates(
  sources: readonly { fileName?: string; pages: readonly OcrPageInput[] }[],
): PdfIntakeCandidate[] {
  return sources.flatMap((source, index) =>
    detectOcrCandidates(source.pages, { fileName: source.fileName }).map((candidate) => ({
      ...candidate,
      id: `src${index + 1}-${candidate.id}`,
    })),
  );
}

export interface HybridComparisonStats {
  nativeOnly: number;
  ocrOnly: number;
  /** Detectado por ambos métodos (se conserva el nativo, anotado). */
  confirmedByBoth: number;
  conflicts: number;
  /** Lecturas OCR corruptas del # detectadas y descartadas (F7.1): el nativo manda. */
  symbolLossDiscarded: number;
}

export interface HybridComparisonResult {
  /** Nativos (anotados si OCR los confirma o contradice) + solo-OCR (capados). */
  candidates: PdfIntakeCandidate[];
  stats: HybridComparisonStats;
}

function dedupeKey(candidate: PdfIntakeCandidate): string {
  return candidate.candidateText.toUpperCase().replace(/\s+/g, '');
}

function barNumberOf(candidate: PdfIntakeCandidate): string | undefined {
  return candidate.candidateText.match(/#\s*(\d{1,2})/)?.[1];
}

function conflictSignature(candidate: PdfIntakeCandidate): string | undefined {
  const bar = barNumberOf(candidate);
  if (!bar || !candidate.elementLabel) return undefined;
  return `${elementGroupKey(candidate.elementLabel)}·#${bar}·p${candidate.evidence.pageNumber}`;
}

export const OCR_CONFLICT_WARNING =
  'Conflicto nativo vs OCR: ambos metodos leyeron el mismo elemento y varilla con texto distinto. Verifica contra el plano cual es el correcto.';

/**
 * Compara candidatos nativos y OCR SIN fusionar datos:
 * - misma lectura por ambos métodos ⇒ se conserva el nativo, anotado como
 *   confirmado (el duplicado OCR se descarta de la lista).
 * - lectura OCR que es variante CORRUPTA del # de un nativo (F7.1) ⇒ se
 *   descarta la variante, el nativo conserva estado/confianza y recibe una
 *   advertencia ESPECÍFICA (no banner genérico). El OCR complementa, no
 *   reemplaza: nunca degrada una lectura nativa por su propia corrupción.
 * - lectura solo-OCR ⇒ entra capada a baja confianza.
 * - mismo elemento+varilla+página con texto distinto ⇒ CONFLICTO en ambos.
 */
export function compareHybridCandidates(
  nativeCandidates: readonly PdfIntakeCandidate[],
  ocrCandidates: readonly PdfIntakeCandidate[],
): HybridComparisonResult {
  const nativeKeys = new Set(nativeCandidates.map(dedupeKey));
  const merged: PdfIntakeCandidate[] = nativeCandidates.map((candidate) => ({ ...candidate }));
  const stats: HybridComparisonStats = {
    nativeOnly: 0,
    ocrOnly: 0,
    confirmedByBoth: 0,
    conflicts: 0,
    symbolLossDiscarded: 0,
  };

  const confirmedKeys = new Set<string>();
  const conflictedIds = new Set<string>();

  for (const ocrCandidate of ocrCandidates) {
    const key = dedupeKey(ocrCandidate);
    if (nativeKeys.has(key)) {
      confirmedKeys.add(key);
      stats.confirmedByBoth += 1;
      continue; // duplicado: el nativo manda; no se agrega dos veces
    }

    // F7.1: variante corrupta del # de una lectura nativa ⇒ el nativo manda.
    const lossTarget = merged.find(
      (native) =>
        native.evidence.method !== 'ocr' &&
        isOcrSymbolLossVariant(native.candidateText, ocrCandidate.candidateText),
    );
    if (lossTarget) {
      stats.symbolLossDiscarded += 1;
      const warning = ocrSymbolLossCandidateWarning(lossTarget.candidateText, ocrCandidate.candidateText);
      if (!lossTarget.warnings.includes(warning)) {
        lossTarget.warnings = [...lossTarget.warnings, warning];
      }
      continue; // la variante corrupta NO entra: sería ruido duplicado
    }

    const signature = conflictSignature(ocrCandidate);
    let isConflict = false;
    if (signature) {
      for (const native of merged) {
        if (conflictSignature(native) === signature && dedupeKey(native) !== key) {
          isConflict = true;
          if (!conflictedIds.has(native.id)) {
            native.warnings = [...native.warnings, OCR_CONFLICT_WARNING];
            native.crossCheck = 'conflict';
            native.status = native.status === 'discarded' ? 'discarded' : 'needs_review';
            conflictedIds.add(native.id);
          }
        }
      }
    }

    merged.push(
      isConflict
        ? {
            ...ocrCandidate,
            warnings: [...ocrCandidate.warnings, OCR_CONFLICT_WARNING],
            crossCheck: 'conflict',
          }
        : ocrCandidate,
    );
    stats.ocrOnly += 1;
    if (isConflict) stats.conflicts += 1;
  }

  for (const candidate of merged) {
    if (candidate.evidence.method !== 'ocr' && confirmedKeys.has(dedupeKey(candidate))) {
      candidate.crossCheck = 'confirmed_by_ocr';
      candidate.confidenceReason = `${candidate.confidenceReason} Confirmado tambien por OCR.`;
    }
  }

  stats.nativeOnly = nativeCandidates.length - confirmedKeys.size;
  return { candidates: merged, stats };
}
