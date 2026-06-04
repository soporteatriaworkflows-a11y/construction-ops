/**
 * mode-label.test.ts — Etiqueta de modo del footer (estabilización 4B.1).
 *
 * Propiedad: orquestador.
 *
 * Garantiza que el footer del layout refleje el modo activo en request-time:
 *  - `db`      ⇒ "Datos reales" (NO demo).
 *  - `fixture` ⇒ "Modo demostración".
 * Sin exponer connection strings ni detalles internos.
 */
import { describe, it, expect } from 'vitest';
import { readModelModeLabel } from '@/lib/utils/mode-label';

describe('readModelModeLabel', () => {
  it('db ⇒ "Datos reales" y isFixture false (nunca etiqueta demo)', () => {
    const m = readModelModeLabel({ READ_MODEL_SOURCE: 'db' });
    expect(m.isFixture).toBe(false);
    expect(m.label).toBe('Datos reales');
    expect(m.label.toLowerCase()).not.toContain('fixture');
    expect(m.label).not.toMatch(/Oleada 3A/);
  });

  it('fixture ⇒ "Modo demostración" y isFixture true', () => {
    const m = readModelModeLabel({ READ_MODEL_SOURCE: 'fixture' });
    expect(m.isFixture).toBe(true);
    expect(m.label).toBe('Modo demostración');
  });

  it('sin variable ⇒ por defecto fixture (demo)', () => {
    const m = readModelModeLabel({});
    expect(m.isFixture).toBe(true);
  });

  it('valor inválido ⇒ etiqueta neutra sin romper (no fixture, no demo textual)', () => {
    const m = readModelModeLabel({ READ_MODEL_SOURCE: 'postgres' });
    expect(m.isFixture).toBe(false);
    expect(m.label.toLowerCase()).not.toContain('fixture');
  });

  it('no expone secretos ni connection strings', () => {
    const m = readModelModeLabel({
      READ_MODEL_SOURCE: 'db',
      DATABASE_URL: 'postgresql://secret:secret@host:5432/db',
    });
    expect(m.label).not.toContain('postgresql');
    expect(m.label).not.toContain('secret');
  });
});
