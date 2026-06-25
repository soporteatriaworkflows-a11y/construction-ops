/**
 * quote-companion-header-controls.test.ts — Anti-regresión de los controles del
 * header de la ventana flotante (HOTFIX_QUOTING_COMPANION_HEADER_CONTROLS_V1).
 * Stack node (sin jsdom): checks de FUENTE de que cada botón tiene su handler y
 * de que el drag NO roba el click (guard por target + stopPropagation).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../../../app/(dashboard)/_components/quote-companion.tsx', import.meta.url)),
  'utf8',
);

describe('controles del header — handlers (1-5)', () => {
  it('Restaurar posición → setPos(defaultFloatingPos())', () => {
    expect(SRC).toContain('aria-label="Restaurar posición"');
    expect(SRC).toContain('onClick={() => setPos(defaultFloatingPos())}');
  });
  it('Fijar / Soltar → toggle pinned con labels correctos', () => {
    expect(SRC).toContain('onClick={() => setPinned((v) => !v)}');
    expect(SRC).toMatch(/Soltar ventana.*Fijar al costado|pinned \? 'Soltar ventana' : 'Fijar al costado'/s);
  });
  it('Minimizar → setState(minimized) y NO borra la cotización activa (8)', () => {
    expect(SRC).toContain('aria-label="Minimizar asistente"');
    expect(SRC).toContain("onClick={() => setState('minimized')}");
    // El handler de minimizar no debe limpiar activeQuote.
    expect(SRC).not.toMatch(/setState\('minimized'\)[^}]*setActiveQuote\(null\)/);
  });
  it('Cerrar → setState(closed) sigue existiendo', () => {
    expect(SRC).toContain('aria-label="Cerrar asistente"');
    expect(SRC).toContain("onClick={() => setState('closed')}");
  });
});

describe('drag NO roba el click de los botones (3, 6)', () => {
  it('onHeaderPointerDown ignora pointerdowns que nacen en un button', () => {
    expect(SRC).toMatch(/closest\('button'\)\)\s*return/);
  });
  it('el contenedor de botones detiene la propagación del pointerdown', () => {
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});

describe('seguridad', () => {
  it('9. localStorage no guarda datos financieros', () => {
    expect(SRC).not.toMatch(/grandTotal|directCost|unitPriceSnapshot|\$\s?\d/);
  });
});
