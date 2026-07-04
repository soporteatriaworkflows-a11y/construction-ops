import { describe, expect, it } from 'vitest';
import {
  canApprovePdfIntakeCandidate,
  detectPdfIntakeCandidates,
  pdfIntakeCandidatesToManualLines,
  reevaluatePdfIntakeCandidateText,
  type PdfIntakeCandidate,
} from '@/lib/steel/pdf-intake-candidates';
import { computeManualLine } from '@/lib/steel/manual-takeoff';
import { parseSteelDescription } from '@/modules/steel';

function single(text: string): PdfIntakeCandidate {
  const candidates = detectPdfIntakeCandidates(text);
  expect(candidates).toHaveLength(1);
  return candidates[0]!;
}

describe('pdf-intake-candidates (F6A) — deteccion', () => {
  it('detecta patron compacto completo 5#5600 con confianza media (asuncion cm)', () => {
    const candidate = single('5#5600');
    expect(candidate.candidateText).toBe('5#5600');
    expect(candidate.confidenceLevel).toBe('medium');
    expect(candidate.status).toBe('pending');
    expect(candidate.f1Ready).toBe(true);
    expect(candidate.detectedFields).toEqual(expect.arrayContaining(['quantity', 'barNumber', 'length']));
    expect(candidate.missingFields).toEqual([]);
    expect(candidate.suggestedInterpretation).toContain('barras');
  });

  it('detecta estribos 74E#3200 como estribo con varilla y longitud', () => {
    const candidate = single('74E#3200');
    expect(candidate.suggestedInterpretation).toContain('estribos');
    expect(candidate.suggestedInterpretation).toContain('#3');
    expect(candidate.f1Ready).toBe(true);
    expect(candidate.status).toBe('pending');
  });

  it('marca revision cuando hay separacion @ (10#7205 @ 15CM)', () => {
    const candidate = single('10#7205 @ 15CM');
    expect(candidate.confidenceLevel).toBe('medium');
    expect(candidate.status).toBe('needs_review');
    expect(candidate.detectedFields).toContain('spacing');
    expect(candidate.confidenceReason).toContain('revision');
  });

  it('detecta grupos 2X65E#3182 (2 grupos x 65 estribos) via F1', () => {
    const candidate = single('2X65E#3182');
    expect(candidate.f1Ready).toBe(true);
    expect(candidate.status).toBe('pending');
    expect(candidate.suggestedInterpretation).toContain('130 estribos');
    expect(candidate.suggestedInterpretation).toContain('2 grupos');
  });

  it('clasifica #4 L=0.62 como alta confianza', () => {
    const candidate = single('#4 L=0.62');
    expect(candidate.confidenceLevel).toBe('high');
    expect(candidate.status).toBe('pending');
    expect(candidate.f1Ready).toBe(true);
  });

  it('normaliza lenguaje natural "240 varillas #4 de 62 cm" con verificacion ida y vuelta', () => {
    const candidate = single('240 varillas #4 de 62 cm');
    expect(candidate.candidateText).toBe('240#462');
    expect(candidate.evidence.originalText).toContain('240 varillas #4 de 62 cm');
    expect(candidate.confidenceLevel).toBe('medium');
    expect(candidate.status).toBe('pending');
    expect(candidate.f1Ready).toBe(true);
    expect(candidate.suggestedInterpretation).toContain('240');
    expect(candidate.suggestedInterpretation).toContain('verificado ida y vuelta');
  });

  it('suma segmentos 15 + 35 + 15 = 65 cm y reporta varilla faltante sin inventarla', () => {
    const candidate = single('15 + 35 + 15 = 65 cm');
    expect(candidate.candidateText).toBe('15 + 35 + 15');
    expect(candidate.missingFields).toContain('barNumber');
    expect(candidate.status).toBe('needs_review');
    expect(candidate.f1Ready).toBe(true);
    expect(candidate.suggestedInterpretation).toContain('coincide');
  });

  it('marca contradiccion cuando el total declarado no coincide con los segmentos', () => {
    const candidate = single('15 + 35 + 15 = 70 cm');
    expect(candidate.confidenceLevel).toBe('needs_review');
    expect(candidate.warnings.join(' ')).toContain('no coincide');
  });
});

