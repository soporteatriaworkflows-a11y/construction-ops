/**
 * apu-operational-depth.test.ts — V5.1 profundidad operativa APU (UI/UX, datos existentes).
 * Stack node: checks de FUENTE. No toca lógica/cálculos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const CARDS = read('../../../app/(dashboard)/apu/_components/apu-library-cards.tsx');
const PAGE = read('../../../app/(dashboard)/apu/page.tsx');

describe('V5.1 — APU operational depth', () => {
  it('card: próxima acción por estado (sin botones falsos) + SurfaceCard', () => {
    expect(CARDS).toContain('function ApuNextAction');
    expect(CARDS).toContain('<SurfaceCard variant="action"');
    expect(CARDS).toContain('Listo para usar · vinculado a BOQ');
    expect(CARDS).toContain('siguiente: vincular a BOQ');
  });

  it('card: incompleto eleva el CTA a "Completar APU" (ruta existente, sin inventar)', () => {
    expect(CARDS).toContain('Completar APU');
    expect(CARDS).toContain('/apu/${item.id}?tab=componentes');
  });

  it('KPI band accionable → deep-link al filtro de completitud existente', () => {
    expect(PAGE).toContain('/apu?view=cards&completeness=ready');
    expect(PAGE).toContain('/apu?view=cards&completeness=review');
    expect(PAGE).toContain('/apu?view=cards&completeness=incomplete');
  });

  it('usa el modelo de completitud PURO existente (sin backend nuevo)', () => {
    expect(CARDS).toContain('computeApuCompleteness');
    expect(CARDS).toContain("from '@/lib/apu-library/completeness'");
  });
});
