/**
 * empty-state-ctas.test.ts — Tests de UI del componente EmptyState (Bootstrap CTAs).
 * Tests de estructura y tipos — sin render de DOM (no jsdom configurado para este suite).
 * Propiedad: agent-frontend-boq.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const emptyStatePath = resolve(
  here,
  '../../../components/shared/empty-state.tsx',
);

describe('EmptyState — estructura de props (Bootstrap CTAs)', () => {
  const source = readFileSync(emptyStatePath, 'utf8');

  it('acepta la prop secondaryAction (definida en la interfaz)', () => {
    expect(source).toMatch(/secondaryAction\?:\s*React\.ReactNode/);
  });

  it('acepta la prop readOnlyMessage (definida en la interfaz)', () => {
    expect(source).toMatch(/readOnlyMessage\?:\s*string/);
  });

  it('renderiza secondaryAction cuando esta presente y no hay readOnlyMessage', () => {
    // El secondaryAction se muestra dentro del bloque sin readOnlyMessage
    expect(source).toMatch(/secondaryAction/);
    // Debe usarse en la logica de render (no solo en la interfaz)
    const renderBlock = source.slice(source.indexOf('return ('));
    expect(renderBlock).toMatch(/secondaryAction/);
  });

  it('readOnlyMessage reemplaza a action y secondaryAction cuando esta presente', () => {
    // Debe haber un condicional que use readOnlyMessage
    expect(source).toMatch(/readOnlyMessage\s*\?/);
  });

  it('mantiene backward compatibility — action sigue siendo opcional', () => {
    expect(source).toMatch(/action\?:\s*React\.ReactNode/);
  });

  it('no modifica la prop title (siempre requerida)', () => {
    expect(source).toMatch(/title:\s*string/);
    // title no tiene signo ?
    expect(source).not.toMatch(/title\?:\s*string/);
  });

  it('conserva el role="status" para accesibilidad', () => {
    expect(source).toMatch(/role="status"/);
  });

  it('conserva aria-label={title} para accesibilidad', () => {
    expect(source).toMatch(/aria-label=\{title\}/);
  });
});
