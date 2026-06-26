/**
 * quote-companion-header-controls.test.ts — Anti-regresión de los controles del
 * header (minimizar/cerrar/restaurar/ubicación) y del drag que no roba clicks.
 * Stack node (sin jsdom): checks de FUENTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../../../app/(dashboard)/_components/quote-companion.tsx', import.meta.url)),
  'utf8',
);

describe('controles del header — handlers', () => {
  it('Minimizar → setState(minimized) y NO borra la cotización activa', () => {
    expect(SRC).toContain('aria-label="Minimizar asistente"');
    expect(SRC).toContain("onClick={() => setState('minimized')}");
    expect(SRC).not.toMatch(/setState\('minimized'\)[^}]*setActiveQuote\(null\)/);
  });
  it('Cerrar → setState(closed)', () => {
    expect(SRC).toContain('aria-label="Cerrar asistente"');
    expect(SRC).toContain("onClick={() => setState('closed')}");
  });
  it('Restaurar posición → setPos(defaultFloatingPos())', () => {
    expect(SRC).toContain('aria-label="Restaurar posición"');
    expect(SRC).toContain('onClick={() => setPos(defaultFloatingPos())}');
  });
  it('cambiar ubicación → setPlacement(p)', () => {
    expect(SRC).toContain('onClick={() => setPlacement(p)}');
  });
});

describe('drag NO roba el click de los botones', () => {
  it('onHeaderPointerDown ignora pointerdowns que nacen en un button', () => {
    expect(SRC).toMatch(/closest\('button'\)\)\s*return/);
  });
  it('el contenedor de controles detiene la propagación del pointerdown', () => {
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});

describe('seguridad', () => {
  it('localStorage no guarda datos financieros', () => {
    expect(SRC).not.toMatch(/grandTotal|directCost|unitPriceSnapshot|\$\s?\d/);
  });
});
