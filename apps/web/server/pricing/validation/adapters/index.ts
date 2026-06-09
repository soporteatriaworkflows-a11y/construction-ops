/**
 * adapters/index.ts — Combina JSON-LD y meta extractors (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * Estrategia: JSON-LD tiene prioridad sobre meta tags.
 * Si JSON-LD entrega precio + moneda → method=json-ld, confidence candidate=high.
 * Si solo meta tags → method=meta-tags.
 * Si mezcla → method=mixed.
 */
import { extractJsonLd } from './generic-jsonld';
import { extractMeta } from './generic-meta';
import type { ExtractedProductData } from '../types';

export type { ExtractedProductData };

export function runAdapters(html: string): ExtractedProductData {
  const jl = extractJsonLd(html);
  const mt = extractMeta(html);

  // Merge: JSON-LD fields take priority
  const merged: ExtractedProductData = {
    title: jl.title ?? mt.title ?? null,
    rawPrice: jl.rawPrice ?? mt.rawPrice ?? null,
    currency: jl.currency ?? mt.currency ?? null,
    sku: jl.sku ?? mt.sku ?? null,
    externalReference: jl.externalReference ?? mt.externalReference ?? null,
    unit: jl.unit ?? mt.unit ?? null,
    extractionMethod: 'none',
  };

  const hasJsonLd = !!jl.rawPrice;
  const hasMeta = !!mt.rawPrice;

  if (hasJsonLd && hasMeta) merged.extractionMethod = 'mixed';
  else if (hasJsonLd) merged.extractionMethod = 'json-ld';
  else if (hasMeta) merged.extractionMethod = 'meta-tags';

  return merged;
}

export { extractJsonLd } from './generic-jsonld';
export { extractMeta } from './generic-meta';
