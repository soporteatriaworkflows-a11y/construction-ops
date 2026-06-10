/**
 * types.ts — Tipos del agente de validación de precios públicos (Fase 3B).
 * Propiedad: agent-pricing.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ExtractionMethod = 'json-ld' | 'meta-tags' | 'mixed' | 'none';

export interface PublicUrlInput {
  url: string;
}

/** Datos crudos extraídos de la página (antes de normalización). */
export interface ExtractedProductData {
  title: string | null;
  rawPrice: string | null;
  currency: string | null;
  sku: string | null;
  externalReference: string | null;
  unit: string | null;
  extractionMethod: ExtractionMethod;
  /** Avisos del extractor (p. ej. múltiples precios detectados). */
  warnings?: string[];
}

/** Propuesta de observación (no persistida hasta confirmación humana). */
export interface PriceValidationProposal {
  sourceUrl: string;
  title: string | null;
  externalReference: string | null;
  externalSku: string | null;
  /** DecimalString — obligatorio; vacío ⇒ PriceMissingError */
  observedPrice: string;
  currency: string;
  unit: string | null;
  extractedAt: string;
  extractionMethod: ExtractionMethod;
  confidence: ConfidenceLevel;
  warnings: string[];
  sourceType: 'public_web';
}

export class UrlValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'UrlValidationError';
    this.code = code;
  }
}

export class PriceMissingError extends Error {
  readonly code = 'price_missing' as const;
  readonly warnings: string[];
  constructor(warnings: string[]) {
    super('No se detectó un precio válido en la URL indicada.');
    this.name = 'PriceMissingError';
    this.warnings = warnings;
  }
}

export class FetchPublicPageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FetchPublicPageError';
    this.code = code;
  }
}

export type DnsLookup = (hostname: string) => Promise<string[]>;

export interface FetchedPage {
  text: string;
  contentType: string;
  finalUrl: string;
  /** Avisos de fetch (página pesada, HTML truncado…). Opcional: mocks legados. */
  warnings?: string[];
  /** `true` si el stream se canceló con evidencia suficiente (HTML parcial). */
  truncated?: boolean;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

/**
 * Sonda de corte temprano: recibe el HTML acumulado y la URL actual; si
 * devuelve `true`, el stream se cancela (ya hay evidencia suficiente).
 */
export type EarlyStopProbe = (textSoFar: string, url: string) => boolean;
