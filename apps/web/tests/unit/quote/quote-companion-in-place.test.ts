/**
 * quote-companion-in-place.test.ts — Anti-regresión del comportamiento IN-PLACE
 * del companion (HOTFIX_QUOTING_COMPANION_TRUE_IN_PLACE_GUIDE_V1). Stack node
 * (sin jsdom): verificamos a nivel de FUENTE que el panel no induce a salir de la
 * pantalla, usa selector embebido y solo persiste ids (no finanzas), y que la
 * server action es read-only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const COMPANION = read('../../../app/(dashboard)/_components/quote-companion.tsx');
const TRIGGER = read('../../../app/(dashboard)/_components/quote-companion-trigger.tsx');
const SELECTOR = read('../../../app/(dashboard)/_components/quote-companion-selector.tsx');
const ACTIONS = read('../../../app/(dashboard)/_components/quote-companion-actions.ts');

describe('triggers abren el panel SIN navegar (1, 2)', () => {
  it('el trigger usa <button> + CustomEvent, no Link ni router.push', () => {
    expect(TRIGGER).toContain('<button');
    expect(TRIGGER).toContain('dispatchEvent');
    expect(TRIGGER).not.toMatch(/from 'next\/navigation'/);
    expect(TRIGGER).not.toMatch(/<Link\b/);
  });

  it('el launcher es un <button onClick={openPanel}> (no navega)', () => {
    expect(COMPANION).toContain('onClick={openPanel}');
    expect(COMPANION).toMatch(/state !== 'open'/);
  });
});

describe('sin contexto → selector embebido, no redirección (3, 6)', () => {
  it('la rama sin cotización renderiza el selector embebido', () => {
    expect(COMPANION).toContain('<QuoteCompanionSelector');
    expect(COMPANION).toMatch(/!effectiveCtx\s*\?/);
  });

  it('ya NO usa el CTA "Ir al asistente" como única acción sin contexto', () => {
    expect(COMPANION).not.toContain('Ir al asistente');
  });

  it('restaura la última cotización activa desde localStorage al abrir', () => {
    expect(COMPANION).toContain('readActiveQuote');
    expect(COMPANION).toContain('ACTIVE_KEY');
  });
});

describe('localStorage solo guarda ids, sin finanzas (4, 9)', () => {
  it('persiste el contexto (projectId/scopeId/versionId), no totales', () => {
    expect(COMPANION).toMatch(/localStorage\.setItem\(\s*ACTIVE_KEY/);
    expect(COMPANION).not.toMatch(/grandTotal|directCost|unitPrice|subtotal/i);
  });

  it('el selector guarda la elección vía onSelect (projectId/scopeId/versionId)', () => {
    expect(SELECTOR).toContain('onSelect({ projectId, scopeId, versionId: id })');
    expect(SELECTOR).toContain('Crear nueva cotización');
    expect(SELECTOR).toContain('/quote/new');
  });
});

describe('server action read-only (10)', () => {
  it('no contiene mutaciones (revalidate/insert/update/delete/rpc)', () => {
    expect(ACTIONS).not.toMatch(/revalidatePath|\.insert\(|\.update\(|\.delete\(|\brpc\(/);
  });
  it('reusa lecturas existentes (getEstimateById/getEstimateDetail/listApus/listProjects)', () => {
    expect(ACTIONS).toContain('getEstimateById');
    expect(ACTIONS).toContain('getEstimateDetail');
    expect(ACTIONS).toContain('listApus');
    expect(ACTIONS).toContain('listProjects');
  });
});
