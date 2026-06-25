/**
 * quote-location.test.ts — Helper PURO "Estás aquí"
 * (UX_QUOTING_COMPANION_FLOATING_GUIDED_WINDOW_V1). Sin DOM, sin IO.
 */
import { describe, it, expect } from 'vitest';
import { quoteLocationFromPath, STEP_STATUS_TEXT } from '@/lib/quote/quote-location';

describe('quoteLocationFromPath — Estás aquí por ruta', () => {
  it('8. /dashboard → Inicio / Dashboard', () => {
    expect(quoteLocationFromPath('/dashboard').id).toBe('dashboard');
    expect(quoteLocationFromPath('/dashboard').label).toMatch(/dashboard/i);
  });

  it('7. /quote/[p]/[s]/[v] → vista asistida (quote-center)', () => {
    expect(quoteLocationFromPath('/quote/p1/s1/v1').id).toBe('quote-center');
  });

  it('5. detalle de presupuesto → Presupuesto / Capítulos (paso 3)', () => {
    const l = quoteLocationFromPath('/projects/p1/scopes/s1/estimates/v1');
    expect(l.id).toBe('budget');
    expect(l.stepId).toBe('chapters');
    expect(l.stepIndex).toBe(3);
    expect(quoteLocationFromPath('/projects/p1/scopes/s1/estimates/v1/workspace').id).toBe('budget');
  });

  it('2. /apu y /apu?view=cards → Asociar APU (paso 4)', () => {
    expect(quoteLocationFromPath('/apu').stepIndex).toBe(4);
    expect(quoteLocationFromPath('/apu?view=cards').id).toBe('apu');
  });

  it('3. /quantities → Cantidades (paso 5)', () => {
    expect(quoteLocationFromPath('/quantities').stepIndex).toBe(5);
    expect(quoteLocationFromPath('/quantities/import').id).toBe('quantities');
  });

  it('4. /catalog/prices/review → Precios (paso 6)', () => {
    expect(quoteLocationFromPath('/catalog/prices/review').stepIndex).toBe(6);
    expect(quoteLocationFromPath('/catalog/prices').id).toBe('pricing');
  });

  it('6. ruta sin contexto → Sin contexto claro', () => {
    expect(quoteLocationFromPath('/settings').id).toBe('other');
    expect(quoteLocationFromPath('/settings').label).toMatch(/sin contexto/i);
    expect(quoteLocationFromPath('').id).toBe('other');
  });
});

describe('STEP_STATUS_TEXT — labels textuales (no solo color)', () => {
  it('9. cada estado tiene texto explícito', () => {
    expect(STEP_STATUS_TEXT.done).toBe('Listo');
    expect(STEP_STATUS_TEXT.attention).toBe('Revisar');
    expect(STEP_STATUS_TEXT.pending).toBe('Pendiente');
    expect(STEP_STATUS_TEXT.locked).toBe('Bloqueado');
  });
});
