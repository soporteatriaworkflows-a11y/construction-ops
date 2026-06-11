/**
 * fixture-repository.ts — Repositorio fixture del Centro de Revisión
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1). Modo demo: SOLO lectura vacía;
 * cualquier escritura lanza PriceIntelligenceWriteNotSupportedError.
 */
import { PriceIntelligenceWriteNotSupportedError } from '../errors';
import type {
  AuthenticatedViewer,
  BulkActionRecord,
  PendingReviewObservationView,
  PriceReviewRepository,
  ReviewBatchView,
  Uuid,
} from './types';

export class FixturePriceReviewRepository implements PriceReviewRepository {
  readonly source = 'fixture' as const;

  async listPendingObservations(
    _viewer: AuthenticatedViewer,
    _limit: number,
  ): Promise<PendingReviewObservationView[]> {
    return [];
  }

  async listBatches(_viewer: AuthenticatedViewer): Promise<ReviewBatchView[]> {
    return [];
  }

  async getObservationStatuses(
    _viewer: AuthenticatedViewer,
    _observationIds: Uuid[],
  ): Promise<Array<{ id: Uuid; status: string; importBatchId: Uuid | null }>> {
    return [];
  }

  async findBulkActionByKey(): Promise<BulkActionRecord | null> {
    return null;
  }

  async createBulkAction(): Promise<Uuid> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async completeBulkAction(): Promise<void> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async bulkUpdateStatus(): Promise<Uuid[]> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }
}
