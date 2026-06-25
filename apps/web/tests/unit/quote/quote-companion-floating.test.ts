/**
 * quote-companion-floating.test.ts — Anti-regresión de la ventana flotante guiada
 * (UX_QUOTING_COMPANION_FLOATING_GUIDED_WINDOW_V1). Stack node (sin jsdom):
 * verificamos a nivel de FUENTE el drag, "Restaurar posición", textos de guía y
 * que localStorage no guarda datos financieros.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const COMPANION = read('../../../app/(dashboard)/_components/quote-companion.tsx');
const BODY = read('../../../app/(dashboard)/_components/quote-companion-body.tsx');

describe('ventana flotante draggable', () => {
  it('10. arrastra desde el header y soporta restaurar posición', () => {
    expect(COMPANION).toContain('onPointerDown');
    expect(COMPANION).toContain('setPointerCapture');
    expect(COMPANION).toContain('Restaurar posición');
    expect(COMPANION).toMatch(/onClick=\{\(\) => setPos\(null\)\}/);
  });

  it('reajusta al redimensionar (clamp al viewport) y queda bajo modales (z-30)', () => {
    expect(COMPANION).toContain("addEventListener('resize'");
    expect(COMPANION).toContain('clampPos');
    expect(COMPANION).toContain('z-30');
  });

  it('conserva el modo anclado al costado (pinned) como fallback', () => {
    expect(COMPANION).toMatch(/const docked = pinned/);
    expect(COMPANION).toContain('right-0 top-0');
  });
});

describe('textos de guía explícitos (no solo color)', () => {
  it('8/Estás aquí + Paso actual + labels de estado en el cuerpo', () => {
    expect(BODY).toContain('Estás aquí');
    expect(BODY).toContain('Paso actual');
    expect(BODY).toContain('STEP_STATUS_TEXT');
  });
});

describe('localStorage seguro', () => {
  it('7/11. persiste solo ids/pinned/pos; sin datos financieros', () => {
    expect(COMPANION).toContain('ACTIVE_KEY');
    expect(COMPANION).toContain('POS_KEY');
    expect(COMPANION).toContain('PINNED_KEY');
    expect(COMPANION).not.toMatch(/grandTotal|directCost|unitPrice|subtotal/i);
  });
});
