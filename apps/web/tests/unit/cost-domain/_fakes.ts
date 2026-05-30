/**
 * _fakes.ts — Stubs/fakes para tests del dominio de costos.
 * Propiedad: agent-cost-domain. NO contiene datos reales (fixtures sanitizados).
 */
import type {
  PricingReadPort,
  ApprovedPriceQuery,
  ApprovedPriceContext,
} from '@/modules/apu';
import { PricingResolutionError } from '@/modules/apu';
import type { DecimalString, Uuid } from '@/lib/utils/types';

/**
 * Fake del PricingReadPort: tabla en memoria resourceId → budgetReferencePrice.
 * `null` registrado ⇒ ambiguous_price; ausente ⇒ no_approved_price.
 */
export function makeFakePricingPort(
  prices: Record<Uuid, DecimalString | 'AMBIGUOUS'>,
  currency = 'COP',
): PricingReadPort {
  return {
    getApprovedPrice(query: ApprovedPriceQuery): ApprovedPriceContext {
      const entry = prices[query.resourceId];
      if (entry === undefined) {
        throw new PricingResolutionError('no_approved_price', query.resourceId);
      }
      if (entry === 'AMBIGUOUS') {
        throw new PricingResolutionError('ambiguous_price', query.resourceId);
      }
      return {
        resourceId: query.resourceId,
        budgetReferencePrice: entry,
        currency,
        approvedPriceObservationId: null,
        approvedAt: null,
      };
    },
  };
}

let counter = 0;
/** Generador de IDs determinista para tests de clonación. */
export function makeIdGen(prefix = 'clone'): () => Uuid {
  counter = 0;
  return () => `${prefix}-${String(++counter).padStart(4, '0')}`;
}
