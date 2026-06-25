/**
 * quote-readiness.test.ts — Helper PURO del semáforo de cotización
 * (APU_QUOTE_READINESS_SEMAPHORE_V1). Sin DB, sin cálculo financiero.
 */
import { describe, it, expect } from 'vitest';
import {
  computeQuoteReadiness,
  readinessExportMessage,
} from '@/lib/estimates/quote-readiness';
import type {
  BoqItemView,
  ChapterSummary,
  EstimateSummary,
} from '@/lib/contracts/read-model';

function estimate(over: Partial<EstimateSummary> = {}): EstimateSummary {
  return {
    estimateId: 'e1', versionId: 'v1', versionNumber: 1, status: 'draft',
    directCost: '1000000', administration: '100000', contingency: '50000',
    utility: '50000', taxOnUtility: '9500', grandTotal: '1209500', ...over,
  } as EstimateSummary;
}
function chap(id: string, itemCount: number): ChapterSummary {
  return { id, code: id, name: id, subtotal: '1000', itemCount };
}
function item(chapterId: string, quantity: string, unitPrice: string): BoqItemView {
  return { id: `${chapterId}-i`, chapterId, code: 'c', description: 'd', unit: 'm2', quantity, unitPrice, subtotal: '100' };
}

describe('computeQuoteReadiness — estados', () => {
  it('ready: capítulos + ítems con cantidad y precio + AIU', () => {
    const r = computeQuoteReadiness({
      estimate: estimate(),
      chapters: [chap('A', 1)],
      items: [item('A', '5', '1000')],
    });
    expect(r.status).toBe('ready');
    expect(r.counts.critical).toBe(0);
    expect(r.label).toBe('Listo para exportar');
  });

  it('blocked: sin capítulos', () => {
    const r = computeQuoteReadiness({ estimate: estimate(), chapters: [], items: [] });
    expect(r.status).toBe('blocked');
    expect(r.criticalIssues.some((i) => i.code === 'no_chapters')).toBe(true);
  });

  it('blocked: capítulo sin ítems', () => {
    const r = computeQuoteReadiness({ estimate: estimate(), chapters: [chap('A', 0)], items: [] });
    expect(r.status).toBe('blocked');
    expect(r.criticalIssues.some((i) => i.code === 'empty_chapter')).toBe(true);
  });

  it('blocked: ítem sin cantidad', () => {
    const r = computeQuoteReadiness({ estimate: estimate(), chapters: [chap('A', 1)], items: [item('A', '0', '1000')] });
    expect(r.status).toBe('blocked');
    expect(r.criticalIssues.find((i) => i.code === 'item_no_quantity')?.count).toBe(1);
  });

  it('blocked: ítem sin precio', () => {
    const r = computeQuoteReadiness({ estimate: estimate(), chapters: [chap('A', 1)], items: [item('A', '5', '0')] });
    expect(r.status).toBe('blocked');
    expect(r.criticalIssues.find((i) => i.code === 'item_no_price')?.count).toBe(1);
  });

  it('blocked: AIU sin configurar en versión no finalizada', () => {
    const r = computeQuoteReadiness({
      estimate: estimate({ administration: '0', contingency: '0', utility: '0', taxOnUtility: '0', grandTotal: '1000000' }),
      chapters: [chap('A', 1)], items: [item('A', '5', '1000')],
    });
    expect(r.criticalIssues.some((i) => i.code === 'aiu_missing')).toBe(true);
  });

  it('AIU 0 en versión finalizada (issued) NO es crítico', () => {
    const r = computeQuoteReadiness({
      estimate: estimate({ status: 'issued', administration: '0', contingency: '0', utility: '0', taxOnUtility: '0' }),
      chapters: [chap('A', 1)], items: [item('A', '5', '1000')],
    });
    expect(r.criticalIssues.some((i) => i.code === 'aiu_missing')).toBe(false);
  });

  it('review: solo advertencias (capítulos sin ítems globales)', () => {
    const r = computeQuoteReadiness({ estimate: estimate(), chapters: [chap('A', 1)], items: [] });
    // chapter dice itemCount=1 pero no llegan items ⇒ warning no_items (sin críticos de ítem).
    expect(r.warnings.some((i) => i.code === 'no_items')).toBe(true);
    expect(r.status).toBe('review');
  });
});

describe('computeQuoteReadiness — informativos (datos no disponibles hoy)', () => {
  it('siempre informa vínculo APU pendiente y verificación de export cliente', () => {
    const r = computeQuoteReadiness({ estimate: estimate(), chapters: [chap('A', 1)], items: [item('A', '5', '1000')] });
    expect(r.info.some((i) => i.code === 'apu_link_pending')).toBe(true);
    expect(r.info.some((i) => i.code === 'export_client_unverified')).toBe(true);
    // informativos NO degradan el estado.
    expect(r.status).toBe('ready');
  });
});

describe('counts + score + mensajes', () => {
  it('counts reflejan cantidades', () => {
    const r = computeQuoteReadiness({
      estimate: estimate(),
      chapters: [chap('A', 2), chap('B', 0)],
      items: [item('A', '0', '1000'), item('A', '5', '0')],
    });
    expect(r.counts.chapters).toBe(2);
    expect(r.counts.emptyChapters).toBe(1);
    expect(r.counts.itemsWithoutQuantity).toBe(1);
    expect(r.counts.itemsWithoutPrice).toBe(1);
  });
  it('score acotado [0,100]', () => {
    const r = computeQuoteReadiness({ estimate: estimate(), chapters: [], items: [] });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it('mensajes de export por estado', () => {
    expect(readinessExportMessage('ready')).toContain('lista');
    expect(readinessExportMessage('review')).toContain('advertencias');
    expect(readinessExportMessage('blocked')).toContain('críticos');
  });
});
