/**
 * title-block-noise.test.ts — Ruido de rótulo/metadato (F7.1 A) y registro
 * de elementos reforzado (F7.1 B).
 *
 * Casos reales reportados por la usuaria:
 * - "VC-7 ING. MARIO SANTACRUZ CASTELLANOS" (nombre del plano + responsable)
 * - "VC-2 VC-(50x60) CALLE 14 OESTE ENTRE CARRERAS 55 Y 56" (nombre + sección + dirección)
 */
import { describe, expect, it } from 'vitest';
import { classifyTitleBlockNoise, TITLE_BLOCK_NOISE_REASON } from '@/lib/steel/drawing-page-regions';
import { extractElementMentions, extractSectionSpecs } from '@/lib/steel/drawing-element-registry';
import {
  analyzeStructuralDrawings,
  penalizeTitleBlockCandidates,
  technicalElementKeysOf,
} from '@/lib/steel/structural-drawing-analysis';
import { detectPdfIntakeCandidates } from '@/lib/steel/pdf-intake-candidates';

const NOISE_LINE_ING = 'VC-7 ING. MARIO SANTACRUZ CASTELLANOS';
const NOISE_LINE_ADDRESS = 'VC-2 VC-(50x60) CALLE 14 OESTE ENTRE CARRERAS 55 Y 56';

describe('classifyTitleBlockNoise (A)', () => {
  it('clasifica responsables y direcciones como rotulo con la frase canonica', () => {
    const ing = classifyTitleBlockNoise(NOISE_LINE_ING);
    expect(ing.noise).toBe(true);
    expect(ing.reason).toContain(TITLE_BLOCK_NOISE_REASON);

    const address = classifyTitleBlockNoise(NOISE_LINE_ADDRESS);
    expect(address.noise).toBe(true);
    expect(address.reason).toContain(TITLE_BLOCK_NOISE_REASON);
  });

  it('no clasifica lineas tecnicas como ruido', () => {
    expect(classifyTitleBlockNoise('VC-2 5#5600 E#3 @15').noise).toBe(false);
    expect(classifyTitleBlockNoise('DESPIECE VIGAS DE CIMENTACION').noise).toBe(false);
    expect(classifyTitleBlockNoise('CUADRO DE ZAPATAS').noise).toBe(false);
  });
});

