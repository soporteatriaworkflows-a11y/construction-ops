/**
 * _fakes.ts — Stubs/fakes para tests del dominio de costos.
 * Propiedad: agent-cost-domain. NO contiene datos reales (fixtures sanitizados).
 */
import type {
  PricingReadPort,
  PricingReadQuery,
  PricingReadResult,
  ApprovedPriceContext,
} from '@/modules/apu';
import type { DecimalString, Uuid } from '@/lib/utils/types';

/**
 * Fake del PricingReadPort (contrato unificado, async + Result): tabla en
 * memoria resourceId → budgetReferencePrice. `'AMBIGUOUS'` ⇒ ambiguous_price;
 * ausente ⇒ no_approved_price. cost-domain sólo lee `budgetReferencePrice`.
 */
export function makeFakePricingPort(
  prices: Record<Uuid, DecimalString | 'AMBIGUOUS'>,
  currency = 'COP',
): PricingReadPort {
  return {
    getApprovedPrice(query: PricingReadQuery): Promise<PricingReadResult> {
      const entry = prices[query.resourceId];
      if (entry === undefined) {
        return Promise.resolve({
          ok: false,
          error: { kind: 'no_approved_price', resourceId: query.resourceId },
        });
      }
      if (entry === 'AMBIGUOUS') {
        return Promise.resolve({
          ok: false,
          error: { kind: 'ambiguous_price', resourceId: query.resourceId, candidates: [] },
        });
      }
      const value: ApprovedPriceContext = {
        resourceId: query.resourceId,
        supplierProductId: '00000000-0000-4000-8000-0000000000ff',
        currency,
        observedAt: '2026-01-01T00:00:00.000Z',
        approvedAt: '2026-01-01T00:00:00.000Z',
        sourceType: 'manual',
        onlinePublicPrice: entry,
        preventiveVariationPct: '0',
        budgetReferencePrice: entry,
        negotiatedDiscountPct: '0',
        expectedPurchasePrice: entry,
        projectedSaving: '0',
        manualOverride: false,
      };
      return Promise.resolve({ ok: true, value });
    },
  };
}

let counter = 0;
/** Generador de IDs determinista para tests de clonación. */
export function makeIdGen(prefix = 'clone'): () => Uuid {
  counter = 0;
  return () => `${prefix}-${String(++counter).padStart(4, '0')}`;
}
