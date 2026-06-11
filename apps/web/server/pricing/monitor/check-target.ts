/**
 * check-target.ts — Chequeo de un target individual (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §5.
 *
 * Reutiliza ÍNTEGRO el camino seguro de Fase 3B: validatePublicUrl (SSRF +
 * DNS), fetchPublicPage (redirects manuales ≤5, 3MB, timeout 10s, sonda de
 * corte temprano) y los adapters existentes. Sin crawling; un fetch por
 * target. IO de red y persistencia inyectables (tests sin red ni DB).
 */
import { validatePublicUrl } from '../validation/validate-url';
import { fetchPublicPage } from '../validation/fetch-public-page';
import { runAdapters } from '../validation/adapters/index';
import { normalizeExtraction } from '../validation/normalize';
import { computeConfidence } from '../validation/confidence';
import {
  FetchPublicPageError,
  PriceMissingError,
  UrlValidationError,
} from '../validation/types';
import type { DnsLookup, PageFetcher } from '../validation/types';
import { compareAgainstBaseline } from './compare';
import type {
  DetectedPrice,
  MonitorEngineStore,
  MonitorResultStatus,
  MonitorTargetRecord,
  TargetCheckOutcome,
  IsoDateTime,
} from './types';

export interface CheckTargetDeps {
  store: MonitorEngineStore;
  fetcher?: PageFetcher;
  dnsLookup?: DnsLookup;
  now: () => Date;
}

/** Códigos de fetch que indican bloqueo del sitio (no se evade). */
const BLOCKED_HTTP = /HTTP (401|403|407|429)\./;

