/**
 * pdf-plan-set.test.ts — F6B: paquete de planos fuente (plan set).
 *
 * Caso real: zapatas y vigas de cimentación necesitan VARIOS planos (planta
 * para ubicación por ejes, cuadro para dimensiones/refuerzo, despiece para
 * acero, cortes para recubrimientos). Se verifica que la evidencia se
 * organiza por fuente y elemento SIN inventar relaciones ni cantidades.
 */
import { describe, expect, it } from 'vitest';
import {
  collectElementMentions,
  detectPlanSetCandidates,
  elementGroupKey,
  summarizeElementEvidence,
} from '@/lib/steel/pdf-plan-set';
import { extractElementMentionsFromLine } from '@/lib/steel/pdf-intake-candidates';
import { suggestSourceTypeFromText } from '@/lib/steel/pdf-text-extract';

describe('clasificacion sugerida de fuentes (corregible, nunca impuesta)', () => {
  it('sugiere el tipo por palabras clave del texto', () => {
    expect(suggestSourceTypeFromText('PLANTA DE CIMENTACION ESC 1:50')?.type).toBe('ubicacion_ejes');
    expect(suggestSourceTypeFromText('CUADRO DE ZAPATAS')?.type).toBe('tabla_cuadro');
    expect(suggestSourceTypeFromText('DESPIECE DE VIGAS DE CIMENTACION')?.type).toBe('refuerzo_despiece');
    expect(suggestSourceTypeFromText('DETALLE TIPICO — CORTE A-A')?.type).toBe('detalle_corte');
    expect(suggestSourceTypeFromText('NOTAS GENERALES DE CONSTRUCCION')?.type).toBe('notas');
    expect(suggestSourceTypeFromText('texto cualquiera sin titulo')).toBeUndefined();
  });
});

describe('menciones de elementos por fuente (evidencia, no cantidades)', () => {
  it('extrae todas las menciones de una linea excluyendo EJES de grilla', () => {
    expect(extractElementMentionsFromLine('EJE A-1 VC-01 y PILOTE P-03')).toEqual(['VC-01', 'PILOTE P-03']);
    expect(extractElementMentionsFromLine('EJES B-2 y C-3')).toEqual(['C-3']);
    expect(extractElementMentionsFromLine('nota sin codigos')).toEqual([]);
  });

  it('recoge menciones con archivo/pagina/tipo de fuente', () => {
    const mentions = collectElementMentions(
      [{ pageNumber: 1, text: 'ZAPATA Z-1 en EJE A-1\nVC-01 entre ejes', sourceType: 'ubicacion_ejes' }],
      { fileName: 'planta-cimentacion.pdf' },
    );
    expect(mentions.map((m) => m.elementLabel)).toEqual(['ZAPATA Z-1', 'VC-01']);
    expect(mentions[0]).toMatchObject({
      fileName: 'planta-cimentacion.pdf',
      pageNumber: 1,
      sourceType: 'ubicacion_ejes',
      lineIndex: 0,
    });
  });
});

describe('evidencia multiple por elemento (sin unir planos automaticamente)', () => {
  const planta = {
    fileName: 'planta-cimentacion.pdf',
    pages: [
      {
        pageNumber: 1,
        text: 'PLANTA DE CIMENTACION\nVC-01 entre EJES A-1 y B-1\nZAPATA Z-2 en EJE C-2',
        sourceType: 'ubicacion_ejes' as const,
        included: false, // la planta NO participa en deteccion de acero
      },
    ],
  };
  const despiece = {
    fileName: 'despiece-vigas.pdf',
    pages: [
      {
        pageNumber: 3,
        text: 'DESPIECE VC-01\nVC-01 5#5600\nVC-01 74E#3200',
        sourceType: 'refuerzo_despiece' as const,
        included: true,
      },
    ],
  };

  const result = detectPlanSetCandidates([planta, despiece]);
  const groups = summarizeElementEvidence(result.candidates, result.mentions);

  it('VC-01 acumula evidencia de despiece (acero) y planta (ubicacion) sin fusionar candidatos', () => {
    const vc01 = groups.find((g) => g.elementKey === 'VC-01')!;
    expect(vc01.candidateIds.length).toBe(2); // siguen siendo 2 filas separadas
    expect(vc01.steelSources).toEqual([
      { fileName: 'despiece-vigas.pdf', pageNumber: 3, sourceType: 'refuerzo_despiece' },
    ]);
    expect(vc01.locationSources).toEqual([
      { fileName: 'planta-cimentacion.pdf', pageNumber: 1, sourceType: 'ubicacion_ejes' },
    ]);
    expect(vc01.missingHints).toEqual([]);
  });

  it('elemento solo ubicado (Z-2 en planta) pide fuente de refuerzo', () => {
    const z2 = groups.find((g) => g.elementKey === 'Z-2')!;
    expect(z2.candidateIds).toEqual([]);
    expect(z2.missingHints.join(' ')).toContain('Requiere fuente de refuerzo/despiece');
  });

  it('acero sin ubicacion pide vincular fuente de ubicacion', () => {
    const soloDespiece = detectPlanSetCandidates([despiece]);
    const soloGroups = summarizeElementEvidence(soloDespiece.candidates, soloDespiece.mentions);
    const vc01 = soloGroups.find((g) => g.elementKey === 'VC-01')!;
    expect(vc01.missingHints.join(' ')).toContain('Requiere vincular fuente de ubicacion');
  });

  it('ids de candidatos unicos entre fuentes con paginas repetidas', () => {
    const twoSources = detectPlanSetCandidates([
      { fileName: 'a.pdf', pages: [{ pageNumber: 1, text: '5#5600', included: true }] },
      { fileName: 'b.pdf', pages: [{ pageNumber: 1, text: '5#5600', included: true }] },
    ]);
    expect(twoSources.candidates).toHaveLength(2);
    expect(new Set(twoSources.candidates.map((c) => c.id)).size).toBe(2);
  });

  it('los candidatos conservan tipo de fuente en la evidencia', () => {
    expect(result.candidates.every((c) => c.evidence.sourceType === 'refuerzo_despiece')).toBe(true);
    expect(result.candidates.every((c) => c.evidence.fileName === 'despiece-vigas.pdf')).toBe(true);
  });

  it('las menciones jamas producen cantidades ni candidatos aprobables', () => {
    // La planta menciona VC-01/Z-2 pero NO genera candidatos (included=false y
    // ademas una mencion no es una cantidad).
    expect(result.candidates.every((c) => c.evidence.sourceType !== 'ubicacion_ejes')).toBe(true);
  });
});

describe('agrupacion textual por codigo', () => {
  it('agrupa "VC-01" con "VIGA VC-01" bajo la misma clave', () => {
    expect(elementGroupKey('VC-01')).toBe('VC-01');
    expect(elementGroupKey('VIGA VC-01')).toBe('VC-01');
    expect(elementGroupKey('PILOTE P-03')).toBe('P-03');
  });
});
