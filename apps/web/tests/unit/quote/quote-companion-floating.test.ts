/**
 * quote-companion-floating.test.ts — Anti-regresión de la ventana flotante guiada
 * y su comportamiento FLOTANTE POR DEFECTO
 * (HOTFIX_QUOTING_COMPANION_NOT_FLOATING_V1). Stack node (sin jsdom): checks de
 * FUENTE sobre default flotante, drag, "Soltar ventana", textos y localStorage.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const COMPANION = read('../../../app/(dashboard)/_components/quote-companion.tsx');
const BODY = read('../../../app/(dashboard)/_components/quote-companion-body.tsx');

describe('flotante por defecto', () => {
  it('1. pinned arranca en false (no fijado por defecto)', () => {
    expect(COMPANION).toMatch(/useState\(false\)\)?;\s*\/\/|const \[pinned, setPinned\] = useState\(false\)/);
    expect(COMPANION).toContain('const [pinned, setPinned] = useState(false)');
  });

  it('NO restaura pinned desde localStorage al abrir (default flotante)', () => {
    // openPanel no debe leer PINNED_KEY para forzar fijado.
    expect(COMPANION).toMatch(/Por defecto FLOTANTE/);
    expect(COMPANION).not.toMatch(/setPinned\(\s*localStorage/);
  });

  it('4. al abrir asigna una posición flotante explícita (top/left), no anclada', () => {
    expect(COMPANION).toContain('defaultFloatingPos()');
    expect(COMPANION).toMatch(/setPos\(storedPos \? clampPos[^)]*\) : defaultFloatingPos\(\)\)/);
    expect(COMPANION).toContain('style={asideStyle}');
    expect(COMPANION).toContain('left: pos.x, top: pos.y');
  });

  it('5. el modo anclado right-0 SOLO aplica cuando pinned=true (docked)', () => {
    expect(COMPANION).toContain('const docked = pinned');
    expect(COMPANION).toMatch(/docked\s*\n?\s*\?\s*'fixed right-0 top-0/);
  });
});

describe('controles y textos visibles', () => {
  it('2. existe botón "Soltar ventana"', () => {
    expect(COMPANION).toContain('Soltar ventana');
  });
  it('3. existe ayuda "Arrastra para mover" y estado "Ventana flotante"', () => {
    expect(COMPANION).toContain('Arrastra para mover');
    expect(COMPANION).toContain('Ventana flotante');
    expect(COMPANION).toContain('Fijado al costado');
  });
  it('8. existe "Restaurar posición"', () => {
    expect(COMPANION).toContain('Restaurar posición');
    expect(COMPANION).toContain('defaultFloatingPos()');
  });
});

describe('drag real desde el header (7)', () => {
  it('hay handlers de pointer y captura', () => {
    expect(COMPANION).toContain('onPointerDown={onHeaderPointerDown}');
    expect(COMPANION).toContain('onPointerMove={onHeaderPointerMove}');
    expect(COMPANION).toContain('setPointerCapture');
    expect(COMPANION).toContain('cursor-move');
  });
  it('reajusta al redimensionar (clamp) y z-30 (bajo modales)', () => {
    expect(COMPANION).toContain("addEventListener('resize'");
    expect(COMPANION).toContain('clampPos');
    expect(COMPANION).toContain('z-30');
  });
});

describe('guía textual + localStorage seguro', () => {
  it('Estás aquí + Paso actual + labels de estado (no solo color)', () => {
    expect(BODY).toContain('Estás aquí');
    expect(BODY).toContain('Paso actual');
    expect(BODY).toContain('STEP_STATUS_TEXT');
  });
  it('6. persiste solo ids/pinned/pos; sin datos financieros', () => {
    expect(COMPANION).toContain('ACTIVE_KEY');
    expect(COMPANION).toContain('POS_KEY');
    expect(COMPANION).toContain('PINNED_KEY');
    expect(COMPANION).not.toMatch(/grandTotal|directCost|unitPrice|subtotal/i);
  });
});
