/**
 * adapters.test.ts — Tests de extracción JSON-LD, meta tags y confianza (Fase 3B, tests 12–24).
 * Solo fixtures HTML sanitizados; sin red.
 */
import { describe, it, expect } from 'vitest';
import { extractJsonLd } from '@/server/pricing/validation/adapters/generic-jsonld';
import { extractMeta } from '@/server/pricing/validation/adapters/generic-meta';
import { runAdapters } from '@/server/pricing/validation/adapters/index';
import { computeConfidence } from '@/server/pricing/validation/confidence';

// ---------------------------------------------------------------------------
// Fixtures HTML sanitizados
// ---------------------------------------------------------------------------

const HTML_JSONLD_PRODUCT = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Cemento Gris Argos 50Kg",
  "sku": "CEM-50-GRI",
  "offers": {
    "@type": "Offer",
    "price": "29900",
    "priceCurrency": "COP"
  }
}
</script>
</head><body></body></html>`;

const HTML_JSONLD_MULTIPLE_OFFERS = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Arena de río bulto",
  "offers": [
    { "@type": "Offer", "price": "18000", "priceCurrency": "COP" },
    { "@type": "Offer", "price": "17500", "priceCurrency": "COP" }
  ]
}
</script>
</head><body></body></html>`;

const HTML_JSONLD_NO_CURRENCY = `
<html><head>
<script type="application/ld+json">
{
  "@type": "Product",
  "name": "Bloque H10",
  "offers": { "@type": "Offer", "price": "850" }
}
</script>
</head><body></body></html>`;

const HTML_META_TAGS = `
<html><head>
  <meta property="og:title" content="Bloque H10 Concreto" />
  <meta property="product:price:amount" content="850" />
  <meta property="product:price:currency" content="COP" />
</head><body></body></html>`;

const HTML_OG_TITLE_ONLY = `
<html><head>
  <meta property="og:title" content="Varilla 1/2 corrugada" />
</head><body></body></html>`;

const HTML_ITEMPROP = `
<html><head>
  <meta property="og:title" content="Pintura interior" />
  <meta itemprop="price" content="45000" />
  <meta itemprop="priceCurrency" content="COP" />
  <meta itemprop="sku" content="PIN-001" />
</head><body></body></html>`;

const HTML_NO_PRICE = `
<html><head>
  <meta property="og:title" content="Producto sin precio" />
</head><body></body></html>`;

const HTML_INVALID_PRICE = `
<html><head>
<script type="application/ld+json">
{
  "@type": "Product",
  "name": "Producto",
  "offers": { "@type": "Offer", "price": "N/A", "priceCurrency": "COP" }
}
</script>
</head><body></body></html>`;

const HTML_AMBIGUOUS = `
<html><head>
  <title>Productos varios</title>
</head>
<body>Consulte precios en tienda.</body>
</html>`;

const HTML_META_TITLE_ONLY = `
<html><head>
  <title>Cemento Argos Premium</title>
</head><body></body></html>`;

// ---------------------------------------------------------------------------
// extractJsonLd
// ---------------------------------------------------------------------------

describe('extractJsonLd', () => {
  // T12: JSON-LD Product + Offer
  it('T12 — extrae nombre, precio, moneda y SKU de JSON-LD Product+Offer', () => {
    const r = extractJsonLd(HTML_JSONLD_PRODUCT);
    expect(r.title).toBe('Cemento Gris Argos 50Kg');
    expect(r.rawPrice).toBe('29900');
    expect(r.currency).toBe('COP');
    expect(r.sku).toBe('CEM-50-GRI');
    expect(r.extractionMethod).toBe('json-ld');
  });

  // T13: múltiples Offers — usa la primera con precio
  it('T13 — usa la primera Offer con precio cuando hay múltiples', () => {
    const r = extractJsonLd(HTML_JSONLD_MULTIPLE_OFFERS);
    expect(r.rawPrice).toBe('18000');
    expect(r.title).toBe('Arena de río bulto');
  });
});

// ---------------------------------------------------------------------------
// extractMeta
// ---------------------------------------------------------------------------

describe('extractMeta', () => {
  // T14: meta tags og:title + product:price
  it('T14 — extrae título y precio de meta tags product:price', () => {
    const r = extractMeta(HTML_META_TAGS);
    expect(r.title).toBe('Bloque H10 Concreto');
    expect(r.rawPrice).toBe('850');
    expect(r.currency).toBe('COP');
  });

  // T15: og:title sin precio
  it('T15 — extrae og:title aunque no haya precio', () => {
    const r = extractMeta(HTML_OG_TITLE_ONLY);
    expect(r.title).toBe('Varilla 1/2 corrugada');
    // extractMeta retorna Partial<>; rawPrice undefined cuando no hay precio
    expect(r.rawPrice).toBeFalsy();
  });

  // T16: currency detectada
  it('T16 — currency normalizada a mayúsculas', () => {
    const r = extractMeta(HTML_META_TAGS);
    expect(r.currency).toBe('COP');
  });

  // T17: sku de itemprop
  it('T17 — extrae SKU de itemprop', () => {
    const r = extractMeta(HTML_ITEMPROP);
    expect(r.sku).toBe('PIN-001');
    expect(r.rawPrice).toBe('45000');
  });
});

// ---------------------------------------------------------------------------
// runAdapters
// ---------------------------------------------------------------------------

describe('runAdapters', () => {
  // T18: sin precio → rawPrice null
  it('T18 — rawPrice null cuando no hay precio en la página', () => {
    const r = runAdapters(HTML_NO_PRICE);
    expect(r.rawPrice).toBeNull();
  });

  // T19: precio inválido string (será rechazado en normalize)
  it('T19 — devuelve rawPrice "N/A" (lo rechaza normalizeExtraction)', () => {
    const r = runAdapters(HTML_INVALID_PRICE);
    expect(r.rawPrice).toBe('N/A');
  });

  // T20: HTML ambiguo → method none
  it('T20 — extractionMethod none en HTML sin datos estructurados de precio', () => {
    const r = runAdapters(HTML_AMBIGUOUS);
    expect(r.extractionMethod).toBe('none');
    expect(r.rawPrice).toBeNull();
  });

  it('extrae título de <title> como fallback', () => {
    const r = runAdapters(HTML_META_TITLE_ONLY);
    expect(r.title).toBe('Cemento Argos Premium');
  });
});

// ---------------------------------------------------------------------------
// computeConfidence
// ---------------------------------------------------------------------------

describe('computeConfidence', () => {
  // T21: high — JSON-LD con precio y moneda
  it('T21 — high cuando JSON-LD tiene precio y moneda', () => {
    const r = runAdapters(HTML_JSONLD_PRODUCT);
    expect(computeConfidence(r)).toBe('high');
  });

  // T22: medium — meta tags con precio, moneda y título
  it('T22 — medium cuando meta tags tienen precio, moneda y título', () => {
    const r = runAdapters(HTML_META_TAGS);
    expect(computeConfidence(r)).toBe('medium');
  });

  // T23: low — sin precio
  it('T23 — low cuando no hay precio', () => {
    const r = runAdapters(HTML_NO_PRICE);
    expect(computeConfidence(r)).toBe('low');
  });

  // T24: warnings — JSON-LD sin moneda → medium (no high)
  it('T24 — medium (no high) cuando JSON-LD no tiene moneda', () => {
    const r = runAdapters(HTML_JSONLD_NO_CURRENCY);
    expect(computeConfidence(r)).toBe('medium');
    expect(r.currency).toBeNull();
  });
});
