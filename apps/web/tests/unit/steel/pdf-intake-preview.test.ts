import { describe, expect, it } from 'vitest';
import {
  detectPdfIntakeCandidates,
  pdfIntakeCandidatesToManualLines,
  updatePdfIntakeCandidateText,
} from '@/lib/steel/pdf-intake-preview';
import { computeManualLine } from '@/lib/steel/manual-takeoff';
import { parseSteelDescription } from '@/modules/steel';

describe('pdf-intake-preview (F6A)', () => {
  it('detecta candidatos de acero desde texto pegado de PDF/plano', () => {
    const candidates = detectPdfIntakeCandidates(
      [
        'Zapata Z-1: 5#5600',
        'Estribos 74E#3200 y refuerzo #4 L=0.62',
        'Separacion @15CM indicada en corte',
      ].join('\n'),
      { pageNumber: 3, fileName: 'plano.pdf' },
    );

    expect(candidates.map((candidate) => candidate.originalText)).toEqual([
      '5#5600',
      '74E#3200',
      '#4 L=0.62',
      '@15CM',
    ]);
    expect(candidates.every((candidate) => candidate.pageNumber === 3)).toBe(true);
    expect(candidates.every((candidate) => candidate.zoneLabel.includes('linea'))).toBe(true);
  });

  it('clasifica confianza alta, media, baja/no interpretable sin inventar cantidad', () => {
    const high = detectPdfIntakeCandidates('#4 L=0.62')[0]!;
    expect(high.confidenceLevel).toBe('high');
    expect(high.status).toBe('pending');

    const medium = detectPdfIntakeCandidates('10#7205 @ 15CM')[0]!;
    expect(medium.confidenceLevel).toBe('medium');
    expect(medium.status).toBe('needs_review');
    expect(medium.confidenceReason).toContain('revision');

    const notInterpretable = detectPdfIntakeCandidates('solo separacion @15CM')[0]!;
    expect(notInterpretable.confidenceLevel).toBe('not_interpretable');
    expect(notInterpretable.status).toBe('needs_review');
    expect(notInterpretable.confidenceReason).toContain('no puede derivar cantidad');
  });

  it('no inventa candidatos cuando no hay patrones claros', () => {
    const candidates = detectPdfIntakeCandidates('nota general de estructura sin marcas de acero');
    expect(candidates).toEqual([]);
  });

  it('permite editar un candidato y recalcular interpretacion sugerida', () => {
    const candidate = detectPdfIntakeCandidates('@15CM')[0]!;
    const updated = updatePdfIntakeCandidateText(candidate, '5#5600');

    expect(updated.originalText).toBe('5#5600');
    expect(updated.confidenceLevel).toBe('medium');
    expect(updated.suggestedInterpretation).toContain('barras');
  });

  it('transforma candidatos aprobados a input de linea manual F3', () => {
    const candidates = detectPdfIntakeCandidates('5#5600\n74E#3200').map((candidate, index) => ({
      ...candidate,
      status: index === 0 ? 'approved' as const : 'discarded' as const,
    }));
    const manualLines = pdfIntakeCandidatesToManualLines(candidates, { assumedWastePct: '7' });

    expect(manualLines).toEqual([{ originalDescription: '5#5600', assumedWastePct: '7' }]);
    const computed = computeManualLine({ id: 'from-pdf', ...manualLines[0]! });
    expect(computed.barNumber).toBe(5);
    expect(Number(computed.calculated.totalMl)).toBeGreaterThan(0);
  });

  it('no rompe parser F1 para los patrones base', () => {
    expect(parseSteelDescription('5#5600').steelFamily).toBe('rebar');
    expect(parseSteelDescription('74E#3200').steelFamily).toBe('rebar');
    expect(parseSteelDescription('#4 L=0.62').steelFamily).toBe('rebar');
  });
});
