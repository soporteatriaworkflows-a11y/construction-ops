/**
 * quote-guidance.test.ts — Guía accionable PURA por paso
 * (UX_QUOTING_COMPANION_ACTIONABLE_GUIDANCE_V1). Sin DOM, sin IO, sin finanzas.
 */
import { describe, it, expect } from 'vitest';
import {
  STEP_GUIDE,
  buildStepGuidance,
  pickGuidanceStep,
  stepReasonText,
} from '@/lib/quote/quote-guidance';
import type { QuoteStep, QuoteStepId, QuoteStepStatus } from '@/lib/quote/quote-progress';

function step(id: QuoteStepId, status: QuoteStepStatus, over: Partial<QuoteStep> = {}): QuoteStep {
  return {
    id,
    label: id,
    status,
    description: '',
    primaryActionLabel: 'Ir',
    primaryHref: `/x/${id}`,
    ...over,
  };
}

describe('buildStepGuidance — guías por paso (1–6)', () => {
  const ids: QuoteStepId[] = ['project', 'budget', 'chapters', 'apu', 'quantities', 'pricing', 'readiness', 'export'];
  for (const id of ids) {
    it(`${id}: tiene qué significa / qué hacer / CTA / resultado`, () => {
      const g = buildStepGuidance(step(id, 'pending', { description: 'razón' }));
      expect(g.whatItMeans.length).toBeGreaterThan(10); // 8
      expect(g.whatToDoNow.length).toBeGreaterThan(10); // 9
      expect(g.expectedResult.length).toBeGreaterThan(10); // 10
      expect(g.primaryActionLabel.length).toBeGreaterThan(5); // 11 (accionable, no genérico)
      expect(g.primaryHref).toBe(`/x/${id}`);
    });
  }

  it('2. Asociar APU describe vinculación técnica y CTA enfocado en "Sin APU"', () => {
    const g = buildStepGuidance(step('apu', 'pending'));
    expect(g.whatItMeans).toMatch(/APU/);
    expect(g.primaryActionLabel).toMatch(/sin APU/i);
    expect(g.whatToDoNow).toMatch(/Sin APU/);
  });

  it('3/4. Cantidades y Precios tienen CTA específico', () => {
    expect(buildStepGuidance(step('quantities', 'attention')).primaryActionLabel).toMatch(/cantidades/i);
    expect(buildStepGuidance(step('pricing', 'attention')).primaryActionLabel).toMatch(/precios/i);
  });
});

describe('honestidad — no inventa conteos (7)', () => {
  it('whyThisState usa la descripción real del paso (sin fabricar números)', () => {
    const g = buildStepGuidance(step('apu', 'pending', { description: 'Vincula actividades APU a los ítems del BOQ' }));
    expect(g.whyThisState).toBe('Vincula actividades APU a los ítems del BOQ');
    expect(g.whyThisState).not.toMatch(/\d/);
  });

  it('descripción vacía → mensaje honesto, no inventa', () => {
    const g = buildStepGuidance(step('apu', 'pending', { description: '' }));
    expect(g.whyThisState).toMatch(/no hay suficiente información/i);
  });

  it('conserva conteos reales si vienen en la descripción', () => {
    const g = buildStepGuidance(step('quantities', 'attention', { description: '3 ítem(s) sin cantidad' }));
    expect(g.whyThisState).toBe('3 ítem(s) sin cantidad');
  });
});

describe('campos visibles (8, 9, 10, 11)', () => {
  it('expone whatItMeans/whatToDoNow/expectedResult y CTA accionable', () => {
    const g = buildStepGuidance(step('chapters', 'attention', { description: '2 capítulo(s) sin ítems' }));
    expect(g.whatItMeans).toBeTruthy();
    expect(g.whatToDoNow).toBeTruthy();
    expect(g.expectedResult).toBeTruthy();
    expect(g.primaryActionLabel).not.toBe('Abrir');
    expect(g.secondaryHelpText).toMatch(/pantalla/i);
  });
});

describe('stepReasonText — razón corta por estado (5)', () => {
  it('done → Listo, locked → Bloqueado', () => {
    expect(stepReasonText(step('apu', 'done'))).toBe('Listo');
    expect(stepReasonText(step('apu', 'locked'))).toBe('Bloqueado');
  });
  it('pending/attention con razón corta por paso', () => {
    expect(stepReasonText(step('quantities', 'pending'))).toBe('Pendiente: faltan cantidades');
    expect(stepReasonText(step('pricing', 'attention'))).toMatch(/^Revisar:/);
    expect(stepReasonText(step('apu', 'pending'))).toMatch(/APU/);
  });
});

describe('pickGuidanceStep', () => {
  const steps = [
    step('project', 'done'),
    step('budget', 'done'),
    step('chapters', 'done'),
    step('apu', 'pending'),
    step('quantities', 'pending'),
  ];
  it('prefiere el siguiente accionable por id', () => {
    expect(pickGuidanceStep(steps, 'apu', 'chapters')?.id).toBe('apu');
  });
  it('si no hay next, usa el lugar actual', () => {
    expect(pickGuidanceStep(steps, null, 'chapters')?.id).toBe('chapters');
  });
  it('si no, primer no done/locked', () => {
    expect(pickGuidanceStep(steps, null, null)?.id).toBe('apu');
  });
  it('todo done → null', () => {
    expect(pickGuidanceStep([step('project', 'done')], null, null)).toBeNull();
  });
});

describe('sin datos financieros (12)', () => {
  it('STEP_GUIDE es microcopy estático, sin valores ni campos financieros embebidos', () => {
    const blob = JSON.stringify(STEP_GUIDE);
    // identificadores de campo (camelCase) o montos en moneda — no prosa.
    expect(blob).not.toMatch(/grandTotal|directCost|unitPriceSnapshot|\$\s?\d/);
  });
});
