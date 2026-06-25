/**
 * quote-companion-payload.test.ts — Contrato del payload del companion panel
 * (QUOTING_ASSISTED_COMPANION_PANEL_V1B). Verifica, con los helpers PUROS que usa
 * la server action read-only, que el payload es serializable y que los deep-links
 * son correctos. (La carga DB de getQuoteCompanionState la cubren las suites de
 * read-model/estimates; aquí no se toca DB ni se muta nada.)
 */
import { describe, it, expect } from 'vitest';
import {
  deriveQuoteProgress,
  summarizeQuoteProgress,
  nextQuoteAction,
  quoteHrefs,
} from '@/lib/quote/quote-progress';
import type { QuoteReadiness } from '@/lib/estimates/quote-readiness';

const CTX = { projectId: 'p1', scopeId: 's1', versionId: 'v1' };

function readiness(): QuoteReadiness {
  return {
    status: 'review',
    label: 'Requiere revisión',
    score: 80,
    criticalIssues: [],
    warnings: [{ severity: 'warning', group: 'boq', code: 'w', message: 'm' }],
    info: [{ severity: 'info', group: 'export', code: 'x', message: 'm' }],
    counts: {
      chapters: 2, items: 5, emptyChapters: 0, itemsWithoutQuantity: 1, itemsWithoutPrice: 0,
      itemsWithApu: 5, itemsWithoutApu: 0, apusWithCriticalIssues: 0, critical: 0, warnings: 1, info: 1,
    },
  };
}

function buildPayload() {
  const r = readiness();
  const steps = deriveQuoteProgress({
    context: CTX,
    estimate: { status: 'draft', chapterCount: 2, itemCount: 5 },
    readiness: r,
  });
  const na = nextQuoteAction(steps);
  return {
    context: CTX,
    estimateName: 'ENTRE PATIOS V1',
    estimateCode: 'EST-001',
    centerHref: `/quote/${CTX.projectId}/${CTX.scopeId}/${CTX.versionId}`,
    steps,
    summary: summarizeQuoteProgress(steps),
    readiness: { status: r.status, label: r.label, critical: r.criticalIssues.length, warnings: r.warnings.length, info: r.info.length },
    next: na ? { id: na.id, label: na.label, primaryActionLabel: na.primaryActionLabel, primaryHref: na.primaryHref } : null,
  };
}

describe('payload del companion', () => {
  it('7. es serializable (JSON round-trip estable, sin funciones/símbolos)', () => {
    const payload = buildPayload();
    const round = JSON.parse(JSON.stringify(payload));
    expect(round).toEqual(payload);
    expect(round.steps).toHaveLength(8);
  });

  it('8. deep-links correctos con projectId/scopeId/versionId', () => {
    const h = quoteHrefs(CTX);
    expect(h.estimate).toBe('/projects/p1/scopes/s1/estimates/v1');
    expect(h.workspace).toBe('/projects/p1/scopes/s1/estimates/v1/workspace');
    expect(h.quantities).toBe('/quantities');
    expect(h.pricing).toBe('/catalog/prices/review');
    expect(h.readiness).toBe('/quote/p1/s1/v1#semaforo');
    expect(buildPayload().centerHref).toBe('/quote/p1/s1/v1');
  });

  it('next apunta a un paso accionable (no locked/done) con href', () => {
    const p = buildPayload();
    expect(p.next).not.toBeNull();
    expect(p.next!.primaryHref.startsWith('/')).toBe(true);
    // cantidades tiene un ítem sin cantidad → es el primer attention
    expect(p.next!.id).toBe('quantities');
  });

  it('6. no muta el contexto de entrada (inmutabilidad de los helpers)', () => {
    const ctxCopy = { ...CTX };
    buildPayload();
    expect(ctxCopy).toEqual(CTX);
  });
});
