/**
 * adapters/index.ts — Combina extractores por hostname y genéricos
 * (Fase 3B + PUBLIC SOURCE COMPATIBILITY FIX V1). Propiedad: agent-pricing.
 *
 * Estrategia:
 *  1. Si el hostname tiene adapter dedicado (registro aislado por dominio) y
 *     este extrae precio con evidencia ⇒ sus campos tienen prioridad; los
 *     genéricos solo completan vacíos.
 *  2. En cualquier otro caso: JSON-LD genérico tiene prioridad sobre meta tags
 *     (comportamiento Fase 3B sin cambios).
 */
import { extractJsonLd } from './generic-jsonld';
import { extractMeta } from './generic-meta';
import { extractDecorceramica, matchesDecorceramica } from './decorceramica';
import type { ExtractedProductData } from '../types';

export type { ExtractedProductData };

/** Registro de adapters aislados por hostname. */
const SITE_ADAPTERS: Array<{
  matches: (hostname: string) => boolean;
  extract: (html: string) => Partial<ExtractedProductData>;
}> = [
  { matches: matchesDecorceramica, extract: extractDecorceramica },
];

function mergeGenerics(html: string): ExtractedProductData {
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

export function runAdapters(html: string, hostname?: string): ExtractedProductData {
  const generic = mergeGenerics(html);

  if (hostname) {
    const site = SITE_ADAPTERS.find((a) => a.matches(hostname));
    if (site) {
      const s = site.extract(html);
      if (s.rawPrice) {
        return {
          title: s.title ?? generic.title,
          rawPrice: s.rawPrice,
          currency: s.currency ?? generic.currency,
          sku: s.sku ?? generic.sku,
          externalReference: s.externalReference ?? generic.externalReference,
          // unit del adapter manda (null explícito = no inventar)
          unit: s.unit !== undefined ? s.unit : generic.unit,
          extractionMethod: s.extractionMethod ?? 'json-ld',
          ...(s.warnings && s.warnings.length > 0 ? { warnings: s.warnings } : {}),
        };
      }
    }
  }

  return generic;
}

export { extractJsonLd } from './generic-jsonld';
export { extractMeta } from './generic-meta';
export { extractDecorceramica, matchesDecorceramica } from './decorceramica';
