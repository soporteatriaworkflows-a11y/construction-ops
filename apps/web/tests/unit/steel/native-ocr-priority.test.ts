/**
 * native-ocr-priority.test.ts — El OCR complementa, no reemplaza (F7.1 D).
 *
 * Sintoma real: con OCR el flujo volvia a menos items utiles que el texto
 * nativo. Reglas: el nativo con alta confianza manda; una variante OCR
 * corrupta del # se descarta con advertencia ESPECIFICA (no banner) y jamas
 * degrada al candidato nativo.
 */
import { describe, expect, it } from 'vitest';
import {
  compareHybridCandidates,
  detectOcrCandidates,
  isOcrSymbolLossVariant,
} from '@/lib/steel/pdf-ocr';
import { detectPdfIntakeCandidates, type PdfIntakeCandidate } from '@/lib/steel/pdf-intake-candidates';

const NATIVE = detectPdfIntakeCandidates('VC-01 5#5600', { pageNumber: 1, fileName: 'plano.pdf' });

/** Candidato OCR sintético con el texto corrupto (el detector real no produce
 *  candidatos desde "545600", pero herramientas/ediciones sí pueden traerlo). */
function corruptedOcrCandidate(text: string): PdfIntakeCandidate {
  const base = NATIVE[0]!;
  return {
    ...base,
    id: `ocr-${text}`,
    candidateText: text,
    evidence: { ...base.evidence, method: 'ocr', originalText: text, lineText: `VC-01 ${text}` },
  };
}

describe('isOcrSymbolLossVariant', () => {
  it('detecta # perdido (55600) y # leido como otro caracter (545600)', () => {
    expect(isOcrSymbolLossVariant('5#5600', '545600')).toBe(true);
    expect(isOcrSymbolLossVariant('5#5600', '55600')).toBe(true);
    expect(isOcrSymbolLossVariant('5#5600', '5#5600')).toBe(false); // idéntico, no corrupto
    expect(isOcrSymbolLossVariant('5#5600', '5#5680')).toBe(false); // lectura DISTINTA (conflicto real)
    expect(isOcrSymbolLossVariant('5#5600', '999999')).toBe(false);
  });
});

describe('compareHybridCandidates con variante corrupta (caso real 5#5600 vs 545600)', () => {
  const result = compareHybridCandidates(NATIVE, [corruptedOcrCandidate('545600')]);

  it('se conserva 5#5600 nativo SIN degradar estado ni confianza', () => {
    const native = result.candidates.find((c) => c.candidateText === '5#5600')!;
    expect(native.status).toBe(NATIVE[0]!.status);
    expect(native.confidenceScore).toBe(NATIVE[0]!.confidenceScore);
    expect(native.confidenceLevel).toBe(NATIVE[0]!.confidenceLevel);
    expect(native.crossCheck).not.toBe('conflict');
  });

  it('la variante corrupta NO entra a la lista y queda contada', () => {
    expect(result.candidates.some((c) => c.candidateText === '545600')).toBe(false);
    expect(result.stats.symbolLossDiscarded).toBe(1);
    expect(result.stats.conflicts).toBe(0);
  });

  it('la advertencia es ESPECIFICA por candidato (menciona ambas lecturas), no un banner generico', () => {
    const native = result.candidates.find((c) => c.candidateText === '5#5600')!;
    const warning = native.warnings.find((w) => w.includes('545600'));
    expect(warning).toBeDefined();
    expect(warning).toContain('5#5600');
    expect(warning).toContain('no se reconstruye');
  });
});

describe('el OCR nunca reduce un candidato nativo confirmado', () => {
  it('lectura identica por OCR ⇒ confirmado, estado y confianza intactos', () => {
    const ocr = detectOcrCandidates([{ pageNumber: 1, ocrText: 'VC-01 5#5600' }], { fileName: 'plano.pdf' });
    const result = compareHybridCandidates(NATIVE, ocr);
    const native = result.candidates.find((c) => c.candidateText === '5#5600')!;
    expect(native.crossCheck).toBe('confirmed_by_ocr');
    expect(native.status).toBe(NATIVE[0]!.status);
    expect(native.confidenceScore).toBe(NATIVE[0]!.confidenceScore);
  });

  it('OCR solo (sin # legible) entra capado a low/needs_review, sin tocar lo nativo', () => {
    const ocr = detectOcrCandidates([{ pageNumber: 2, ocrText: 'barras #5' }]);
    const result = compareHybridCandidates(NATIVE, ocr);
    const soloOcr = result.candidates.find((c) => c.evidence.method === 'ocr')!;
    expect(soloOcr.confidenceLevel === 'low' || soloOcr.confidenceLevel === 'needs_review').toBe(true);
    const native = result.candidates.find((c) => c.candidateText === '5#5600')!;
    expect(native.status).toBe(NATIVE[0]!.status);
  });
});