describe('pdf-intake-candidates (F6A) — parciales sin inventar', () => {
  it('produce candidato parcial para "barras #5": diametro detectado, resto faltante', () => {
    const candidate = single('barras longitudinales #5');
    expect(candidate.detectedFields).toEqual(['barNumber']);
    expect(candidate.missingFields).toEqual(expect.arrayContaining(['quantity', 'length']));
    expect(candidate.confidenceLevel).toBe('needs_review');
    expect(candidate.f1Ready).toBe(false);
    expect(candidate.suggestedInterpretation).toContain('no se inventa');
  });

  it('produce candidato parcial para separacion "Estribos #3 @15" explicando que falta', () => {
    const candidate = single('Estribos #3 @15');
    expect(candidate.detectedFields).toEqual(expect.arrayContaining(['barNumber', 'spacing']));
    expect(candidate.missingFields).toEqual(expect.arrayContaining(['quantity', 'length']));
    expect(candidate.status).toBe('needs_review');
    expect(candidate.f1Ready).toBe(false);
  });

  it('detecta "E#3 cada 15 cm" y "#3 @ 0.15" como especificaciones de separacion', () => {
    expect(single('E#3 cada 15 cm').detectedFields).toContain('spacing');
    expect(single('#3 @ 0.15').detectedFields).toContain('spacing');
  });

  it('produce candidato parcial para "varillas #4 de 62 cm" (longitud sin cantidad)', () => {
    const candidate = single('varillas #4 de 62 cm');
    expect(candidate.detectedFields).toEqual(expect.arrayContaining(['barNumber', 'length']));
    expect(candidate.missingFields).toEqual(['quantity']);
    expect(candidate.f1Ready).toBe(false);
    expect(canApprovePdfIntakeCandidate(candidate).ok).toBe(false);
    expect(candidate.suggestedInterpretation).toContain('no se inventa la cantidad');
  });

  it('advierte posible error OCR cuando la linea trae letras pegadas a numeros (5#56OO)', () => {
    const suspect = single('5#56OO');
    expect(suspect.warnings.join(' ')).toContain('OCR');
    expect(suspect.status).toBe('needs_review');

    const clean = single('5#5600');
    expect(clean.warnings.join(' ')).not.toContain('OCR');
    expect(clean.status).toBe('pending');
  });

  it('detecta malla electrosoldada como baja confianza sin datos completos', () => {
    const candidate = single('malla electrosoldada M-084');
    expect(candidate.confidenceLevel).toBe('low');
    expect(candidate.f1Ready).toBe(false);
    expect(candidate.warnings.join(' ')).toContain('malla');
  });

  it('marca texto ambiguo (@15CM suelto) como no interpretable', () => {
    const candidate = single('separacion indicada @15CM en corte');
    expect(candidate.confidenceLevel).toBe('not_interpretable');
    expect(candidate.status).toBe('needs_review');
    expect(candidate.suggestedInterpretation).toContain('No hay informacion suficiente');
  });

  it('no crea candidatos en texto sin acero', () => {
    expect(detectPdfIntakeCandidates('nota general de estructura, ver detalle en corte tres')).toEqual([]);
    expect(detectPdfIntakeCandidates('')).toEqual([]);
  });
});

