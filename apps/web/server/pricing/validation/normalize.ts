/**
 * normalize.ts — Normalización de datos extraídos → propuesta (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * Reglas:
 * - Sin precio válido → PriceMissingError
 * - No inventar unit ni SKU
 * - price como DecimalString válido
 * - currency como ISO-4217 de 3 letras o 'COP' por defecto
 */
import Decimal from 'decimal.js';
import { PriceMissingError } from './types';
import type { ExtractedProductData, PriceValidationProposal } from './types';
import type { ConfidenceLevel } from './types';

const CURRENCY_SYMBOLS: Record<string, string> = {
  R$: 'BRL',
  $: 'COP', // Default $ → COP for Colombian context
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
};

function detectCurrencyFromSymbol(raw: string): string | null {
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.startsWith(sym)) return code;
  }
  return null;
}

/** Limpia un string de precio a DecimalString parseable. */
function parseRawPrice(raw: string): string | null {
  if (!raw) return null;

  // Remove currency symbols and letters; keep digits, separators, minus
  let s = raw.replace(/[^\d.,\s-]/g, '').trim();

  // Remove all spaces (thousands sep in some locales)
  s = s.replace(/\s/g, '');

  if (!s) return null;

  // Detect format: if has both . and ,
  // "29.900,00" → European (. thousands, , decimal) → "29900.00"
  // "29,900.00" → US (, thousands, . decimal) → "29900.00"
  // "29900"     → plain integer
  // "29.900"    → could be Colombian (thousands) or European decimal

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastDot > lastComma) {
      // US format: 29,900.50 → remove commas
      s = s.replace(/,/g, '');
    } else {
      // European format: 29.900,50 → remove dots, replace comma with dot
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    // Only commas: could be thousands or decimal
    const parts = s.split(',');
    const tail = parts.length === 2 ? (parts[1] ?? '') : '';
    if (parts.length === 2 && tail.length <= 2) {
      // "29900,50" → decimal comma
      s = s.replace(',', '.');
    } else {
      // "29,900" → thousands comma
      s = s.replace(/,/g, '');
    }
  } else if (hasDot) {
    // Only dots: could be thousands (Colombian "29.900") or decimal point.
    const parts = s.split('.');
    const tail = parts.length === 2 ? (parts[1] ?? '') : '';
    if (parts.length > 2) {
      // "1.234.567" → multiple dots = thousands separators
      s = s.replace(/\./g, '');
    } else if (parts.length === 2 && tail.length === 3) {
      // "29.900" with exactly 3 trailing digits = Colombian thousands sep
      s = s.replace(/\./g, '');
    }
    // else: "29.90" or "29.9" → decimal point, leave as-is
  }

  try {
    const d = new Decimal(s);
    if (d.isNaN() || !d.isFinite()) return null;
    if (d.lt(0)) return null;
    return d.toString();
  } catch {
    return null;
  }
}

function normalizeCurrency(raw: string | null, priceRaw: string | null): string {
  if (raw) {
    const upper = raw.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(upper)) return upper;
  }
  // Try to detect from price string
  if (priceRaw) {
    const sym = detectCurrencyFromSymbol(priceRaw.trim());
    if (sym) return sym;
  }
  return 'COP';
}

export function normalizeExtraction(
  data: ExtractedProductData,
  sourceUrl: string,
  extractedAt: string,
  confidence: ConfidenceLevel,
): PriceValidationProposal {
  const warnings: string[] = [...(data.warnings ?? [])];

  const observedPrice = parseRawPrice(data.rawPrice ?? '');
  if (!observedPrice) {
    const w: string[] = [];
    if (!data.rawPrice) w.push('No se encontró precio en la página.');
    else w.push(`No se pudo parsear el precio detectado: "${data.rawPrice}".`);
    throw new PriceMissingError(w);
  }

  if (!data.currency) {
    warnings.push('Moneda no detectada; se asume COP.');
  }
  if (!data.unit) {
    warnings.push('Unidad no detectada; deberás completarla antes de confirmar.');
  }
  if (!data.title) {
    warnings.push('Título del producto no detectado.');
  }
  if (data.extractionMethod === 'none') {
    warnings.push('No se encontraron datos estructurados; extracción muy limitada.');
  }

  const currency = normalizeCurrency(data.currency, data.rawPrice);

  return {
    sourceUrl,
    title: data.title ?? null,
    externalReference: data.externalReference ?? null,
    externalSku: data.sku ?? null,
    observedPrice,
    currency,
    unit: data.unit ?? null,
    extractedAt,
    extractionMethod: data.extractionMethod,
    confidence,
    warnings,
    sourceType: 'public_web',
  };
}
