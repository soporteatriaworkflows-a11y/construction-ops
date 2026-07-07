/**
 * element-evidence-linking.test.ts — F6E: vinculación de evidencia por elemento.
 *
 * Caso real: VC-01 necesita planta (ubicación por ejes), despiece (refuerzo),
 * corte (sección) y tabla (estribos/repeticiones). Se verifica que el modelo
 * agrupa por código SIN inventar relaciones, marca conflictos sin resolverlos,
 * deriva estados de completitud honestos y hace viajar la evidencia hasta la
 * línea manual F3 (y de ahí al Excel F4A.2) sin calcular nada.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approveElementGroup,
  approvedCandidatesToManualLines,
  buildElementEvidenceLinks,
  canApproveElementGroup,
  candidateReadingMethod,
  manualLineEvidenceFromCandidate,
  markElementGroupNeedsReview,
  type ElementEvidenceLink,
} from '@/lib/steel/element-evidence-linking';
import { detectPdfIntakeCandidates, type PdfIntakeCandidate } from '@/lib/steel/pdf-intake-candidates';
import { collectElementMentions, detectPlanSetCandidates } from '@/lib/steel/pdf-plan-set';
import { compareHybridCandidates, detectPlanSetOcrCandidates } from '@/lib/steel/pdf-ocr';
import { parseStoredManualTakeoffs } from '@/lib/steel/manual-store';
import { buildSteelManualExcelWorkbook } from '@/lib/steel/manual-excel-export';
import { computeManualLines, type ManualTakeoffRecord } from '@/lib/steel/manual-takeoff';

// ---------------------------------------------------------------------------
// Fixtures: plan set típico de cimentación (planta + despiece + corte + tabla)
// ---------------------------------------------------------------------------

const PLANTA = {
  fileName: 'planta-cimentacion.pdf',
  pages: [
    {
      pageNumber: 1,
      text: 'PLANTA DE CIMENTACION\nVC-01 entre EJES A-2 y A-5\nZAPATA Z-01 en EJE C-2',
      sourceType: 'ubicacion_ejes' as const,
      included: false, // la planta no participa en detección de acero
    },
  ],
};

const DESPIECE = {
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

const CORTE = {
  fileName: 'cortes.pdf',
  pages: [
    {
      pageNumber: 2,
      text: 'CORTE A-A\nDETALLE VC-01 seccion 30x40',
      sourceType: 'detalle_corte' as const,
      included: false,
    },
  ],
};

function fullPlanSet() {
  return detectPlanSetCandidates([PLANTA, DESPIECE, CORTE]);
}

function linkFor(links: readonly ElementEvidenceLink[], key: string): ElementEvidenceLink {
  const link = links.find((candidate) => candidate.elementKey === key);
  expect(link, `grupo ${key}`).toBeDefined();
  return link!;
}

describe('agrupación por elemento desde varias fuentes (VC-01)', () => {
  const { candidates, mentions } = fullPlanSet();
  const links = buildElementEvidenceLinks(candidates, mentions);

  it('agrupa VC-01 con evidencia de ubicación, refuerzo y detalle sin fusionar candidatos', () => {
    const vc01 = linkFor(links, 'VC-01');
    expect(vc01.candidateIds).toHaveLength(2); // 5#5600 y 74E#3200 siguen separados
    const kinds = new Set(vc01.evidence.map((item) => item.kind));
    expect(kinds).toContain('ubicacion_ejes');
    expect(kinds).toContain('refuerzo_despiece');
    expect(kinds).toContain('detalle_corte');
    expect(vc01.missing).toEqual([]);
    expect(vc01.status).toBe('listo_para_revision');
  });

  it('la evidencia conserva archivo, página y línea de origen', () => {
    const vc01 = linkFor(links, 'VC-01');
    const steel = vc01.evidence.filter((item) => item.origin === 'candidate');
    expect(steel.every((item) => item.fileName === 'despiece-vigas.pdf')).toBe(true);
    expect(steel.every((item) => item.pageNumber === 3)).toBe(true);
    const location = vc01.evidence.find((item) => item.kind === 'ubicacion_ejes')!;
    expect(location.origin).toBe('mention');
    expect(location.fileName).toBe('planta-cimentacion.pdf');
  });

  it('las menciones no crean candidatos: son contexto, jamás cantidades', () => {
    const z01 = linkFor(links, 'Z-01');
    expect(z01.candidateIds).toEqual([]);
    expect(z01.evidence.every((item) => item.origin === 'mention')).toBe(true);
  });
});

describe('distinción de elementos y no invención de relaciones', () => {
  it('distingue VC-01 de VC-02: candidatos separados por grupo', () => {
    const candidates = detectPdfIntakeCandidates('VC-01 5#5600\nVC-02 4#5450');
    const links = buildElementEvidenceLinks(candidates);
    const vc01 = linkFor(links, 'VC-01');
    const vc02 = linkFor(links, 'VC-02');
    expect(vc01.candidateIds).toHaveLength(1);
    expect(vc02.candidateIds).toHaveLength(1);
    expect(vc01.candidateIds[0]).not.toBe(vc02.candidateIds[0]);
  });

  it('códigos parecidos (VC-1 vs VC-01) se avisan pero NO se fusionan', () => {
    const candidates = detectPdfIntakeCandidates('VC-1 5#5600\nVC-01 4#5450');
    const links = buildElementEvidenceLinks(candidates);
    expect(links.map((link) => link.elementKey).sort()).toEqual(['VC-01', 'VC-1']);
    const vc1 = linkFor(links, 'VC-1');
    const vc01 = linkFor(links, 'VC-01');
    expect(vc1.similarElementKeys).toEqual(['VC-01']);
    expect(vc01.similarElementKeys).toEqual(['VC-1']);
    expect(vc1.candidateIds).toHaveLength(1);
    expect(vc01.candidateIds).toHaveLength(1);
  });

  it('un candidato sin código de elemento no entra a ningún grupo', () => {
    const candidates = detectPdfIntakeCandidates('5#5600');
    expect(candidates[0]!.elementLabel).toBeUndefined();
    expect(buildElementEvidenceLinks(candidates)).toEqual([]);
  });

  it('PILOTE P-03 y COLUMNA C-02 quedan en grupos independientes con etiqueta descriptiva', () => {
    const candidates = detectPdfIntakeCandidates('PILOTE P-03 74E#3200\nCOLUMNA C-02 #5 L=2.40');
    const links = buildElementEvidenceLinks(candidates);
    expect(linkFor(links, 'P-03').elementLabel).toBe('PILOTE P-03');
    expect(linkFor(links, 'C-02').elementLabel).toBe('COLUMNA C-02');
  });
});

describe('estados de completitud honestos', () => {
  it('detecta falta de ubicación cuando solo hay despiece', () => {
    const { candidates, mentions } = detectPlanSetCandidates([DESPIECE]);
    const vc01 = linkFor(buildElementEvidenceLinks(candidates, mentions), 'VC-01');
    expect(vc01.missing).toContain('ubicacion');
    expect(vc01.status).toBe('falta_ubicacion');
  });

  it('detecta falta de refuerzo cuando el elemento solo aparece en la planta', () => {
    const { candidates, mentions } = detectPlanSetCandidates([PLANTA]);
    const z01 = linkFor(buildElementEvidenceLinks(candidates, mentions), 'Z-01');
    expect(z01.missing).toContain('refuerzo');
    expect(z01.status).toBe('falta_refuerzo');
  });

  it('detecta falta de detalle cuando no hay corte ni tabla', () => {
    const { candidates, mentions } = detectPlanSetCandidates([PLANTA, DESPIECE]);
    const vc01 = linkFor(buildElementEvidenceLinks(candidates, mentions), 'VC-01');
    expect(vc01.missing).toEqual(['detalle']);
    expect(vc01.status).toBe('falta_detalle');
  });

  it('candidato parcial (sin cantidad/longitud) deja el grupo en solo_candidato_parcial', () => {
    const candidates = detectPdfIntakeCandidates('VC-07 barras longitudinales #5');
    const vc07 = linkFor(buildElementEvidenceLinks(candidates), 'VC-07');
    expect(vc07.partialCandidateIds).toHaveLength(1);
    expect(vc07.approvableCandidateIds).toEqual([]);
    expect(vc07.status).toBe('solo_candidato_parcial');
    expect(canApproveElementGroup(vc07).ok).toBe(false);
  });

  it('nunca nace un grupo aprobado: aprobar exige acción humana', () => {
    const { candidates, mentions } = fullPlanSet();
    const links = buildElementEvidenceLinks(candidates, mentions);
    expect(links.every((link) => link.status !== 'aprobado_para_takeoff')).toBe(true);
  });
});

describe('conflictos entre fuentes: se marcan, no se resuelven', () => {
  function hybridWithConflict() {
    const native = detectPlanSetCandidates([DESPIECE]);
    // OCR de la misma página lee la longitud distinta (5680 vs 5600).
    const ocr = detectPlanSetOcrCandidates([
      {
        fileName: 'despiece-vigas.pdf',
        pages: [{ pageNumber: 3, ocrText: 'VC-01 5#5680', sourceType: 'refuerzo_despiece' }],
      },
    ]);
    return compareHybridCandidates(native.candidates, ocr);
  }

  it('detecta el conflicto OCR vs texto nativo y bloquea la aprobación del grupo', () => {
    const comparison = hybridWithConflict();
    expect(comparison.stats.conflicts).toBeGreaterThan(0);
    const vc01 = linkFor(buildElementEvidenceLinks(comparison.candidates), 'VC-01');
    expect(vc01.conflicts.length).toBeGreaterThan(0);
    expect(vc01.status).toBe('conflicto_entre_fuentes');
    const approval = canApproveElementGroup(vc01);
    expect(approval.ok).toBe(false);
    expect(approval.reason).toContain('Conflicto entre fuentes');
    // approveElementGroup respeta la compuerta: nada cambia.
    const after = approveElementGroup(vc01, comparison.candidates);
    expect(after.every((candidate) => candidate.status !== 'approved')).toBe(true);
  });

  it('descartar la lectura incorrecta destraba el grupo (decisión humana)', () => {
    const comparison = hybridWithConflict();
    const withoutOcr = comparison.candidates.map((candidate) =>
      candidate.evidence.method === 'ocr' ? { ...candidate, status: 'discarded' as const } : candidate,
    );
    const vc01 = linkFor(buildElementEvidenceLinks(withoutOcr), 'VC-01');
    expect(vc01.conflicts).toEqual([]);
    expect(vc01.status).not.toBe('conflicto_entre_fuentes');
  });

  it('detecta contradicción cruzada nativo vs OCR aun en páginas distintas (misma varilla)', () => {
    const native = detectPdfIntakeCandidates('VC-03 5#5600', {
      pageNumber: 3,
      fileName: 'a.pdf',
      sourceType: 'refuerzo_despiece',
    });
    const ocr = detectPlanSetOcrCandidates([
      { fileName: 'a.pdf', pages: [{ pageNumber: 7, ocrText: 'VC-03 5#5450', sourceType: 'tabla_cuadro' }] },
    ]);
    const vc03 = linkFor(buildElementEvidenceLinks([...native, ...ocr]), 'VC-03');
    expect(vc03.conflicts.length).toBeGreaterThan(0);
    expect(vc03.conflicts[0]!.description).toContain('No se resuelve automaticamente');
  });

  it('dos lecturas iguales por métodos distintos NO son conflicto', () => {
    const native = detectPdfIntakeCandidates('VC-04 5#5600', { fileName: 'a.pdf', pageNumber: 1 });
    const ocr = detectPlanSetOcrCandidates([
      { fileName: 'a.pdf', pages: [{ pageNumber: 2, ocrText: 'VC-04 5#5600' }] },
    ]);
    const vc04 = linkFor(buildElementEvidenceLinks([...native, ...ocr]), 'VC-04');
    expect(vc04.conflicts).toEqual([]);
  });
});

describe('evidencia múltiple por elemento (métodos nativo/OCR/manual)', () => {
  it('un grupo puede mostrar evidencia de los tres métodos a la vez', () => {
    const native = detectPdfIntakeCandidates('VC-05 5#5600', {
      fileName: 'despiece.pdf',
      pageNumber: 3,
      sourceType: 'refuerzo_despiece',
    });
    const ocr = detectPlanSetOcrCandidates([
      { fileName: 'tabla.pdf', pages: [{ pageNumber: 4, ocrText: 'VC-05 5#5600', sourceType: 'tabla_cuadro' }] },
    ]);
    const pasted = detectPdfIntakeCandidates('VC-05 74E#3200'); // texto pegado, sin archivo
    const mentions = collectElementMentions(
      [{ pageNumber: 1, text: 'VC-05 entre EJES B-1 y B-4', sourceType: 'ubicacion_ejes' }],
      { fileName: 'planta.pdf' },
    );

    const vc05 = linkFor(buildElementEvidenceLinks([...native, ...ocr, ...pasted], mentions), 'VC-05');
    const methods = new Set(vc05.evidence.map((item) => item.method).filter(Boolean));
    expect(methods).toEqual(new Set(['native_text', 'ocr', 'manual']));
    const kinds = new Set(vc05.evidence.map((item) => item.kind));
    expect(kinds).toContain('ubicacion_ejes');
    expect(kinds).toContain('refuerzo_despiece');
    expect(kinds).toContain('tabla_cuadro');
    expect(kinds).toContain('sin_clasificar'); // el texto pegado no tiene tipo de fuente
  });

  it('candidateReadingMethod: sin archivo es manual; con archivo respeta el método', () => {
    const pasted = detectPdfIntakeCandidates('VC-05 5#5600')[0]!;
    expect(candidateReadingMethod(pasted)).toBe('manual');
    const fromFile = detectPdfIntakeCandidates('VC-05 5#5600', { fileName: 'a.pdf' })[0]!;
    expect(candidateReadingMethod(fromFile)).toBe('native_text');
  });
});

describe('acciones de grupo (humanas, nunca automáticas)', () => {
  it('aprobar grupo aprueba SOLO los candidatos convertibles; el parcial queda intacto', () => {
    const candidates = detectPdfIntakeCandidates('VC-06 5#5600\nVC-06 barras longitudinales #5');
    const links = buildElementEvidenceLinks(candidates);
    const vc06 = linkFor(links, 'VC-06');
    expect(vc06.approvableCandidateIds).toHaveLength(1);
    expect(vc06.partialCandidateIds).toHaveLength(1);

    const after = approveElementGroup(vc06, candidates);
    const approved = after.filter((candidate) => candidate.status === 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0]!.f1Ready).toBe(true);
    const partial = after.find((candidate) => !candidate.f1Ready)!;
    expect(partial.status).not.toBe('approved');

    // El grupo NO queda "aprobado para takeoff" mientras exista el parcial.
    const relinked = linkFor(buildElementEvidenceLinks(after), 'VC-06');
    expect(relinked.status).not.toBe('aprobado_para_takeoff');
  });

  it('el grupo queda aprobado_para_takeoff cuando todos los vigentes están aprobados', () => {
    const candidates = detectPdfIntakeCandidates('VC-06 5#5600\nVC-06 74E#3200');
    const vc06 = linkFor(buildElementEvidenceLinks(candidates), 'VC-06');
    const after = approveElementGroup(vc06, candidates);
    const relinked = linkFor(buildElementEvidenceLinks(after), 'VC-06');
    expect(relinked.status).toBe('aprobado_para_takeoff');
    expect(canApproveElementGroup(relinked)).toEqual({
      ok: false,
      reason: 'No queda nada por aprobar en este grupo.',
    });
  });

  it('marcar requiere revisión afecta solo a los vigentes del grupo', () => {
    const candidates = detectPdfIntakeCandidates('VC-06 5#5600\nVC-08 74E#3200');
    const links = buildElementEvidenceLinks(candidates);
    const vc06 = linkFor(links, 'VC-06');
    const after = markElementGroupNeedsReview(vc06, candidates);
    expect(after.find((candidate) => candidate.elementLabel === 'VC-06')!.status).toBe('needs_review');
    expect(after.find((candidate) => candidate.elementLabel === 'VC-08')!.status).toBe('pending');
  });
});

describe('la evidencia viaja a la línea manual F3 y al Excel F4A.2', () => {
  function approvedLine() {
    const { candidates } = detectPlanSetCandidates([DESPIECE]);
    const approved = candidates.map((candidate) =>
      candidate.candidateText === '5#5600' ? { ...candidate, status: 'approved' as const } : candidate,
    );
    const lines = approvedCandidatesToManualLines(approved, { assumedWastePct: '7' });
    expect(lines).toHaveLength(1);
    return lines[0]!;
  }

  it('la línea aprobada lleva fuente, página, tipo, método, confianza, fragmento y observación', () => {
    const line = approvedLine();
    expect(line.originalDescription).toBe('5#5600');
    expect(line.assumedWastePct).toBe('7');
    expect(line.evidence).toMatchObject({
      sourceFileName: 'despiece-vigas.pdf',
      pageNumber: 3,
      sourceType: 'refuerzo_despiece',
      readingMethod: 'native_text',
      originalFragment: '5#5600',
    });
    expect(Number(line.evidence!.confidence)).toBeGreaterThan(0);
    expect(line.evidence!.observation).toContain('VC-01');
  });

  it('no se convierte un candidato parcial aunque se fuerce el estado approved', () => {
    const partial = detectPdfIntakeCandidates('VC-09 barras longitudinales #5')[0]!;
    expect(
      approvedCandidatesToManualLines([{ ...partial, status: 'approved' as const }]),
    ).toEqual([]);
  });

  it('la evidencia sobrevive el ciclo de persistencia local (sin DB)', () => {
    const line = approvedLine();
    const takeoff: ManualTakeoffRecord = {
      id: 'mtk-f6e-test',
      name: 'Takeoff F6E',
      projectName: 'Demo',
      scopeLabel: 'Cimentacion',
      status: 'draft',
      createdAt: '2026-07-05',
      lines: [{ id: 'l1', ...line }],
    };
    const roundTrip = parseStoredManualTakeoffs(JSON.stringify([takeoff]));
    expect(roundTrip[0]!.lines[0]!.evidence).toMatchObject({
      sourceFileName: 'despiece-vigas.pdf',
      pageNumber: 3,
      sourceType: 'refuerzo_despiece',
      readingMethod: 'native_text',
    });
  });

  it('el export Excel (EVIDENCIAS) recoge la evidencia de la línea sin puentes extra', () => {
    const line = approvedLine();
    const takeoff: ManualTakeoffRecord = {
      id: 'mtk-f6e-excel',
      name: 'Takeoff F6E Excel',
      projectName: 'Demo',
      scopeLabel: 'Cimentacion',
      status: 'draft',
      createdAt: '2026-07-05',
      lines: [{ id: 'l1', ...line }],
    };
    const wb = buildSteelManualExcelWorkbook({
      takeoff,
      lines: computeManualLines(takeoff.lines),
      generatedAt: new Date('2026-07-05T00:00:00Z'),
    });
    const ws = wb.getWorksheet('EVIDENCIAS')!;
    const row = ws.getRow(2);
    const values = [];
    for (let col = 1; col <= 11; col += 1) values.push(String(row.getCell(col).value ?? ''));
    expect(values.join(' | ')).toContain('despiece-vigas.pdf');
    expect(values.join(' | ')).toContain('refuerzo_despiece');
    // F8D: el método de lectura se muestra en español en el Excel.
    expect(values.join(' | ')).toContain('texto nativo PDF');
    expect(values.join(' | ')).toContain('5#5600');
  });

  it('manualLineEvidenceFromCandidate anota la confirmación OCR cuando existe', () => {
    const candidate = {
      ...detectPdfIntakeCandidates('VC-01 5#5600', { fileName: 'a.pdf' })[0]!,
      crossCheck: 'confirmed_by_ocr' as const,
    };
    expect(manualLineEvidenceFromCandidate(candidate).observation).toContain('Confirmado por OCR');
  });
});

describe('F6E no calcula y no toca DB/Supabase/storage/servidor', () => {
  const modelSource = readFileSync(
    path.join(process.cwd(), 'lib', 'steel', 'element-evidence-linking.ts'),
    'utf8',
  );
  const panelSource = readFileSync(
    path.join(
      process.cwd(),
      'app',
      '(dashboard)',
      'steel',
      'takeoffs',
      '_components',
      'element-evidence-panel.tsx',
    ),
    'utf8',
  );

  it('el modelo no importa la calculadora ni produce ml/kg/costo', () => {
    expect(modelSource).not.toMatch(/calculateSteelLine|optimizeSteelCutsFFD|computeManualTotals/);
    expect(modelSource).not.toMatch(/totalMl|totalKg|estimatedCost|commercialUnits/);

    const candidates = detectPdfIntakeCandidates('VC-01 5#5600');
    const link = buildElementEvidenceLinks(candidates)[0]! as unknown as Record<string, unknown>;
    for (const forbidden of ['totalMl', 'totalKg', 'estimatedCost', 'calculated', 'subtotal']) {
      expect(link).not.toHaveProperty(forbidden);
    }
    const line = approvedCandidatesToManualLines([
      { ...candidates[0]!, status: 'approved' as const },
    ])[0]! as unknown as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual(['assumedWastePct', 'evidence', 'originalDescription']);
  });

  it('modelo y panel no importan DB/Supabase/storage/server ni hacen red', () => {
    for (const source of [modelSource, panelSource]) {
      const importLines = source
        .split(/\r?\n/)
        .filter((line) => /^\s*import\b|\bfrom\s+['"]/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/supabase|@\/server\/|drizzle|storage/i);
      }
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
    }
  });

  it('la sección de intake cablea el panel "Evidencia por elemento" con acciones de grupo', () => {
    const intake = readFileSync(
      path.join(
        process.cwd(),
        'app',
        '(dashboard)',
        'steel',
        'takeoffs',
        '_components',
        'manual-pdf-intake-section.tsx',
      ),
      'utf8',
    );
    expect(intake).toContain('<ElementEvidencePanel');
    expect(intake).toContain('approveElementGroup');
    expect(intake).toContain('markElementGroupNeedsReview');
    expect(intake).toContain('approvedCandidatesToManualLines');
    expect(panelSource).toContain('Evidencia por elemento');
    expect(panelSource).toContain('Aprobar grupo');
    expect(panelSource).toContain('Marcar requiere revision');
    expect(panelSource).toContain('Descartar');
  });
});
