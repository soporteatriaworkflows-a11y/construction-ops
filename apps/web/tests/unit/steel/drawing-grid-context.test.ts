/**
 * drawing-grid-context.test.ts — Ejes/grilla como contexto de ubicación F7B.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSpatialPage,
  spatialPageFromPlainText,
  type SpatialTextItemInput,
} from '@/lib/steel/drawing-spatial-model';
import {
  collectTextualAxisMentions,
  detectGridContext,
  locateElementInGrid,
} from '@/lib/steel/drawing-grid-context';

/** Planta sintética 800×600: letras arriba (ejes verticales), números a la izquierda. */
const PLANTA: SpatialTextItemInput[] = [
  { str: 'A', x: 200, y: 590, width: 10, height: 10 },
  { str: 'B', x: 400, y: 590, width: 10, height: 10 },
  { str: 'C', x: 600, y: 590, width: 10, height: 10 },
  { str: '1', x: 10, y: 450, width: 10, height: 10 },
  { str: '2', x: 10, y: 300, width: 10, height: 10 },
  { str: '3', x: 10, y: 150, width: 10, height: 10 },
  // Rótulos de elementos dentro de la planta
  { str: 'Z-01', x: 210, y: 440, width: 30, height: 9 },
  { str: 'VC-EJE-1', x: 390, y: 295, width: 60, height: 9 },
  // Extremos para que la extensión cubra la página
  { str: 'PLANTA DE CIMENTACION', x: 300, y: 20, width: 180, height: 12 },
  { str: '.', x: 790, y: 10, width: 4, height: 4 },
];

describe('detectGridContext (F7B)', () => {
  const page = buildSpatialPage(PLANTA, { pageNumber: 1, sourceFileName: 'planta.pdf' });
  const grid = detectGridContext(page);

  it('detecta la grilla con letras y numeros en bandas de borde', () => {
    expect(grid.gridDetected).toBe(true);
    const names = grid.possibleGridAxes.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['A', 'B', 'C', '1', '2', '3']));
    expect(grid.reason).toContain('Grilla plausible');
  });

  it('cada etiqueta lleva orientacion y razon', () => {
    const a = grid.possibleGridAxes.find((axis) => axis.name === 'A')!;
    expect(a.orientation).toBe('vertical'); // banda superior ⇒ eje vertical
    expect(a.reason).toContain('banda de borde');
    const one = grid.possibleGridAxes.find((axis) => axis.name === '1')!;
    expect(one.orientation).toBe('horizontal');
  });

  it('ubica Z-01 cerca de los ejes A y 1 como sugerencia (no medida)', () => {
    const line = page.lines.find((l) => l.text === 'Z-01')!;
    const location = locateElementInGrid(
      { text: 'Z-01', bbox: line.bbox, pageNumber: 1 },
      grid,
      page.extent,
    );
    expect(location.locationConfidence).toBe('media');
    expect(location.nearbyAxisLabels).toEqual(expect.arrayContaining(['A', '1']));
    expect(location.locationContext).toContain('sugerido por posicion'.replace('posicion', 'posición'));
  });

  it('sin bbox del elemento ⇒ no_ubicable con razon (no se inventa)', () => {
    const location = locateElementInGrid({ text: 'VC-99', pageNumber: 1 }, grid, page.extent);
    expect(location.locationConfidence).toBe('no_ubicable');
    expect(location.reason).toContain('no tiene coordenadas');
  });

  it('una sola letra suelta NO es una grilla (ruido ⇒ gridDetected false con razon)', () => {
    const noisy = buildSpatialPage(
      [
        { str: 'A', x: 5, y: 590, width: 10, height: 10 },
        { str: 'nota cualquiera', x: 300, y: 300, width: 90, height: 9 },
        { str: '.', x: 790, y: 10, width: 4, height: 4 },
      ],
      { pageNumber: 2 },
    );
    const grid2 = detectGridContext(noisy);
    expect(grid2.gridDetected).toBe(false);
    expect(grid2.reason).toContain('insuficiente');
  });

  it('sin coordenadas: sin grilla, con menciones textuales de ejes como contexto', () => {
    const plain = spatialPageFromPlainText('VIGA VC-EJE-1 ENTRE EJES A Y B', { pageNumber: 3 });
    const grid3 = detectGridContext(plain);
    expect(grid3.gridDetected).toBe(false);
    expect(grid3.textualAxisMentions.length).toBeGreaterThan(0);
    expect(collectTextualAxisMentions(plain)).toEqual(expect.arrayContaining(['EJE 1']));
  });

  it('elemento lejos de toda burbuja ⇒ no_ubicable explicado', () => {
    const location = locateElementInGrid(
      { text: 'X-01', bbox: { x: 780, y: 15, width: 10, height: 5 }, pageNumber: 1 },
      grid,
      page.extent,
    );
    // La esquina inferior derecha está lejos de A/B/C (arriba) y 1/2/3 (izquierda).
    expect(location.locationConfidence).not.toBe('alta');
    if (location.locationConfidence === 'no_ubicable') {
      expect(location.reason).toContain('lejos');
    }
  });
});
