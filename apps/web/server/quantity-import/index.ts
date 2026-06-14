/**
 * index.ts — Superficie pública del importador de memorias de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1). Propiedad: agent-orchestrator.
 */
export {
  previewQuantityImport,
  confirmQuantityImport,
  listQuantityLinkableVersions,
  listQuantityImportBatches,
  buildQuantityReportCsv,
  type ConfirmQuantityImportOptions,
  type QuantityImportDeps,
} from './service';
export type { ImportedBatchSummary } from '@/lib/quantity-import/types';
export {
  QuantityImportFileError,
  QuantityImportParseError,
  QuantitySheetNotFoundError,
  QuantityImportDigestMismatchError,
  QuantityImportNotImportableError,
  QuantityImportNotSupportedError,
  QuantityLinkVersionInvalidError,
} from './errors';
export { parseQuantityWorkbook, assertQuantityImportFile } from './parse-workbook';
export {
  parseTakeoffSheet,
  classifyLineFormula,
  parseTotalFormula,
  normalizeItemCode,
  type ParsedTakeoffSheet,
  type ParsedTakeoffGroup,
  type ParsedTakeoffLine,
} from './parse-takeoff-sheet';
export {
  buildBoqTakeoffIndex,
  matchTakeoffGroup,
  type BoqTakeoffCandidate,
  type BoqTakeoffMatchIndex,
  type TakeoffMatchInput,
  type TakeoffMatchOutcome,
} from './matching';
export { buildQuantityImportPreview, type QuantityPreviewInput } from './preview';
export {
  DbQuantityImportRepository,
  type QuantityBatchRpcPayload,
  type QuantityBatchRpcResult,
} from './db-repository';
