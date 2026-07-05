/**
 * drawing-page-regions.test.ts — Clasificación de regiones de página F7A.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSpatialPage,
  spatialPageFromPlainText,
  type SpatialTextItemInput,
} from '@/lib/steel/drawing-spatial-model';
import { classifyPageRegions, regionOfLine } from '@/lib/steel/drawing-page-regions';

/** Página sintética: leyenda arriba-izquierda, cuadro al centro, rotulado abajo-derecha. */
const ITEMS: SpatialTextItemInput[] = [
  // Leyenda (banda superior izquierda)
  { str: 'NOMENCLATURA', x: 40, y: 780, width: 90, height: 12, fontSize: 12 },
  { str: 'Q = MALLA ELECTROSOLDADA', x: 40, y: 760, width: 160, height: 9, fontSize: 9 },
  // Cuadro (centro)
  { str: 'CUADRO DE ZAPATAS', x: 300, y: 700, width: 150, height: 12, fontSize: 12 },
  { str: 'Z-01 1.20x1.20 5#5600', x: 300, y: 680, width: 170, height: 9, fontSize: 9 },
  { str: 'Z-02 1.00x1.00 4#5600', x: 300, y: 660, width: 170, height: 9, fontSize: 9 },
  // Detalle (izquierda media)
  { str: 'DETALLE VC-01', x: 60, y: 500, width: 100, height: 11, fontSize: 11 },
  { str: '74E#3200 @15', x: 60, y: 480, width: 90, height: 9, fontSize: 9 },
  // Llamado suelto
  { str: 'ESTRIBOS #3 @ 20', x: 500, y: 400, width: 110, height: 9, fontSize: 9 },
  // Rotulado (esquina inferior derecha)
  { str: 'PROYECTO ENTRE PATIOS', x: 700, y: 60, width: 140, height: 9, fontSize: 9 },
  { str: 'ESC 1:50 FECHA 2026', x: 700, y: 40, width: 130, height: 9, fontSize: 9 },
];

describe('classifyPageRegions (F7A)', () => {
  const page = buildSpatialPage(ITEMS, { pageNumber: 1, sourceFileName: 'vigas.pdf' });
  const result = classifyPageRegions(page);

  it('detecta leyenda, tabla, detalle, llamado y rotulado', () => {
    const types = result.regions.map((r) => r.regionType);
    expect(types).toContain('legend');
    expect(types).toContain('table');
    expect(types).toContain('detail');
    expect(types).toContain('reinforcement_callout');
    expect(types).toContain('title_block');
  });

  it('la region ancla absorbe las lineas cercanas debajo', () => {
    const table = result.regions.find((r) => r.regionType === 'table')!;
    expect(table.titleText).toBe('CUADRO DE ZAPATAS');
    expect(table.lineIds.length).toBeGreaterThanOrEqual(3); // titulo + 2 filas
    expect(table.reason).toContain('CUADRO DE ZAPATAS');
  });

  it('cada region lleva razon y confianza (transparencia)', () => {
    for (const region of result.regions) {
      expect(region.reason.length).toBeGreaterThan(10);
      expect(['alta', 'media', 'baja']).toContain(region.confidence);
    }
  });

  it('regionOfLine encuentra la region de una linea', () => {
    const legend = result.regions.find((r) => r.regionType === 'legend')!;
    const lineId = legend.lineIds[1]!;
    expect(regionOfLine(result.regions, lineId)?.regionType).toBe('legend');
  });

  it('sin coordenadas degrada a bloques secuenciales con confianza baja y nota', () => {
    const plain = spatialPageFromPlainText(
      ['NOTAS GENERALES', 'concreto 3000 psi', 'CUADRO DE PILOTES', 'P-01 Ø60 8#5900'].join('\n'),
      { pageNumber: 2, method: 'manual' },
    );
    const sequential = classifyPageRegions(plain);
    expect(sequential.note).toContain('sin coordenadas');
    const types = sequential.regions.map((r) => r.regionType);
    expect(types).toContain('notes');
    expect(types).toContain('table');
    for (const region of sequential.regions) {
      expect(region.confidence).toBe('baja');
    }
  });

  it('pagina vacia: sin regiones y con nota honesta', () => {
    const empty = classifyPageRegions(spatialPageFromPlainText('', { pageNumber: 3 }));
    expect(empty.regions).toHaveLength(0);
    expect(empty.note).toBeTruthy();
  });
});
