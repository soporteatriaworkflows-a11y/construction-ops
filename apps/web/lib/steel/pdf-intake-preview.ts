import { parseSteelDescription } from '@/modules/steel';
import type { ManualLineRecord } from './manual-takeoff';

export type PdfIntakeConfidenceLevel = 'high' | 'medium' | 'low' | 'not_interpretable';
export type PdfIntakeCandidateStatus = 'pending' | 'approved' | 'discarded' | 'needs_review';

export interface PdfIntakeCandidate {
  id: string;
  originalText: string;
  suggestedInterpretation: string;
  pageNumber: number;
  zoneLabel: string;
  confidenceLevel: PdfIntakeConfidenceLevel;
  confidenceScore: string;
  confidenceReason: string;
  status: PdfIntakeCandidateStatus;
}

export interface PdfIntakeDetectOptions {
  pageNumber?: number;
  fileName?: string;
}

const EXPLICIT_LENGTH_PATTERN = /#\s*\d{1,2}[^#;\n\r|]*?\bL\s*=\s*\d+(?:[.,]\d+)?(?:\s*(?:CM|M))?/gi;
const ENCODED_REBAR_PATTERN = /(?:\d+\s*[xX]\s*)?\d+\s*E?\s*#\s*\d{2,5}(?:\s*@\s*\d+(?:[.,]\d+)?\s*CM)?/gi;
const SEGMENTED_LENGTH_PATTERN = /\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)+/g;
const SPACING_ONLY_PATTERN = /@\s*\d+(?:[.,]\d+)?\s*CM/gi;
const CANDIDATE_PATTERNS = [
  EXPLICIT_LENGTH_PATTERN,
  ENCODED_REBAR_PATTERN,
  SEGMENTED_LENGTH_PATTERN,
  SPACING_ONLY_PATTERN,
] as const;

function stableCandidateId(pageNumber: number, index: number, text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `pdf-p${pageNumber}-${index + 1}-${slug || 'candidate'}`;
}

function candidateZone(lineIndex: number, matchIndex: number): string {
  return `Pagina mock, linea ${lineIndex + 1}, marca ${matchIndex + 1}`;
}

function confidenceFromParsed(text: string): Pick<
  PdfIntakeCandidate,
  'confidenceLevel' | 'confidenceScore' | 'confidenceReason' | 'status' | 'suggestedInterpretation'
> {
  const parsed = parseSteelDescription(text);
  const score = Number(parsed.confidenceScore);

  if (parsed.steelFamily === 'other') {
    return {
      confidenceLevel: 'not_interpretable',
      confidenceScore: '0',
      confidenceReason: 'El texto contiene una marca parcial, pero F1 no puede derivar cantidad ni longitud.',
      status: 'needs_review',
      suggestedInterpretation: parsed.explanation,
    };
  }

  if (score >= 0.85 && !parsed.needsReview) {
    return {
      confidenceLevel: 'high',
      confidenceScore: parsed.confidenceScore,
      confidenceReason: 'Patron F1 completo con varilla y longitud explicita o segmentada.',
      status: 'pending',
      suggestedInterpretation: parsed.explanation,
    };
  }

  if (score >= 0.7) {
    return {
      confidenceLevel: 'medium',
      confidenceScore: parsed.confidenceScore,
      confidenceReason: parsed.needsReview
        ? 'Patron F1 reconocido, pero la separacion o convencion requiere revision tecnica.'
        : 'Patron F1 reconocido con convencion compacta.',
      status: parsed.needsReview ? 'needs_review' : 'pending',
      suggestedInterpretation: parsed.explanation,
    };
  }

  return {
    confidenceLevel: 'low',
    confidenceScore: parsed.confidenceScore,
    confidenceReason: 'Lectura parcial; debe revisarse antes de enviarla al takeoff.',
    status: 'needs_review',
    suggestedInterpretation: parsed.explanation,
  };
}

function collectMatches(line: string): string[] {
  const matches: { value: string; index: number }[] = [];
  const seen = new Set<string>();

  for (const pattern of CANDIDATE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const value = match[0]?.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      matches.push({ value, index: match.index ?? 0 });
    }
  }

  return matches.sort((a, b) => a.index - b.index).map((match) => match.value);
}

export function detectPdfIntakeCandidates(
  text: string,
  options: PdfIntakeDetectOptions = {},
): readonly PdfIntakeCandidate[] {
  const pageNumber = options.pageNumber ?? 1;
  const lines = text.split(/\r?\n/);
  const candidates: PdfIntakeCandidate[] = [];

  lines.forEach((line, lineIndex) => {
    const matches = collectMatches(line);
    matches.forEach((matchText, matchIndex) => {
      const confidence = confidenceFromParsed(matchText);
      candidates.push({
        id: stableCandidateId(pageNumber, candidates.length, matchText),
        originalText: matchText,
        pageNumber,
        zoneLabel: candidateZone(lineIndex, matchIndex),
        ...confidence,
      });
    });
  });

  return candidates;
}

export function updatePdfIntakeCandidateText(
  candidate: PdfIntakeCandidate,
  nextText: string,
): PdfIntakeCandidate {
  const trimmed = nextText.trim();
  const confidence = confidenceFromParsed(trimmed);
  return {
    ...candidate,
    originalText: trimmed,
    ...confidence,
    status: candidate.status === 'discarded' ? 'discarded' : confidence.status,
  };
}

export function pdfIntakeCandidatesToManualLines(
  candidates: readonly PdfIntakeCandidate[],
  options: { assumedWastePct?: string } = {},
): readonly Omit<ManualLineRecord, 'id'>[] {
  const assumedWastePct = options.assumedWastePct ?? '5';
  return candidates
    .filter((candidate) => candidate.status === 'approved')
    .map((candidate) => ({
      originalDescription: candidate.originalText,
      assumedWastePct,
    }));
}
