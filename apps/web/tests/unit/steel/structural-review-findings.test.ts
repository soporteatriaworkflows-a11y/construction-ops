/**
 * structural-review-findings.test.ts — Motor de hallazgos técnicos F7.
 *
 * Cubre los 10 casos obligatorios del mandato F7:
 *  1. Segmentos 35+150+35=220 vs texto con longitud distinta ⇒ segment_sum_mismatch.
 *  2. Segmentos compatibles con el texto ⇒ sin mismatch.
 *  3. Q sin leyenda ⇒ unresolved_nomenclature.
 *  4. Q en leyenda ⇒ resuelta, sin hallazgo.
 *  5. Elemento con refuerzo pero sin planta/eje ⇒ missing_location.
 *  6. Elemento con eje cercano ⇒ evidencia de ubicación agregada (sin missing_location).
 *  7. Tabla con 16 filas vs 19 menciones ⇒ count_mismatch.
 *  8. Evidencia gráfica insuficiente ⇒ graphic_count_unverified (no inventar).
 *  9. OCR perdió el # (545600 vs 5#5600 nativo) ⇒ ocr_symbol_loss específico.
 * 10. 2x34#7210@15 ⇒ candidato complejo o hallazgo técnico, jamás descarte silencioso.
 */
import { describe, expect, it } from 'vitest';
import {
  checkSegmentSumAgainstCallout,
  compareListedVsDetectedCount,
  detectOcrSymbolLoss,
} from '@/lib/steel/structural-review-findings';
import { analyzeStructuralDrawings } from '@/lib/steel/structural-drawing-analysis';
import { detectPdfIntakeCandidates } from '@/lib/steel/pdf-intake-candidates';

describe('segment_sum_mismatch (casos 1, 2 y 10)', () => {
  it('caso 1: segmentos 35+150+35 = 220 vs "2x34#7210@15" (210 cm) ⇒ mismatch', () => {
    const finding = checkSegmentSumAgainstCallout({
      segments: [35, 150, 35],
      calloutText: '2x34#7210@15',
      elementKey: 'VC-01',
      pageNumber: 3,
    });
    expect(finding?.type).toBe('segment_sum_mismatch');
    expect(finding?.severity).toBe('warning');
    expect(finding?.blockingForApproval).toBe(true);
    expect(finding?.explanation).toContain('220');
    expect(finding?.explanation).toContain('210');
    expect(finding?.explanation).toContain('Revisar detalle VC-01');
    // No inventa el dato final: solo pide revisión.
    expect(finding?.suggestedAction).toContain('Verificar contra el plano');
  });

  it('caso 1b: acepta segmentos como texto "35 - 150 - 35" (cotas del detalle)', () => {
    const finding = checkSegmentSumAgainstCallout({
      segments: '35 - 150 - 35',
      calloutText: '2E#3200',
    });
    expect(finding?.type).toBe('segment_sum_mismatch'); // 220 ≠ 200
  });

  it('caso 2: segmentos 35+150+35 = 220 y texto compatible (220 cm) ⇒ SIN hallazgo', () => {
    const finding = checkSegmentSumAgainstCallout({
      segments: [35, 150, 35],
      calloutText: '2x34#7220@15',
    });
    expect(finding).toBeUndefined();
  });

  it('caso 10: nomenclatura no normalizable ⇒ hallazgo tecnico, no descarte silencioso', () => {
    const finding = checkSegmentSumAgainstCallout({
      segments: [35, 150, 35],
      calloutText: 'SON 12 VRS',
    });
    expect(finding?.type).toBe('complex_notation_unparsed');
    expect(finding?.explanation).toContain('no se pudo normalizar');
    expect(finding?.explanation).toContain('requiere lectura humana');
  });

  it('caso 10b: F6A tampoco descarta "2x34#7210@15" en silencio (candidatos visibles)', () => {
    const candidates = detectPdfIntakeCandidates('VC-01 2x34#7210@15');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.candidateText.toUpperCase().includes('2X34#7210'))).toBe(true);
  });
});

