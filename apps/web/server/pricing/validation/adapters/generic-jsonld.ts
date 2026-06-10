/**
 * generic-jsonld.ts — Extractor JSON-LD Product/Offer (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * Extrae: Product.name, Offer.price, Offer.priceCurrency, Product.sku.
 */
import type { ExtractedProductData } from '../types';

// Extrae el texto de todos los bloques <script type="application/ld+json">
function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(html)) !== null) {
    const body = m[1];
    if (body !== undefined) blocks.push(body.trim());
  }
  return blocks;
}

type SchemaNode = Record<string, unknown>;

function normalizeToArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function extractFromProduct(node: SchemaNode): Partial<ExtractedProductData> | null {
  const type = normalizeToArray(node['@type'] as string | string[]);
  const isProduct = type.some((t) => t === 'Product' || t === 'http://schema.org/Product');
  if (!isProduct) return null;

  const result: Partial<ExtractedProductData> = {};
  result.extractionMethod = 'json-ld';

  if (typeof node.name === 'string') result.title = node.name.trim() || null;
  if (typeof node.sku === 'string') result.sku = node.sku.trim() || null;
  if (typeof node.mpn === 'string' && !result.externalReference) {
    result.externalReference = node.mpn.trim() || null;
  }

  // Find offers
  const offers = normalizeToArray(node.offers as SchemaNode | SchemaNode[]);
  // Use the first offer with a price
  for (const offer of offers) {
    if (typeof offer !== 'object' || offer === null) continue;
    const o = offer as SchemaNode;
    const price = o.price ?? o['schema:price'];
    const currency = o.priceCurrency ?? o['schema:priceCurrency'];
    if (price != null) {
      result.rawPrice = String(price).trim();
      if (typeof currency === 'string') result.currency = currency.trim().toUpperCase();
      break;
    }
  }

  return Object.keys(result).length > 1 ? result : null;
}

function walkGraph(data: unknown): Partial<ExtractedProductData> | null {
  if (!data || typeof data !== 'object') return null;

  // Handle array of nodes first
  if (Array.isArray(data)) {
    for (const item of data as SchemaNode[]) {
      const r = walkGraph(item);
      if (r) return r;
    }
    return null;
  }

  const obj = data as SchemaNode;

  // Handle @graph
  if (Array.isArray(obj['@graph'])) {
    for (const node of obj['@graph'] as SchemaNode[]) {
      const r = walkGraph(node);
      if (r) return r;
    }
  }

  // Direct Product node
  const r = extractFromProduct(obj);
  if (r) return r;

  return null;
}

export function extractJsonLd(html: string): Partial<ExtractedProductData> {
  const blocks = extractJsonLdBlocks(html);
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    const result = walkGraph(parsed);
    if (result) return result;
  }
  return {};
}
