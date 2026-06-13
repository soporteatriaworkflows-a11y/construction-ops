/**
 * index.ts — Superficie pública de la reconciliación APU
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1).
 */
export {
  getReconciliationData,
  getTemplateReconciliation,
  getApuBoqLinks,
  getImportBatches,
  searchResources,
  reconcileComponent,
  reconcileBulk,
  updateReconciliation,
  reconciliationCsv,
  BULK_MAX,
  type ReconciliationData,
  type ReconciliationDeps,
} from './service';
export {
  buildReconciliationRow,
  parseDescriptionFromNotes,
  isReconciliationTarget,
  summarizeReconciliation,
  type RawReconciliationComponent,
} from './domain';
export { buildReconciliationCsv } from './csv';
export { DbApuReconciliationRepository } from './db-repository';
export { ReconciliationInputError, ReconciliationBulkLimitError } from './errors';
