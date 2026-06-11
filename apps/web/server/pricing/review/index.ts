/**
 * index.ts — Fábrica y exports del Centro de Revisión de Precios
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1). Propiedad: agent-pricing.
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { DbPriceReviewRepository } from './db-repository';
import { FixturePriceReviewRepository } from './fixture-repository';
import type { PriceReviewRepository } from './types';

export type {
  PendingReviewObservationView,
  ReviewBatchView,
  ReviewSummary,
  ReviewWarning,
  BulkReviewInput,
  BulkReviewResult,
  BulkSkippedRow,
  BulkActionRecord,
  PriceReviewRepository,
} from './types';

export {
  BulkSelectionInvalidError,
  BulkSelectionTooLargeError,
  BulkActionDuplicateError,
  BulkRejectionReasonRequiredError,
} from './errors';

export {
  MAX_BULK_ROWS,
  BULK_UPDATE_CHUNK,
  REVIEW_LIST_LIMIT,
  validateBulkSelection,
  validateIdempotencyKey,
  computeReviewWarnings,
  buildBulkReviewReportCsv,
} from './validation';

export {
  bulkApproveObservations,
  bulkRejectObservations,
  computeReviewSummary,
} from './service';
export type { BulkReviewDeps } from './service';

export { DbPriceReviewRepository } from './db-repository';
export { FixturePriceReviewRepository } from './fixture-repository';

export function getReviewRepository(): PriceReviewRepository {
  const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  if (source === 'db') return new DbPriceReviewRepository();
  return new FixturePriceReviewRepository();
}