describe('extraccion de elementos con lineas de rotulo (B)', () => {
  it('"VC-2 VC-(50x60)" produce elemento VC-2 con seccion 50x60, no un VC-50', () => {
    const mentions = extractElementMentions(NOISE_LINE_ADDRESS);
    const keys = mentions.map((m) => m.elementKey);
    expect(keys).toContain('VC-2');
    expect(keys).not.toContain('VC-50');
    expect(keys.every((key) => !/^(CRA|CLL|CALLE|CARRERA)/.test(key))).toBe(true);

    const sections = extractSectionSpecs(NOISE_LINE_ADDRESS);
    expect(sections.some((s) => s.section === '50x60' && s.prefix === 'VC')).toBe(true);
  });

  it('direcciones y responsables NO crean elementos (sin contaminar elementKey)', () => {
    expect(extractElementMentions('ING. MARIO SANTACRUZ CASTELLANOS')).toHaveLength(0);
    expect(extractElementMentions('CALLE 14 OESTE ENTRE CARRERAS 55 Y 56')).toHaveLength(0);
    expect(extractElementMentions('CRA. 55 # 14-30 BARRIO CENTRO')).toHaveLength(0);
    expect(extractElementMentions('TEL 315 555 5555 NIT 900123456')).toHaveLength(0);
  });

  it('VC-2 SOLO en rotulo ⇒ requiere_revision con la frase canonica y hallazgo title_block_noise', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'vigas.pdf',
        pages: [{ pageNumber: 1, included: true, nativeText: NOISE_LINE_ADDRESS }],
      },
    ]);
    const record = analysis.registry.find((r) => r.elementKey === 'VC-2');
    expect(record).toBeDefined();
    expect(record!.suspectedTitleBlockOnly).toBe(true);
    expect(record!.reviewStatus).toBe('requiere_revision');
    expect(record!.reviewStatusReason).toContain(TITLE_BLOCK_NOISE_REASON);
    // El hallazgo es visible y NO se emiten faltantes para un probable rótulo.
    expect(analysis.findings.some((f) => f.type === 'title_block_noise' && f.elementKey === 'VC-2')).toBe(true);
    expect(
      analysis.findings.some(
        (f) => (f.type === 'missing_location' || f.type === 'missing_reinforcement') && f.elementKey === 'VC-2',
      ),
    ).toBe(false);
  });

  it('VC-2 en region tecnica SE CONSERVA aunque tambien aparezca en el rotulo', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'vigas.pdf',
        pages: [
          {
            pageNumber: 1,
            included: true,
            nativeText: [NOISE_LINE_ADDRESS, 'DESPIECE', 'VC-2 5#5600 E#3 @15'].join('\n'),
          },
        ],
      },
    ]);
    const record = analysis.registry.find((r) => r.elementKey === 'VC-2');
    expect(record).toBeDefined();
    expect(record!.suspectedTitleBlockOnly).toBe(false);
    expect(record!.sectionSpec).toBe('50x60');
    // La mención de rótulo queda flaggeada pero el elemento no se degrada a ruido.
    expect(record!.sourceMentions.some((m) => m.titleBlockNoise)).toBe(true);
    expect(analysis.findings.some((f) => f.type === 'title_block_noise' && f.elementKey === 'VC-2')).toBe(false);
  });
});

describe('penalizeTitleBlockCandidates (A.2)', () => {
  const noisyLine = 'VC-7 5#5600 ING. MARIO SANTACRUZ';
  const candidates = detectPdfIntakeCandidates(noisyLine);

  it('candidato nacido en linea de rotulo: advertencia con frase canonica + revision + techo de confianza', () => {
    const penalized = penalizeTitleBlockCandidates(candidates);
    const candidate = penalized.find((c) => c.candidateText.includes('5#5600'))!;
    expect(candidate.warnings.some((w) => w.includes(TITLE_BLOCK_NOISE_REASON))).toBe(true);
    expect(candidate.status).toBe('needs_review');
    expect(Number(candidate.confidenceScore)).toBeLessThanOrEqual(0.4);
    expect(candidate.confidenceLevel).not.toBe('high');
  });

  it('NO degrada si el elemento tiene evidencia tecnica en otra parte (solo anota)', () => {
    const original = candidates.find((c) => c.candidateText.includes('5#5600'))!;
    const penalized = penalizeTitleBlockCandidates(candidates, {
      technicalElementKeys: new Set(['VC-7']),
    });
    const candidate = penalized.find((c) => c.candidateText.includes('5#5600'))!;
    expect(candidate.status).toBe(original.status);
    expect(candidate.confidenceScore).toBe(original.confidenceScore);
    expect(candidate.warnings.some((w) => w.includes('se conserva sin penalizar'))).toBe(true);
  });

  it('lineas tecnicas quedan intactas', () => {
    const technical = detectPdfIntakeCandidates('VC-2 5#5600');
    const penalized = penalizeTitleBlockCandidates(technical);
    expect(penalized).toEqual(technical);
  });

  it('technicalElementKeysOf excluye los elementos solo-rotulo', () => {
    const analysis = analyzeStructuralDrawings([
      {
        fileName: 'vigas.pdf',
        pages: [
          { pageNumber: 1, included: true, nativeText: [NOISE_LINE_ING, 'DESPIECE', 'VC-2 5#5600'].join('\n') },
        ],
      },
    ]);
    const keys = technicalElementKeysOf(analysis.registry);
    expect(keys.has('VC-2')).toBe(true);
    expect(keys.has('VC-7')).toBe(false);
  });
});