describe('count_mismatch vs graphic_count_unverified (casos 7 y 8)', () => {
  const nineteenZapatas = Array.from({ length: 19 }, (_, i) => `Z-${String(i + 1).padStart(2, '0')}`);

  it('caso 7: 19 zapatas detectadas vs 16 listadas ⇒ count_mismatch con diferencia 3', () => {
    const finding = compareListedVsDetectedCount({
      listedCount: 16,
      listedEvidence: 'Cuadro de zapatas p.2: 16 filas',
      detectedKeys: nineteenZapatas,
      detectionReliable: true,
      kindLabel: 'zapatas',
      pageNumber: 2,
    });
    expect(finding?.type).toBe('count_mismatch');
    expect(finding?.explanation).toContain('19');
    expect(finding?.explanation).toContain('16');
    expect(finding?.explanation).toContain('Diferencia: 3');
    expect(finding?.explanation).toContain('Requiere revision');
    expect(finding?.blockingForApproval).toBe(true);
  });

  it('conteos iguales ⇒ sin hallazgo', () => {
    const finding = compareListedVsDetectedCount({
      listedCount: 19,
      listedEvidence: 'Cuadro p.2: 19 filas',
      detectedKeys: nineteenZapatas,
      detectionReliable: true,
      kindLabel: 'zapatas',
    });
    expect(finding).toBeUndefined();
  });

  it('caso 8: deteccion no confiable ⇒ graphic_count_unverified, no se inventa el desfase', () => {
    const finding = compareListedVsDetectedCount({
      listedCount: 16,
      listedEvidence: 'Cuadro p.2: 16 filas',
      detectedKeys: ['Z-01', 'Z-02'],
      detectionReliable: false,
      unreliableReason: 'solo 2 rotulos legibles de 16 esperados',
      kindLabel: 'zapatas',
    });
    expect(finding?.type).toBe('graphic_count_unverified');
    expect(finding?.explanation).toContain('Conteo grafico no confiable');
    expect(finding?.explanation).toContain('no se afirma ni se niega');
    expect(finding?.blockingForApproval).toBe(false);
  });
});

