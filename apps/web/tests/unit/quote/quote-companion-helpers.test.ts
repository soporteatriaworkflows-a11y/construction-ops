/**
 * quote-companion-helpers.test.ts — Helpers PUROS del companion panel
 * (QUOTING_ASSISTED_COMPANION_PANEL_V1B). Sin DOM, sin IO, sin finanzas.
 */
import { describe, it, expect } from 'vitest';
import { quoteContextFromPath } from '@/lib/quote/quote-context-from-path';
import { nextQuoteAction, type QuoteStep } from '@/lib/quote/quote-progress';

function step(over: Partial<QuoteStep> & Pick<QuoteStep, 'id' | 'status'>): QuoteStep {
  return {
    label: over.id,
    description: '',
    primaryActionLabel: 'Ir',
    primaryHref: '/quote',
    ...over,
  } as QuoteStep;
}

describe('quoteContextFromPath', () => {
  it('1. parsea la ruta del centro de cotización', () => {
    expect(quoteContextFromPath('/quote/p1/s1/v1')).toEqual({
      projectId: 'p1',
      scopeId: 's1',
      versionId: 'v1',
    });
  });

  it('1. parsea la ruta de detalle de presupuesto (versionId == estimateId)', () => {
    expect(quoteContextFromPath('/projects/p1/scopes/s1/estimates/v1')).toEqual({
      projectId: 'p1',
      scopeId: 's1',
      versionId: 'v1',
    });
  });

  it('parsea subrutas del presupuesto (workspace/chapters/…)', () => {
    expect(quoteContextFromPath('/projects/p1/scopes/s1/estimates/v1/workspace')).toEqual({
      projectId: 'p1',
      scopeId: 's1',
      versionId: 'v1',
    });
    expect(quoteContextFromPath('/projects/p1/scopes/s1/estimates/v1/chapters/c9')?.versionId).toBe('v1');
  });

  it('ignora query y hash y barra final', () => {
    expect(quoteContextFromPath('/quote/p1/s1/v1/#semaforo')).toEqual({ projectId: 'p1', scopeId: 's1', versionId: 'v1' });
    expect(quoteContextFromPath('/quote/p1/s1/v1?x=1')).toEqual({ projectId: 'p1', scopeId: 's1', versionId: 'v1' });
  });

  it('2. devuelve null sin contexto claro', () => {
    expect(quoteContextFromPath('/apu?view=cards')).toBeNull();
    expect(quoteContextFromPath('/quantities')).toBeNull();
    expect(quoteContextFromPath('/dashboard')).toBeNull();
    expect(quoteContextFromPath('/quote')).toBeNull();
    expect(quoteContextFromPath('/quote/new')).toBeNull();
    expect(quoteContextFromPath('/projects/p1/scopes/s1/estimates/new')).toBeNull();
    expect(quoteContextFromPath('')).toBeNull();
    expect(quoteContextFromPath(null)).toBeNull();
  });
});

describe('nextQuoteAction', () => {
  it('3. devuelve el primer attention', () => {
    const steps = [
      step({ id: 'project', status: 'done' }),
      step({ id: 'chapters', status: 'pending' }),
      step({ id: 'apu', status: 'attention' }),
      step({ id: 'quantities', status: 'attention' }),
    ];
    expect(nextQuoteAction(steps)?.id).toBe('apu');
  });

  it('4. devuelve pending si no hay attention', () => {
    const steps = [
      step({ id: 'project', status: 'done' }),
      step({ id: 'budget', status: 'done' }),
      step({ id: 'chapters', status: 'pending' }),
      step({ id: 'apu', status: 'pending' }),
    ];
    expect(nextQuoteAction(steps)?.id).toBe('chapters');
  });

  it('5. ignora locked', () => {
    const steps = [
      step({ id: 'project', status: 'done' }),
      step({ id: 'chapters', status: 'locked' }),
      step({ id: 'apu', status: 'locked' }),
    ];
    expect(nextQuoteAction(steps)).toBeNull();
  });

  it('todo done → null', () => {
    const steps = [step({ id: 'project', status: 'done' }), step({ id: 'budget', status: 'done' })];
    expect(nextQuoteAction(steps)).toBeNull();
  });

  it('attention tiene prioridad aunque pending aparezca antes', () => {
    const steps = [
      step({ id: 'chapters', status: 'pending' }),
      step({ id: 'pricing', status: 'attention' }),
    ];
    expect(nextQuoteAction(steps)?.id).toBe('pricing');
  });
});
