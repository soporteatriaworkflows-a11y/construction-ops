/**
 * drawing-spatial-model.test.ts — Modelo de texto posicionado F7A.
 *
 * Cubre: conservación de bbox/rotación/fontSize/método, agrupación por
 * renglón coherente con la vista de líneas F6B, fallback honesto sin
 * coordenadas (layout `baja` con razón) y normalización de comparación.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSpatialPage,
  hasUsableLayout,
  normalizeDrawingText,
  spatialPageFromPlainText,
  type SpatialTextItemInput,
} from '@/lib/steel/drawing-spatial-model';

const ITEMS: SpatialTextItemInput[] = [
  { str: 'VC-01', x: 100, y: 500, width: 40, height: 10, fontSize: 10 },
  { str: '5#5600', x: 150, y: 501, width: 50, height: 10, fontSize: 10 },
  { str: 'CUADRO DE ZAPATAS', x: 80, y: 400, width: 140, height: 14, fontSize: 14 },
  { str: 'COTA VERTICAL', x: 30, y: 450, width: 60, height: 8, fontSize: 8, rotation: 90 },
];

describe('buildSpatialPage (F7A)', () => {
  it('conserva bbox, fontSize, rotacion y metodo por token', () => {
    const page = buildSpatialPage(ITEMS, { pageNumber: 3, sourceFileName: 'planta.pdf' });
    const tokens = page.lines.flatMap((line) => line.tokens);
    const vc = tokens.find((t) => t.text === 'VC-01')!;
    expect(vc.bbox).toEqual({ x: 100, y: 500, width: 40, height: 10 });
    expect(vc.fontSize).toBe(10);
    expect(vc.method).toBe('native_text');
    expect(vc.pageNumber).toBe(3);
    expect(vc.sourceFileName).toBe('planta.pdf');
    expect(vc.tokenId).toBeTruthy();
    expect(vc.lineId).toBeTruthy();

    const rotated = tokens.find((t) => t.text === 'COTA VERTICAL')!;
    expect(rotated.rotation).toBe(90);
  });

  it('agrupa por renglon con tolerancia Y (VC-01 y 5#5600 comparten linea)', () => {
    const page = buildSpatialPage(ITEMS, { pageNumber: 1 });
    const line = page.lines.find((l) => l.text.includes('VC-01'))!;
    expect(line.text).toBe('VC-01 5#5600');
    expect(line.tokens).toHaveLength(2);
    expect(line.bbox).toBeDefined();
    // Caja envolvente cubre ambos tokens.
    expect(line.bbox!.x).toBe(100);
    expect(line.bbox!.x + line.bbox!.width).toBeCloseTo(200);
  });

  it('los tokens rotados NO se mezclan con renglones horizontales cercanos', () => {
    const page = buildSpatialPage(
      [
        { str: 'HORIZONTAL', x: 10, y: 100 },
        { str: 'VERTICAL', x: 200, y: 101, rotation: 90 },
      ],
      { pageNumber: 1 },
    );
    expect(page.lines).toHaveLength(2);
  });

  it('layout alta con coordenadas nativas; extent cubre el texto', () => {
    const page = buildSpatialPage(ITEMS, { pageNumber: 1 });
    expect(page.layoutConfidence).toBe('alta');
    expect(hasUsableLayout(page)).toBe(true);
    expect(page.extent).toBeDefined();
  });

  it('fallback de texto plano: sin bbox, layout baja con razon explicita', () => {
    const page = spatialPageFromPlainText('VC-01 5#5600\nNOTAS GENERALES', {
      pageNumber: 2,
      method: 'manual',
    });
    expect(page.lines).toHaveLength(2);
    expect(page.lines[0]!.bbox).toBeUndefined();
    expect(page.lines[0]!.method).toBe('manual');
    expect(page.layoutConfidence).toBe('baja');
    expect(page.layoutConfidenceReason).toContain('sin coordenadas');
    expect(hasUsableLayout(page)).toBe(false);
  });

  it('normaliza variantes de diametro a Ø sin perder el texto original', () => {
    expect(normalizeDrawingText('pilote ø60')).toBe('PILOTE Ø60');
    expect(normalizeDrawingText('PILOTE Φ 60')).toBe('PILOTE Ø 60');
    const page = spatialPageFromPlainText('pilote ø60', { pageNumber: 1 });
    expect(page.lines[0]!.text).toBe('pilote ø60'); // original intacto
    expect(page.lines[0]!.normalizedText).toBe('PILOTE Ø60');
  });
});