describe('ocr_symbol_loss (caso 9)', () => {
  it('OCR "545600" donde el nativo dice "5#5600" ⇒ hallazgo especifico por lectura', () => {
    const findings = detectOcrSymbolLoss({
      nativeLines: [{ text: 'VC-01 5#5600' }],
      ocrText: 'VC-01 545600',
      pageNumber: 4,
      sourceFileName: 'vigas.pdf',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe('ocr_symbol_loss');
    expect(findings[0]!.evidence).toEqual(
      expect.arrayContaining(['Texto nativo: "5#5600"', 'Lectura OCR: "545600"']),
    );
    expect(findings[0]!.explanation).toContain('545600');
    expect(findings[0]!.explanation).toContain('5#5600');
    // Específico del candidato, no banner genérico; y nunca reconstruye.
    expect(findings[0]!.suggestedAction).toContain('No se reconstruye automaticamente');
  });

  it('tambien detecta el # simplemente perdido ("55600")', () => {
    const findings = detectOcrSymbolLoss({
      nativeLines: [{ text: '5#5600' }],
      ocrText: '55600',
      pageNumber: 1,
    });
    expect(findings).toHaveLength(1);
  });

  it('OCR coincidente con el nativo ⇒ sin hallazgo', () => {
    const findings = detectOcrSymbolLoss({
      nativeLines: [{ text: 'VC-01 5#5600' }],
      ocrText: 'VC-01 5#5600',
      pageNumber: 1,
    });
    expect(findings).toHaveLength(0);
  });
});

describe('missing_location y nomenclatura via analisis integrado (casos 3, 4, 5 y 6)', () => {
  it('caso 5: VC-EJE-1 con refuerzo pero sin planta/eje cercano ⇒ missing_location', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'despiece.pdf',
        pages: [
          {
            pageNumber: 1,
            included: true,
            sourceType: 'refuerzo_despiece',
            nativeText: 'DESPIECE\nVC-EJE-1 5#5600',
          },
        ],
      },
    ]);
    const finding = analysis.findings.find(
      (f) => f.type === 'missing_location' && f.elementKey === 'VC-EJE-1',
    );
    expect(finding).toBeDefined();
    expect(finding!.explanation).toContain('Ubicacion');
  });

  it('caso 6: VC-EJE-1 con texto de eje cercano ⇒ evidencia de ubicacion, sin missing_location', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'vigas.pdf',
        pages: [
          {
            pageNumber: 1,
            included: true,
            nativeText: 'DESPIECE\nVC-EJE-1 5#5600 ENTRE EJES A Y B',
          },
        ],
      },
    ]);
    const record = analysis.registry.find((r) => r.elementKey === 'VC-EJE-1');
    expect(record).toBeDefined();
    expect(record!.reviewStatus).not.toBe('falta_ubicacion');
    expect(
      analysis.findings.some((f) => f.type === 'missing_location' && f.elementKey === 'VC-EJE-1'),
    ).toBe(false);
  });

  it('caso 3: Q sin leyenda en el plan set ⇒ unresolved_nomenclature', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'plano.pdf',
        pages: [{ pageNumber: 1, included: true, nativeText: 'VC-01 3Q#4 L=2.40' }],
      },
    ]);
    const finding = analysis.findings.find((f) => f.type === 'unresolved_nomenclature');
    expect(finding).toBeDefined();
    expect(finding!.explanation).toContain('"Q"');
    expect(finding!.explanation).toContain('Requiere definicion manual');
  });

  it('caso 4: Q definida en la leyenda ⇒ sin hallazgo de nomenclatura para Q', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'plano.pdf',
        pages: [
          {
            pageNumber: 1,
            included: true,
            nativeText: ['NOMENCLATURA', 'Q = ACERO CORRUGADO FY 4200', 'VC-01 3Q#4 L=2.40'].join('\n'),
          },
        ],
      },
    ]);
    expect(
      analysis.findings.some(
        (f) => f.type === 'unresolved_nomenclature' && f.explanation.includes('"Q"'),
      ),
    ).toBe(false);
    expect(analysis.nomenclature.resolutions.find((r) => r.symbol === 'Q')?.kind).toBe('resolved');
  });
});

describe('propiedades del hallazgo (contrato F7)', () => {
  it('todo hallazgo lleva severidad, evidencia, explicacion, accion, confianza y bloqueo', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'plano.pdf',
        pages: [{ pageNumber: 1, included: true, nativeText: 'VC-01 3Q#4\nDESPIECE\nZ-02 5#5600' }],
      },
    ]);
    expect(analysis.findings.length).toBeGreaterThan(0);
    for (const finding of analysis.findings) {
      expect(finding.id).toMatch(/^f7-/);
      expect(['info', 'warning', 'critical']).toContain(finding.severity);
      expect(finding.explanation.length).toBeGreaterThan(10);
      expect(finding.suggestedAction.length).toBeGreaterThan(10);
      expect(['alta', 'media', 'baja']).toContain(finding.confidence);
      expect(typeof finding.blockingForApproval).toBe('boolean');
    }
  });

  it('los hallazgos se ordenan por severidad (critical → warning → info)', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'plano.pdf',
        pages: [{ pageNumber: 1, included: true, nativeText: 'VC-01 3Q#4 L=2.40\nnota suelta' }],
      },
    ]);
    const order = { critical: 0, warning: 1, info: 2 } as const;
    const severities = analysis.findings.map((f) => order[f.severity]);
    expect([...severities].sort((a, b) => a - b)).toEqual(severities);
  });
});
