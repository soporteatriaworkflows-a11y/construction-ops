/**
 * confidence.ts — Clasificación de confianza (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * high:   JSON-LD Product + Offer con price y currency
 * medium: meta tags con price y currency coherentes
 * low:    extracción parcial o ambigua
 */
import type { ExtractedProductData, ConfidenceLevel } from './types';

export function computeConfidence(data: ExtractedProductData): ConfidenceLevel {
  const hasPrice = !!data.rawPrice;
  const hasCurrency = !!data.currency;
  const hasTitle = !!data.title;

  if (!hasPrice) return 'low';

  switch (data.extractionMethod) {
    case 'json-ld':
      // JSON-LD with price + currency → high; without currency → medium
      return hasCurrency ? 'high' : 'medium';

    case 'meta-tags':
      // Meta tags with price + currency + title → medium; partial → low
      return hasCurrency && hasTitle ? 'medium' : 'low';

    case 'mixed':
      // Mix of both — price from JSON-LD or meta, currency present → medium or high
      return hasCurrency ? 'medium' : 'low';

    case 'none':
    default:
      return 'low';
  }
}
