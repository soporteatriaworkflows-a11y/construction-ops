/**
 * pdf-ocr.test.ts — F6C: estación híbrida nativo+OCR.
 *
 * Todo en Node, sin tesseract ni DOM: cobertura por página, techo de
 * confianza OCR, comparación nativo↔OCR (dedupe/confirmación/conflicto) y
 * reglas anti-alucinación. El borde browser (render + tesseract) queda fuera
 * y su fallback se verifica por cableado estático.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capOcrCandidate,
  classifyPageCoverage,
  compareHybridCandidates,
  detectOcrCandidates,
  detectPlanSetOcrCandidates,
  hasLostHashSuspicion,
  hasOcrCharSuspicion,
  HIDDEN_TEXT_WARNING,
  OCR_CHAR_SUSPICION_WARNING,
  OCR_CONFLICT_WARNING,
  OCR_LOST_HASH_WARNING,
  OCR_REVIEW_WARNING,
  OCR_UNAVAILABLE_MESSAGE,
} from '@/lib/steel/pdf-ocr';
import { detectPdfIntakeCandidates } from '@/lib/steel/pdf-intake-candidates';
import { shapeExtractedPage } from '@/lib/steel/pdf-text-extract';

describe('diagnostico de cobertura por pagina', () => {
  it('pagina con texto nativo bueno => buena, con lineas y candidatos contados', () => {
    const longText = Array.from({ length: 12 }, (_, i) => `VC-0${i % 9} 5#5600 refuerzo longitudinal de viga`).join('\n');
    const coverage = classifyPageCoverage(shapeExtractedPage(1, longText));
    expect(coverage.level).toBe('buena');
    expect(coverage.nativeLineCount).toBe(12);
    expect(coverage.nativeCandidateCount).toBeGreaterThan(0);
    expect(coverage.suspectedHiddenText).toBe(false);
  });

  it('pagina con texto nativo pobre y mucha geometria => advierte texto oculto (SHX AutoCAD)', () => {
    const coverage = classifyPageCoverage(shapeExtractedPage(2, 'E-02'), { drawingOpCount: 900 });
    expect(coverage.level).toBe('pobre');
    expect(coverage.suspectedHiddenText).toBe(true);
    expect(HIDDEN_TEXT_WARNING).toContain('convertidos a geometria');
    expect(HIDDEN_TEXT_WARNING).toContain('OCR asistido');
  });

  it('pagina sin texto => sin_texto', () => {
    expect(classifyPageCoverage(shapeExtractedPage(3, '')).level).toBe('sin_texto');
  });
});

describe('techo de confianza OCR (anti-alucinacion F6-S9)', () => {
  it('un patron perfecto leido por OCR nunca supera confianza baja ni queda pending', () => {
    const [candidate] = detectOcrCandidates([{ pageNumber: 1, ocrText: '#4 L=0.62' }]);
    expect(candidate!.evidence.method).toBe('ocr');
    expect(candidate!.confidenceLevel).toBe('low');
    expect(Number(candidate!.confidenceScore)).toBeLessThanOrEqual(0.5);
    expect(candidate!.status).toBe('needs_review');
    expect(candidate!.warnings.join(' ')).toContain('revisa contra el plano');
  });

  it('OCR con campos faltantes sigue siendo parcial: no se inventa nada', () => {
    const [candidate] = detectOcrCandidates([{ pageNumber: 1, ocrText: 'barras #5' }]);
    expect(candidate!.confidenceLevel).toBe('needs_review');
    expect(candidate!.missingFields).toEqual(expect.arrayContaining(['quantity', 'length']));
    expect(candidate!.f1Ready).toBe(false);
  });

  it('sospecha de caracteres O/0, I/1, S/5 en la linea OCR agrega advertencia especifica', () => {
    expect(hasOcrCharSuspicion('74E#3S0')).toBe(true);
    expect(hasOcrCharSuspicion('5#56OO')).toBe(true);
    expect(hasOcrCharSuspicion('74E#320')).toBe(false);

    const [suspect] = detectOcrCandidates([{ pageNumber: 1, ocrText: '5#56OO' }]);
    expect(suspect!.warnings).toContain(OCR_CHAR_SUSPICION_WARNING);
    expect(suspect!.warnings).toContain(OCR_REVIEW_WARNING);
  });

  it('detecta la huella del # perdido (caso real: 5#5600 => 545600, 74E#3200 => 74E:+3200) sin reconstruirlo', () => {
    expect(hasLostHashSuspicion('VC-01 545600')).toBe(true);
    expect(hasLostHashSuspicion('VC-01 74E:+3200')).toBe(true);
    expect(hasLostHashSuspicion('VC-01 5#5600')).toBe(false); // el # llego bien
    expect(hasLostHashSuspicion('nota general sin numeros largos')).toBe(false);
    expect(OCR_LOST_HASH_WARNING).toContain('No se reconstruye automaticamente');
    // Y la deteccion sobre ese texto corrupto NO inventa candidatos con #:
    const candidates = detectOcrCandidates([{ pageNumber: 1, ocrText: 'VC-01 545600' }]);
    expect(candidates.every((c) => !c.candidateText.includes('#'))).toBe(true);
  });

  it('capOcrCandidate no revive candidatos descartados ni sube niveles inferiores', () => {
    const base = detectPdfIntakeCandidates('#4 L=0.62', { method: 'ocr' })[0]!;
    const discarded = capOcrCandidate({ ...base, status: 'discarded' });
    expect(discarded.status).toBe('discarded');
    const notInterpretable = capOcrCandidate({ ...base, confidenceLevel: 'not_interpretable' });
    expect(notInterpretable.confidenceLevel).toBe('not_interpretable');
  });
});

describe('comparacion nativo vs OCR (sin fusionar datos)', () => {
  const nativos = [...detectPdfIntakeCandidates('VC-01 5#5600\n74E#3200', { pageNumber: 1, fileName: 'plano.pdf' })];

  it('lectura identica por ambos metodos => confirmado, se conserva UNA fila (la nativa)', () => {
    const ocr = detectOcrCandidates([{ pageNumber: 1, ocrText: 'VC-01 5#5600' }], { fileName: 'plano.pdf' });
    const result = compareHybridCandidates(nativos, ocr);
    expect(result.stats.confirmedByBoth).toBe(1);
    expect(result.candidates.filter((c) => c.candidateText === '5#5600')).toHaveLength(1);
    const confirmed = result.candidates.find((c) => c.candidateText === '5#5600')!;
    expect(confirmed.evidence.method).toBe('native_text');
    expect(confirmed.crossCheck).toBe('confirmed_by_ocr');
    expect(confirmed.confidenceReason).toContain('Confirmado tambien por OCR');
  });

  it('candidato solo OCR entra capado; candidato solo nativo queda contado', () => {
    const ocr = detectOcrCandidates([{ pageNumber: 2, ocrText: '10#7205 @ 15CM' }]);
    const result = compareHybridCandidates(nativos, ocr);
    expect(result.stats.ocrOnly).toBe(1);
    expect(result.stats.nativeOnly).toBe(2);
    const soloOcr = result.candidates.find((c) => c.evidence.method === 'ocr')!;
    expect(soloOcr.confidenceLevel === 'low' || soloOcr.confidenceLevel === 'needs_review').toBe(true);
  });

  it('mismo elemento y varilla con texto distinto => CONFLICTO marcado en ambos', () => {
    const ocr = detectOcrCandidates([{ pageNumber: 1, ocrText: 'VC-01 5#5680' }], { fileName: 'plano.pdf' });
    const result = compareHybridCandidates(nativos, ocr);
    expect(result.stats.conflicts).toBe(1);
    const conflicted = result.candidates.filter((c) => c.crossCheck === 'conflict');
    expect(conflicted).toHaveLength(2);
    expect(conflicted.every((c) => c.warnings.includes(OCR_CONFLICT_WARNING))).toBe(true);
    const native = conflicted.find((c) => c.evidence.method === 'native_text')!;
    expect(native.status).toBe('needs_review');
  });

  it('la comparacion no calcula: ningun candidato trae ml/kg/costos', () => {
    const ocr = detectOcrCandidates([{ pageNumber: 1, ocrText: 'VC-01 5#5680\n240 varillas #4 de 62 cm' }]);
    const result = compareHybridCandidates(nativos, ocr);
    for (const candidate of result.candidates as unknown as Record<string, unknown>[]) {
      for (const forbidden of ['totalMl', 'totalKg', 'estimatedCost', 'calculated']) {
        expect(candidate).not.toHaveProperty(forbidden);
      }
    }
  });

  it('ids OCR unicos entre fuentes con paginas repetidas', () => {
    const candidates = detectPlanSetOcrCandidates([
      { fileName: 'a.pdf', pages: [{ pageNumber: 1, ocrText: '5#5600' }] },
      { fileName: 'b.pdf', pages: [{ pageNumber: 1, ocrText: '5#5600' }] },
    ]);
    expect(new Set(candidates.map((c) => c.id)).size).toBe(2);
  });
});

describe('aislamiento y fallback (analisis estatico)', () => {
  const libDir = path.join(process.cwd(), 'lib', 'steel');
  const pure = readFileSync(path.join(libDir, 'pdf-ocr.ts'), 'utf8');
  const client = readFileSync(path.join(libDir, 'pdf-ocr-client.ts'), 'utf8');
  const section = readFileSync(
    path.join(process.cwd(), 'app', '(dashboard)', 'steel', 'takeoffs', '_components', 'manual-pdf-intake-section.tsx'),
    'utf8',
  );

  it('sin Supabase/DB/storage/subida en los modulos F6C (codigo, no comentarios)', () => {
    for (const source of [pure, client, section]) {
      const codeLines = source.split(/\r?\n/).filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
      for (const line of codeLines) {
        expect(line).not.toMatch(/supabase|@\/server\/|FormData|fetch\s*\(/i);
      }
    }
  });

  it('tesseract solo entra por import dinamico en el borde cliente', () => {
    expect(client).toContain("await import('tesseract.js')");
    expect(pure).not.toMatch(/from ['"]tesseract|import\(['"]tesseract/);
    expect(section).not.toMatch(/from ['"]tesseract/);
  });

  it('fallback si OCR no esta disponible: mensaje cableado en la UI', () => {
    expect(OCR_UNAVAILABLE_MESSAGE).toContain('Continua con el texto nativo');
    expect(section).toContain('OCR_UNAVAILABLE_MESSAGE');
    expect(section).toContain("ocrStatus: 'error'");
  });

  it('la UI conserva el copy obligatorio F6C para PDFs de AutoCAD', () => {
    expect(section).toContain('El PDF tiene texto seleccionable parcial.');
    expect(section).toContain('El OCR puede confundirse');
    expect(section).toContain('revisa antes de aprobar');
    expect(section).toContain('No se interpretan cotas visuales ni escala en esta fase');
    expect(section).toContain('OCR asistido por pagina');
    expect(section).toContain('Conflictos nativo/OCR');
  });
});
