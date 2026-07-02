/**
 * index.ts — Fábrica de repositorios de Price Intelligence (Fase 3A).
 * Propiedad: agent-pricing.
 * Selecciona entre DB y fixture según READ_MODEL_SOURCE.
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { DbProviderRepository } from './db-provider-repository';
import { DbObservationRepository } from './db-observation-repository';
import { FixtureProviderRepository, FixtureObservationRepository } from './fixture-repository';
import type { ProviderRepository, PriceObservationRepository } from './types';

export type { ProviderRepository, PriceObservationRepository };
export type {
  ProviderView,
  ProviderCreateInput,
  ProviderUpdateInput,
  ResourcePriceObservationView,
  ResourcePriceHistoryRow,
  PriceHistoryOrigin,
  CreateObservationInput,
  ApproveObservationInput,
  RejectObservationInput,
  ResourcePriceIntelligenceSummary,
  ObservationStatus,
} from './types';
export {
  ProviderNotFoundError,
  ProviderValidationError,
  ObservationNotFoundError,
  ObservationAlreadyReviewedError,
  ObservationValidationError,
  PriceIntelligenceWriteNotSupportedError,
  InsufficientRoleError,
} from './errors';

export function getProviderRepository(): ProviderRepository {
  const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  if (source === 'db') return new DbProviderRepository();
  return new FixtureProviderRepository();
}

export function getObservationRepository(): PriceObservationRepository {
  const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  if (source === 'db') return new DbObservationRepository();
  return new FixtureObservationRepository();
}

// ---- Phase 3B: Price Validation Agent ----
export {
  validatePublicPriceUrl,
  confirmPublicPriceObservation,
} from './validation/index';
export type { PriceValidationProposal } from './validation/index';
export { UrlValidationError, PriceMissingError, FetchPublicPageError } from './validation/types';
