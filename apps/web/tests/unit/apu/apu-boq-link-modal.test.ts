/**
 * apu-boq-link-modal.test.ts — Anti-regresión VISUAL del flujo "Vincular a BOQ"
 * (HOTFIX_APU_BOQ_LINK_MODAL_NOT_RENDERING_V1). El stack de tests es `node` (sin
 * jsdom), así que verificamos a nivel de FUENTE que el flujo se renderiza como
 * modal real (portal + overlay fijo) y NUNCA inline dentro de la tarjeta.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(
    new URL('../../../app/(dashboard)/apu/_components/link-to-boq-button.tsx', import.meta.url),
  ),
  'utf8',
);

describe('Vincular a BOQ — el flujo es un modal real, no inline', () => {
  it('usa createPortal hacia document.body (escapa del árbol de la tarjeta)', () => {
    expect(SRC).toContain('createPortal');
    expect(SRC).toContain('document.body');
  });

  it('el contenedor del flujo es un overlay fijo a pantalla completa', () => {
    expect(SRC).toMatch(/fixed inset-0/);
  });

  it('el panel es un dialog accesible (role/aria-modal)', () => {
    expect(SRC).toContain('role="dialog"');
    expect(SRC).toContain('aria-modal="true"');
  });

  it('NO existe el render inline antiguo (return <LinkPanel ...> directo)', () => {
    // El panel inline rompía el layout de la tarjeta. Solo debe renderizarse
    // dentro del portal/overlay, nunca como retorno directo del componente.
    expect(SRC).not.toMatch(/return\s*<LinkPanel/);
  });

  it('el LinkPanel se monta una sola vez (dentro del modal)', () => {
    const matches = SRC.match(/<LinkPanel\b/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