function mapFetchError(err: FetchPublicPageError): MonitorResultStatus {
  switch (err.code) {
    case 'timeout':
    case 'fetch_failed':
      return 'unreachable';
    case 'http_error':
      return BLOCKED_HTTP.test(err.message) ? 'blocked' : 'unreachable';
    default:
      // redirect_*, invalid_content_type, response_too_large, empty_body…
      return 'invalid_response';
  }
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** Sonda de corte temprano (idéntica a Fase 3B). */
function sufficientEvidenceProbe(textSoFar: string, url: string): boolean {
  const extracted = runAdapters(textSoFar, hostnameOf(url));
  return !!(extracted.rawPrice && extracted.currency);
}

function failureOutcome(
  target: MonitorTargetRecord,
  status: MonitorResultStatus,
  warning: string,
): TargetCheckOutcome {
  return {
    targetId: target.id,
    status,
    detectedPrice: null,
    currency: null,
    unitRaw: null,
    warnings: [warning],
    observationId: null,
    baselineObservationId: target.baselineObservationId,
  };
}

/** Extrae el precio de la fuente pública. Outcome de fallo si no es posible. */
async function detectPrice(
  target: MonitorTargetRecord,
  deps: CheckTargetDeps,
): Promise<{ detected: DetectedPrice } | { failure: TargetCheckOutcome }> {
  let href: string;
  try {
    const validated = await validatePublicUrl(target.sourceUrl, deps.dnsLookup);
    href = validated.href;
  } catch (err) {
    if (err instanceof UrlValidationError) {
      return { failure: failureOutcome(target, 'invalid_response', `URL no válida: ${err.message}`) };
    }
    throw err;
  }

  let pageText: string;
  let finalUrl: string;
  let fetchWarnings: string[] = [];
  try {
    const page = await fetchPublicPage(href, deps.fetcher, deps.dnsLookup, sufficientEvidenceProbe);
    pageText = page.text;
    finalUrl = page.finalUrl;
    fetchWarnings = page.warnings ?? [];
  } catch (err) {
    if (err instanceof FetchPublicPageError) {
      return { failure: failureOutcome(target, mapFetchError(err), err.message) };
    }
    if (err instanceof UrlValidationError) {
      return { failure: failureOutcome(target, 'invalid_response', `URL no válida: ${err.message}`) };
    }
    throw err;
  }

  const extracted = runAdapters(pageText, hostnameOf(finalUrl));
  const confidence = computeConfidence(extracted);
  const extractedAt = deps.now().toISOString();
  try {
    const proposal = normalizeExtraction(extracted, finalUrl, extractedAt, confidence);
    return {
      detected: {
        price: proposal.observedPrice,
        currency: proposal.currency,
        unitRaw: proposal.unit,
        title: proposal.title,
        externalSku: proposal.externalSku,
        externalReference: proposal.externalReference,
        extractionMethod: proposal.extractionMethod,
        confidence: proposal.confidence,
        warnings: [...proposal.warnings, ...fetchWarnings],
      },
    };
  } catch (err) {
    if (err instanceof PriceMissingError) {
      return {
        failure: failureOutcome(
          target,
          'parse_failed',
          `No se detectó precio en la fuente. ${err.warnings.join(' ')}`.trim(),
        ),
      };
    }
    throw err;
  }
}

function buildObservationNotes(detected: DetectedPrice, outcomeWarnings: string[]): string {
  const parts: string[] = ['Monitor automático de precios'];
  if (detected.title) parts.push(`Título: ${detected.title}`);
  if (detected.externalSku) parts.push(`SKU: ${detected.externalSku}`);
  if (detected.externalReference) parts.push(`Ref: ${detected.externalReference}`);
  parts.push(`Método: ${detected.extractionMethod}`);
  parts.push(`Confianza: ${detected.confidence}`);
  const allWarnings = [...detected.warnings, ...outcomeWarnings];
  if (allWarnings.length > 0) parts.push(`Advertencias: ${allWarnings.join('; ')}`);
  return parts.join(' | ');
}

/**
 * Chequea un target: detecta precio, compara contra baseline y decide.
 * NO persiste el resultado ni actualiza el target (lo hace el engine);
 * SÍ crea la observación pending vía el store cuando corresponde.
 */
export async function checkTarget(
  target: MonitorTargetRecord,
  deps: CheckTargetDeps,
): Promise<TargetCheckOutcome> {
  const detection = await detectPrice(target, deps);
  if ('failure' in detection) return detection.failure;

  const { detected } = detection;
  const checkedAt: IsoDateTime = deps.now().toISOString();

  const baseline = await deps.store.findBaseline(
    target.organizationId,
    target.resourceId,
    target.sourceUrl,
  );
  const comparison = compareAgainstBaseline(detected, baseline);
  const warnings = [...detected.warnings, ...comparison.warnings];

  if (comparison.outcome === 'unchanged') {
    return {
      targetId: target.id,
      status: 'unchanged',
      detectedPrice: detected.price,
      currency: detected.currency,
      unitRaw: detected.unitRaw,
      warnings,
      observationId: null,
      baselineObservationId: baseline?.observationId ?? null,
    };
  }

  // changed | no_baseline ⇒ proponer pending, sin duplicar idéntica.
  if (comparison.outcome === 'no_baseline') {
    warnings.push('Sin baseline aprobada: se propone observación inicial pending.');
  }

  const existingPendingId = await deps.store.findIdenticalPending(
    target.organizationId,
    target.resourceId,
    target.sourceUrl,
    detected.price,
    detected.currency,
  );
  if (existingPendingId) {
    warnings.push('Ya existe una observación pending idéntica; no se duplica.');
    return {
      targetId: target.id,
      status: 'changed',
      detectedPrice: detected.price,
      currency: detected.currency,
      unitRaw: detected.unitRaw,
      warnings,
      observationId: existingPendingId,
      baselineObservationId: baseline?.observationId ?? null,
    };
  }

  const observationId = await deps.store.createPendingObservation({
    target,
    price: detected.price,
    currency: detected.currency,
    // Unidad: raw detectada > unidad de la baseline > unidad del recurso.
    unit: detected.unitRaw ?? baseline?.unit ?? target.resourceUnit,
    notes: buildObservationNotes(detected, comparison.warnings),
    observedAt: checkedAt,
  });

  return {
    targetId: target.id,
    status: 'pending_created',
    detectedPrice: detected.price,
    currency: detected.currency,
    unitRaw: detected.unitRaw,
    warnings,
    observationId,
    baselineObservationId: baseline?.observationId ?? null,
  };
}
