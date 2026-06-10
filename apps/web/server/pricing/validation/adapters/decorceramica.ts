/**
 * decorceramica.ts — Adapter aislado por hostname para decorceramica.com
 * (PUBLIC SOURCE COMPATIBILITY FIX V1, contrato CATALOG_BULK_ONBOARDING_V1 §9).
 * Propiedad: agent-pricing.
 *
 * Justificación: la tienda usa JSON-LD `Product` con `AggregateOffer` y ofertas
 * anidadas, que el extractor genérico no entiende (no extrae precio). Este
 * adapter SOLO actúa para el hostname decorceramica.com (y subdominios).
 *
 * Reglas:
 *  - Extraer únicamente con evidencia clara; NUNCA inventar campos.
 *  - `unit` SIEMPRE null (no inferible de la página; la usuaria la completa).
 *  - Múltiples precios distintos ⇒ warning explícito con el precio propuesto
 *    (el menor); la propuesta sigue requiriendo revisión humana (pending).
 *  - Tolerante a cambios parciales del HTML: ante ausencia de evidencia
 *    devuelve campos null y el flujo genérico/PriceMissingError decide.
 */
import Decimal from 'decimal.js';
import type { ExtractedProductData } from '../types';

/** `true` si el hostname pertenece a Decorcerámica (aislamiento por dominio). */
export function matchesDecorceramica(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === 'decorceramica.com' || h.endsWith('.decorceramica.com');
}

type SchemaNode = Record<string, unknown>;

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

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function findProductNode(data: unknown): SchemaNode | null {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const r = findProductNode(item);
      if (r) return r;
    }
    return null;
  }
  const obj = data as SchemaNode;
  const types = toArray(obj['@type'] as string | string[]);
  if (types.some((t) => t === 'Product' || t === 'http://schema.org/Product')) return obj;
  if (Array.isArray(obj['@graph'])) {
    for (const node of obj['@graph'] as SchemaNode[]) {
      const r = findProductNode(node);
      if (r) return r;
    }
  }
  return null;
}

function getMeta(html: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`, 'i');
  const m1 = re1.exec(html)?.[1];
  if (m1 !== undefined) return m1.trim() || null;
  const m2 = re2.exec(html)?.[1];
  return m2 !== undefined ? m2.trim() || null : null;
}

/** Recolecta precios con evidencia (Offer.price, AggregateOffer low/high y anidados). */
function collectPrices(offers: SchemaNode[]): { prices: string[]; currency: string | null } {
  const prices: string[] = [];
  let currency: string | null = null;
  const push = (v: unknown) => {
    if (v === null || v === undefined) return;
    const s = String(v).trim();
    if (s === '') return;
    try {
      const d = new Decimal(s);
      if (!d.isNaN() && d.isFinite() && !d.isNegative()) prices.push(d.toString());
    } catch {
      /* sin evidencia numérica clara: se ignora */
    }
  };
  const takeCurrency = (v: unknown) => {
    if (!currency && typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim())) {
      currency = v.trim().toUpperCase();
    }
  };

  for (const offer of offers) {
    if (!offer || typeof offer !== 'object') continue;
    push(offer.price);
    push(offer.lowPrice);
    push(offer.highPrice);
    takeCurrency(offer.priceCurrency);
    const nested = toArray(offer.offers as SchemaNode | SchemaNode[]);
    if (nested.length > 0) {
      const inner = collectPrices(nested);
      prices.push(...inner.prices);
      if (!currency) currency = inner.currency;
    }
  }
  return { prices, currency };
}

/**
 * Extrae datos del HTML de una página de producto de Decorcerámica.
 * Devuelve `warnings` cuando hay múltiples precios distintos.
 */
export function extractDecorceramica(html: string): Partial<ExtractedProductData> {
  const result: Partial<ExtractedProductData> = {};

  let product: SchemaNode | null = null;
  for (const block of extractJsonLdBlocks(html)) {
    try {
      product = findProductNode(JSON.parse(block));
    } catch {
      continue;
    }
    if (product) break;
  }

  // Título: JSON-LD name → og:title
  const name = product && typeof product.name === 'string' ? product.name.trim() : '';
  result.title = name || getMeta(html, 'og:title');

  // Referencia externa: JSON-LD mpn → meta retailer_item_id
  const mpn = product && typeof product.mpn === 'string' ? product.mpn.trim() : '';
  result.externalReference = mpn || getMeta(html, 'product:retailer_item_id');

  // SKU: meta product:sku (formato comercial, ej. 6751) → JSON-LD sku crudo
  const jsonLdSku = product && typeof product.sku === 'string' ? product.sku.trim() : '';
  result.sku = getMeta(html, 'product:sku') ?? (jsonLdSku || null);

  // Precios: SOLO con evidencia. Múltiples precios distintos ⇒ warning.
  let prices: string[] = [];
  let currency: string | null = null;
  if (product) {
    const collected = collectPrices(toArray(product.offers as SchemaNode | SchemaNode[]));
    prices = collected.prices;
    currency = collected.currency;
  }
  if (prices.length === 0) {
    const metaPrice = getMeta(html, 'product:price:amount');
    if (metaPrice) prices = [metaPrice];
  }
  if (!currency) currency = getMeta(html, 'product:price:currency');

  const distinct = [...new Set(prices.map((p) => new Decimal(p).toString()))];
  if (distinct.length === 1) {
    result.rawPrice = distinct[0]!;
  } else if (distinct.length > 1) {
    const sorted = distinct.slice().sort((a, b) => new Decimal(a).comparedTo(new Decimal(b)));
    result.rawPrice = sorted[0]!;
    result.warnings = [
      `Se detectaron múltiples precios en la página (${sorted.join(', ')}). Se propone el menor (${sorted[0]}); verifica manualmente antes de aprobar.`,
    ];
  }
  if (currency) result.currency = currency.toUpperCase();

  // Unidad: NUNCA se infiere (regla de no inventar datos).
  result.unit = null;

  result.extractionMethod = result.rawPrice ? 'json-ld' : 'none';
  return result;
}
