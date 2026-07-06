/**
 * dxf-pdf-comparison.test.ts — F8A: comparación DXF ↔ PDF/F7 (tests 15–18).
 *
 * El lado PDF se construye con el análisis F7 REAL sobre texto (mismo camino
 * degradado que usa la UI para texto pegado), y el lado DXF con el motor F8A
 * sobre un fixture sintético. La comparación es opcional: DXF funciona solo.
 */
import { describe, expect, it } from 'vitest';
import { analyzeStructuralDrawings } from '@/lib/steel/structural-drawing-analysis';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import {
  compareDxfWithPdfAnalysis,
  DXF_COMPARISON_STATUS_LABEL,
} from '@/lib/steel/dxf/dxf-pdf-comparison';

function text(value: string, layer: string, x: number, y: number): string {
  return ['0', 'TEXT', '8', layer, '10', String(x), '20', String(y), '1', value].join('\n');
}

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

/** DXF: VC-2 sección 50x60, Z-05 (solo DXF), Z-01. */
const DXF_TEXT = wrapDxf([
  text('VC-2 (50x60)', 'CIM-VIGAS-TEXTO', 40, 52),
  text('Z-05', 'ZAPATAS-TEXTO', 10, 10),
  text('Z-01', 'ZAPATAS-TEXTO', 60, 10),
]);

/** PDF/F7: VC-2 sección 40x60 (conflicto), P-03 (solo PDF), Z-01 (match). */
const PDF_TEXT = ['VIGA DE CIMENTACION VC-2 (40x60)', 'PILOTE P-03 74E#3200', 'ZAPATA Z-01 4#5 L=1.20'].join('\n');

function buildSides() {
  const parse = parseDxfFile(DXF_TEXT);
  if (!parse.ok) throw new Error('fixture DXF inválido');
  const dxf = extractDxfStructure(parse);
  const analysis = analyzeStructuralDrawings(
    [
      {
        fileName: 'plano-pdf-sintetico.pdf',
        pages: [{ pageNumber: 1, included: true, nativeText: PDF_TEXT, method: 'manual' }],
      },
    ],
    [],
  );
  return { dxf, analysis, comparison: compareDxfWithPdfAnalysis(dxf.elements, analysis) };
}

describe('F8A comparación DXF vs PDF/F7', () => {
  const { comparison } = buildSides();

  it('15. match: Z-01 detectado por ambos caminos', () => {
    const entry = comparison.entries.find((e) => e.elementKey === 'Z-01');
    expect(entry?.status === 'match' || entry?.status === 'needs_review').toBe(true);
    expect(entry?.dxf).toBeDefined();
    expect(entry?.pdf).toBeDefined();
  });

  it('16. conflict: VC-2 con sección 50x60 en DXF y 40x60 en PDF', () => {
    const entry = comparison.entries.find((e) => e.elementKey === 'VC-2');
    expect(entry?.status).toBe('conflict');
    expect(entry?.details.join(' ')).toContain('50x60');
    expect(entry?.details.join(' ')).toContain('40x60');
  });

  it('17. dxf_only: Z-05 existe solo en el DXF', () => {
    const entry = comparison.entries.find((e) => e.elementKey === 'Z-05');
    expect(entry?.status).toBe('dxf_only');
    expect(entry?.pdf).toBeUndefined();
  });

  it('18. pdf_only: P-03 existe solo en el PDF', () => {
    const entry = comparison.entries.find((e) => e.elementKey === 'P-03');
    expect(entry?.status).toBe('pdf_only');
    expect(entry?.dxf).toBeUndefined();
  });

  it('el resumen cuadra con las entradas y hay labels para todos los estados', () => {
    const { summary, entries } = comparison;
    expect(
      summary.match + summary.dxfOnly + summary.pdfOnly + summary.conflicts + summary.needsReview,
    ).toBe(entries.length);
    for (const entry of entries) {
      expect(DXF_COMPARISON_STATUS_LABEL[entry.status].length).toBeGreaterThan(0);
    }
  });
});