describe('pdf-intake-candidates (F6A) — elemento y evidencia', () => {
  it('asocia elemento VC-01 al candidato de la misma linea', () => {
    const candidate = single('VC-01 5#5600');
    expect(candidate.elementLabel).toBe('VC-01');
    expect(candidate.detectedFields).toContain('element');
    expect(candidate.candidateText).toBe('5#5600');
  });

  it('asocia elemento con palabra estructural: PILOTE P-03 y COLUMNA C-02', () => {
    const pilote = single('PILOTE P-03 74E#3200');
    expect(pilote.elementLabel).toBe('PILOTE P-03');

    const columna = single('COLUMNA C-02 #5 L=2.40');
    expect(columna.elementLabel).toBe('COLUMNA C-02');
    expect(columna.confidenceLevel).toBe('high');
  });

  it('conserva evidencia completa: fragmento, linea, indice, pagina y razon', () => {
    const candidates = detectPdfIntakeCandidates('nota previa\nVIGA V-01 5#5600', { pageNumber: 7 });
    const candidate = candidates[0]!;
    expect(candidate.evidence.originalText).toBe('5#5600');
    expect(candidate.evidence.lineText).toBe('VIGA V-01 5#5600');
    expect(candidate.evidence.lineIndex).toBe(1);
    expect(candidate.evidence.pageNumber).toBe(7);
    expect(candidate.evidence.detectionReason.length).toBeGreaterThan(0);
  });

  it('detecta multiples candidatos en un bloque de varias lineas', () => {
    const candidates = detectPdfIntakeCandidates(
      ['VC-01 5#5600', 'Estribos 74E#3200 y refuerzo #4 L=0.62', '240 varillas #4 de 62 cm', 'barras #5'].join('\n'),
    );
    expect(candidates.map((candidate) => candidate.evidence.originalText)).toEqual([
      '5#5600',
      '74E#3200',
      '#4 L=0.62',
      '240 varillas #4 de 62 cm',
      'barras #5',
    ]);
  });

  it('la edicion humana reevalua el texto pero NUNCA altera la evidencia original', () => {
    const candidate = single('Estribos #3 @15');
    const edited = reevaluatePdfIntakeCandidateText(candidate, '30E#3120');
    expect(edited.candidateText).toBe('30E#3120');
    expect(edited.f1Ready).toBe(true);
    expect(edited.evidence).toEqual(candidate.evidence);
    expect(edited.evidence.originalText).toBe('Estribos #3 @15');
  });
});

describe('pdf-intake-candidates (F6A) — aprobacion y conversion a F3', () => {
  it('bloquea aprobar candidatos no convertibles o no interpretables', () => {
    const partial = single('barras #5');
    expect(canApprovePdfIntakeCandidate(partial).ok).toBe(false);
    expect(canApprovePdfIntakeCandidate(partial).reason).toContain('Faltan datos');

    const orphan = single('@15CM');
    expect(canApprovePdfIntakeCandidate(orphan).ok).toBe(false);

    const complete = single('5#5600');
    expect(canApprovePdfIntakeCandidate(complete).ok).toBe(true);
  });

  it('convierte SOLO candidatos aprobados a input de linea manual F3', () => {
    const candidates = detectPdfIntakeCandidates('5#5600\n74E#3200\nbarras #5').map((candidate, index) => ({
      ...candidate,
      status: index === 0 ? ('approved' as const) : candidate.status,
    }));

    const lines = pdfIntakeCandidatesToManualLines(candidates, { assumedWastePct: '7' });
    expect(lines).toEqual([{ originalDescription: '5#5600', assumedWastePct: '7' }]);

    const computed = computeManualLine({ id: 'from-pdf', ...lines[0]! });
    expect(computed.barNumber).toBe(5);
    expect(Number(computed.calculated.totalMl)).toBeGreaterThan(0);
  });

  it('no convierte un candidato parcial aunque se fuerce el estado approved', () => {
    const partial = { ...single('barras #5'), status: 'approved' as const };
    expect(pdfIntakeCandidatesToManualLines([partial])).toEqual([]);
  });

  it('F6A no calcula cantidades: los candidatos no traen ml/kg/costo', () => {
    const candidate = single('5#5600') as unknown as Record<string, unknown>;
    for (const forbidden of ['totalMl', 'totalKg', 'estimatedCost', 'commercialUnits', 'calculated']) {
      expect(candidate).not.toHaveProperty(forbidden);
    }
    const line = pdfIntakeCandidatesToManualLines([{ ...single('5#5600'), status: 'approved' }])[0]!;
    expect(Object.keys(line).sort()).toEqual(['assumedWastePct', 'originalDescription']);
  });

  it('no rompe el parser F1 existente para los patrones base', () => {
    expect(parseSteelDescription('5#5600').steelFamily).toBe('rebar');
    expect(parseSteelDescription('74E#3200').steelFamily).toBe('rebar');
    expect(parseSteelDescription('#4 L=0.62').steelFamily).toBe('rebar');
    expect(parseSteelDescription('15 + 35 + 15').steelFamily).toBe('rebar');
    expect(parseSteelDescription('texto sin acero').steelFamily).toBe('other');
  });
});
