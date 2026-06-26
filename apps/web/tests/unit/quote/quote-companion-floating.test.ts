/**
 * quote-companion-floating.test.ts — Anti-regresión de la ventana flotante y los
 * modos de ubicación (UX_QUOTING_COMPANION_WORKSPACE_FOCUS_AND_DOCKING_V1).
 * Stack node (sin jsdom): checks de FUENTE.
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
  it('placement arranca en floating', () => {
    expect(COMPANION).toContain("const [placement, setPlacement] = useState<Placement>('floating')");
    expect(COMPANION).toMatch(/Por defecto FLOTANTE/);
  });

  it('al abrir asigna posición flotante explícita (top/left), no anclada', () => {
    expect(COMPANION).toContain('defaultFloatingPos()');
    expect(COMPANION).toMatch(/setPos\(storedPos \? clampPos[^)]*\) : defaultFloatingPos\(\)\)/);
    expect(COMPANION).toContain('style={asideStyle}');
    expect(COMPANION).toContain('left: pos.x, top: pos.y');
  });
});

describe('modos de ubicación (FASE 6: 7,8,9)', () => {
  it('existen placement floating / corner / side', () => {
    expect(COMPANION).toContain("type Placement = 'floating' | 'corner' | 'side'");
    expect(COMPANION).toContain("placement === 'side'");
    expect(COMPANION).toContain("placement === 'corner'");
  });
  it('side ancla a la derecha; corner al área inferior izquierda', () => {
    expect(COMPANION).toMatch(/placement === 'side'\s*\?\s*'fixed right-0 top-0/);
    expect(COMPANION).toContain('left-[15.5rem]');
  });
  it('lateral reserva espacio (padding del body) solo en lg', () => {
    expect(COMPANION).toContain("document.body.style.paddingRight");
    expect(COMPANION).toContain("matchMedia('(min-width: 1024px)')");
  });
  it('controles de ubicación con texto (Flotante/Esquina/Lateral)', () => {
    expect(COMPANION).toMatch(/floating: 'Flotante'/);
    expect(COMPANION).toMatch(/corner: 'Esquina'/);
    expect(COMPANION).toMatch(/side: 'Lateral'/);
  });
});

describe('drag real desde el header', () => {
  it('hay handlers de pointer y captura; cursor-move; z-30', () => {
    expect(COMPANION).toContain('onPointerDown={onHeaderPointerDown}');
    expect(COMPANION).toContain('onPointerMove={onHeaderPointerMove}');
    expect(COMPANION).toContain('setPointerCapture');
    expect(COMPANION).toContain('cursor-move');
    expect(COMPANION).toContain('z-30');
  });
  it('reajusta al redimensionar (clamp)', () => {
    expect(COMPANION).toContain("addEventListener('resize'");
    expect(COMPANION).toContain('clampPos');
  });
});

describe('guía textual + localStorage seguro', () => {
  it('Estás aquí + Paso actual + labels de estado (no solo color)', () => {
    expect(BODY).toContain('Estás aquí');
    expect(BODY).toContain('Paso actual');
    expect(BODY).toContain('STEP_STATUS_TEXT');
  });
  it('10. persiste solo ids/placement/pos; sin datos financieros', () => {
    expect(COMPANION).toContain('ACTIVE_KEY');
    expect(COMPANION).toContain('POS_KEY');
    expect(COMPANION).toContain('PLACEMENT_KEY');
    expect(COMPANION).not.toMatch(/grandTotal|directCost|unitPriceSnapshot|\$\s?\d/);
  });
});
