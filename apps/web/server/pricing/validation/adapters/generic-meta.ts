/**
 * generic-meta.ts — Extractor de meta tags (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * Extrae: og:title, product:price:amount, product:price:currency, itemprop price/sku.
 */
import type { ExtractedProductData } from '../types';

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Devuelve el primer grupo de captura recortado, o null. */
function firstGroup(re: RegExp, html: string): string | null {
  const m = re.exec(html);
  const g = m?.[1];
  return g !== undefined ? g.trim() : null;
}

function getMeta(html: string, name: string): string | null {
  const esc = escapeForRegex(name);
  // <meta property="og:title" content="...">
  // <meta name="..." content="...">
  const RE = new RegExp(
    `<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const a = firstGroup(RE, html);
  if (a) return a;

  // content before property
  const RE2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`,
    'i',
  );
  return firstGroup(RE2, html);
}

function getItemprop(html: string, prop: string): string | null {
  const esc = escapeForRegex(prop);
  // <meta itemprop="price" content="...">
  const RE = new RegExp(
    `<meta[^>]+itemprop=["']${esc}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const a = firstGroup(RE, html);
  if (a) return a;

  const RE2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']${esc}["']`,
    'i',
  );
  const b = firstGroup(RE2, html);
  if (b) return b;

  // <span itemprop="price">29900</span>
  const RE3 = new RegExp(
    `<[a-z]+[^>]+itemprop=["']${esc}["'][^>]*>([^<]+)</[a-z]+>`,
    'i',
  );
  return firstGroup(RE3, html);
}

function getTitle(html: string): string | null {
  // og:title
  const og = getMeta(html, 'og:title');
  if (og) return og;
  // <title>...</title>
  return firstGroup(/<title>([^<]+)<\/title>/i, html);
}

export function extractMeta(html: string): Partial<ExtractedProductData> {
  const result: Partial<ExtractedProductData> = {};
  result.extractionMethod = 'meta-tags';

  const title = getTitle(html);
  if (title) result.title = title;

  const price =
    getMeta(html, 'product:price:amount') ??
    getItemprop(html, 'price');
  if (price) result.rawPrice = price;

  const currency =
    getMeta(html, 'product:price:currency') ??
    getItemprop(html, 'priceCurrency');
  if (currency) result.currency = currency.toUpperCase();

  const sku = getItemprop(html, 'sku') ?? getMeta(html, 'product:sku');
  if (sku) result.sku = sku;

  return result;
}
