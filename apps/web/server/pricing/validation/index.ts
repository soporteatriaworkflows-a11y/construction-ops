/**
 * index.ts — Servicio de validación de precios públicos (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * validatePublicPriceUrl  → valida URL, extrae, normaliza, devuelve propuesta (no persiste)
 * confirmPublicPriceObservation → crea observación pending (reutiliza Phase 3A)
 *
 * Reglas:
 *  - organizationId, userId SIEMPRE server-side
 *  - status = 'pending' siempre (NUNCA approved automáticamente)
 *  - sourceType = 'public_web'
 *  - No modifica BOQ ni AIU
 */
import { validatePublicUrl } from './validate-url';
import { fetchPublicPage } from './fetch-public-page';
import { runAdapters } from './adapters/index';
import { normalizeExtraction } from './normalize';
import { computeConfidence } from './confidence';
import { getObservationRepository } from '../index';
import type { AuthenticatedViewer, PriceObservationRepository } from '../types';
import type { ResourcePriceObservationView } from '../types';
import type {
  PriceValidationProposal,
  DnsLookup,
  PageFetcher,
} from './types';
import { InsufficientRoleError } from '../errors';

export type { PriceValidationProposal };
export { UrlValidationError, PriceMissingError, FetchPublicPageError } from './types';

const ALLOWED_ROLES = ['management', 'internal'] as const;

function checkRole(viewer: AuthenticatedViewer): void {
  if (!(ALLOWED_ROLES as readonly string[]).includes(viewer.role)) {
    throw new InsufficientRoleError('management|internal', viewer.role);
  }
}

interface ValidationDeps {
  dnsLookup?: DnsLookup;
  fetcher?: PageFetcher;
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Sonda de corte temprano (páginas pesadas): si el HTML acumulado ya entrega
 * precio + moneda estructurados, no hace falta seguir descargando.
 */
function sufficientEvidenceProbe(textSoFar: string, url: string): boolean {
  const extracted = runAdapters(textSoFar, hostnameOf(url));
  return !!(extracted.rawPrice && extracted.currency);
}

/**
 * Valida una URL pública y devuelve una propuesta de observación.
 * No persiste nada. El usuario debe confirmar explícitamente.
 */
export async function validatePublicPriceUrl(
  viewer: AuthenticatedViewer,
  _resourceId: string,
  input: { url: string },
  deps?: ValidationDeps,
): Promise<PriceValidationProposal> {
  checkRole(viewer);

  const validated = await validatePublicUrl(input.url, deps?.dnsLookup);
  const page = await fetchPublicPage(
    validated.href,
    deps?.fetcher,
    deps?.dnsLookup,
    sufficientEvidenceProbe,
  );

  const extracted = runAdapters(page.text, hostnameOf(page.finalUrl));
  const confidence = computeConfidence(extracted);
  const extractedAt = new Date().toISOString();

  const proposal = normalizeExtraction(extracted, page.finalUrl, extractedAt, confidence);
  // Avisos del fetch (página pesada / HTML truncado) viajan en la propuesta.
  if (page.warnings && page.warnings.length > 0) {
    proposal.warnings.push(...page.warnings);
  }
  return proposal;
}

/**
 * Confirma la propuesta creando una observación pending.
 * Reutiliza createResourcePriceObservation de Phase 3A.
 */
export async function confirmPublicPriceObservation(
  viewer: AuthenticatedViewer,
  resourceId: string,
  proposal: PriceValidationProposal,
  resourceUnit: string,
  repo?: PriceObservationRepository,
): Promise<ResourcePriceObservationView> {
  checkRole(viewer);

  const repository = repo ?? getObservationRepository();

  // Build notes with extracted metadata
  const noteParts: string[] = [];
  if (proposal.title) noteParts.push(`Título: ${proposal.title}`);
  if (proposal.externalSku) noteParts.push(`SKU: ${proposal.externalSku}`);
  if (proposal.externalReference) noteParts.push(`Ref: ${proposal.externalReference}`);
  noteParts.push(`Método: ${proposal.extractionMethod}`);
  noteParts.push(`Confianza: ${proposal.confidence}`);
  if (proposal.warnings.length > 0) {
    noteParts.push(`Advertencias: ${proposal.warnings.join('; ')}`);
  }
  const notes = noteParts.join(' | ');

  return repository.createResourcePriceObservation(viewer, {
    resourceId,
    supplierId: null,
    observedPrice: proposal.observedPrice,
    discountPercent: '0',
    unit: proposal.unit ?? resourceUnit,
    currency: proposal.currency,
    sourceType: 'public_web',
    sourceReference: proposal.sourceUrl,
    observedAt: proposal.extractedAt,
    validUntil: null,
    notes,
  });
}
