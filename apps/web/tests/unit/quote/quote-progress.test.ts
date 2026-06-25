/**
 * quote-progress.test.ts — Helper PURO de progreso del modo asistido
 * (QUOTING_ASSISTED_MODE_V1). Sin DB, sin finanzas: solo deriva estado y links.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveQuoteProgress,
  quoteHrefs,
  summarizeQuoteProgress,
  type QuoteStep,
  type QuoteStepId,
} from '@/lib/quote/quote-progress';
import type { QuoteReadiness } from '@/lib/estimates/quote-readiness';

function steps(input: Parameters<typeof deriveQuoteProgress>[0]): Map<QuoteStepId, QuoteStep> {
  return new Map(deriveQuoteProgress(input).map((s) => [s.id, s]));
}

function readiness(over: Partial<QuoteReadiness> = {}): QuoteReadiness {
  const counts = {
    chapters: 2,
    items: 5,
    emptyChapters: 0,
    itemsWithoutQuantity: 0,
    itemsWithoutPrice: 0,
    itemsWithApu: 5,
    itemsWithoutApu: 0,
    apusWithCriticalIssues: 0,
    critical: 0,
    warnings: 0,
    info: 1,
    ...(over.counts ?? {}),
  };
  return {
    status: 'ready',
    label: 'Listo para exportar',
    score: 100,
    criticalIssues: [],
    warnings: [],
    info: [],
    counts,
    ...over,
  };
}

const CTX = { projectId: 'p1', scopeId: 's1', versionId: 'v1' };

describe('deriveQuoteProgress — contexto incompleto', () => {
  it('1. sin proyecto/scope/version → proyecto pending y pasos 3-8 locked', () => {
    const m = steps({ context: {} });
    expect(m.get('project')!.status).toBe('pending');
    expect(m.get('budget')!.status).toBe('locked');
    for (const id of ['chapters', 'apu', 'quantities', 'pricing', 'readiness', 'export'] as const) {
      expect(m.get(id)!.status).toBe('locked');
    }
  });

  it('2. proyecto seleccionado → paso proyecto done; presupuesto pending', () => {
    const m = steps({ context: { projectId: 'p1' } });
    expect(m.get('project')!.status).toBe('done');
    expect(m.get('budget')!.status).toBe('pending');
  });

  it('proyecto + scope sin versión → presupuesto pending', () => {
    const m = steps({ context: { projectId: 'p1', scopeId: 's1' } });
    expect(m.get('budget')!.status).toBe('pending');
  });
});

describe('deriveQuoteProgress — versión y estado', () => {
  it('3. versión editable → presupuesto done', () => {
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 1, itemCount: 1 } });
    expect(m.get('budget')!.status).toBe('done');
  });

  it('versión finalizada (issued) → presupuesto attention (no editable)', () => {
    const m = steps({ context: CTX, estimate: { status: 'issued', chapterCount: 1, itemCount: 1 } });
    expect(m.get('budget')!.status).toBe('attention');
  });

  it('4. sin capítulos → capítulos attention', () => {
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 0, itemCount: 0 } });
    expect(m.get('chapters')!.status).toBe('attention');
    expect(m.get('chapters')!.primaryHref).toContain('/chapters/new');
  });

  it('capítulos con ítems → done', () => {
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 3, itemCount: 9 }, readiness: readiness() });
    expect(m.get('chapters')!.status).toBe('done');
  });
});

describe('deriveQuoteProgress — readiness derivado', () => {
  it('5. ítems sin cantidad → cantidades attention', () => {
    const r = readiness({ counts: { ...readiness().counts, itemsWithoutQuantity: 3 } });
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 2, itemCount: 5 }, readiness: r });
    expect(m.get('quantities')!.status).toBe('attention');
  });

  it('ítems sin precio → precios attention', () => {
    const r = readiness({ counts: { ...readiness().counts, itemsWithoutPrice: 2 } });
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 2, itemCount: 5 }, readiness: r });
    expect(m.get('pricing')!.status).toBe('attention');
  });

  it('6. readiness blocked → semáforo attention y export attention', () => {
    const r = readiness({ status: 'blocked', criticalIssues: [{ severity: 'critical', group: 'boq', code: 'x', message: 'm' }] });
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 2, itemCount: 5 }, readiness: r });
    expect(m.get('readiness')!.status).toBe('attention');
    expect(m.get('export')!.status).toBe('attention');
  });

  it('7. readiness ready → semáforo done', () => {
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 2, itemCount: 5 }, readiness: readiness() });
    expect(m.get('readiness')!.status).toBe('done');
  });

  it('8. readiness review → export done (disponible con advertencias)', () => {
    const r = readiness({ status: 'review', warnings: [{ severity: 'warning', group: 'boq', code: 'w', message: 'm' }] });
    const m = steps({ context: CTX, estimate: { status: 'draft', chapterCount: 2, itemCount: 5 }, readiness: r });
    expect(m.get('export')!.status).toBe('done');
  });
});

describe('deriveQuoteProgress — invariantes', () => {
  it('9. no recalcula finanzas: no expone totales/montos en los pasos', () => {
    const all = deriveQuoteProgress({ context: CTX, estimate: { status: 'draft', chapterCount: 2, itemCount: 5 }, readiness: readiness() });
    const blob = JSON.stringify(all);
    // El helper no debe arrastrar campos financieros (grandTotal/directCost/unitPrice/subtotal).
    expect(blob).not.toMatch(/grandTotal|directCost|unitPrice|subtotal/i);
    expect(all).toHaveLength(8);
  });

  it('10. deep-links correctos con projectId/scopeId/versionId', () => {
    const h = quoteHrefs(CTX);
    expect(h.estimate).toBe('/projects/p1/scopes/s1/estimates/v1');
    expect(h.workspace).toBe('/projects/p1/scopes/s1/estimates/v1/workspace');
    expect(h.chaptersNew).toBe('/projects/p1/scopes/s1/estimates/v1/chapters/new');
    expect(h.apuLibrary).toBe('/apu?view=cards');
    expect(h.pricing).toBe('/catalog/prices/review');
    expect(h.readiness).toBe('/quote/p1/s1/v1#semaforo');
  });

  it('fallback de links sin contexto apunta a /quote/new', () => {
    const h = quoteHrefs({});
    expect(h.estimate).toBe('/quote/new');
    expect(h.readiness).toBe('/quote/new');
  });

  it('summarizeQuoteProgress cuenta done/total/pct', () => {
    const all = deriveQuoteProgress({ context: CTX, estimate: { status: 'draft', chapterCount: 2, itemCount: 5 }, readiness: readiness() });
    const s = summarizeQuoteProgress(all);
    expect(s.total).toBe(8);
    expect(s.done).toBeGreaterThan(0);
    expect(s.pct).toBe(Math.round((s.done / s.total) * 100));
  });
});
