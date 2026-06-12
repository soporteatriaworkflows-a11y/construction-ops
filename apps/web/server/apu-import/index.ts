/**
 * index.ts — Superficie pública del importador APU
 * (ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1).
 */
export {
  previewApuImport,
  confirmApuImport,
  listApuLinkableVersions,
  buildApuReportCsv,
  type ApuImportDeps,
  type ConfirmApuImportOptions,
} from './service';
export {
  ApuImportFileError,
  ApuImportParseError,
  ApuSheetNotFoundError,
  ApuImportDigestMismatchError,
  ApuImportNotImportableError,
  ApuImportNotSupportedError,
  ApuSuggestionRejectedError,
  ApuLinkVersionInvalidError,
} from './errors';
export { assertApuImportFile, parseApuWorkbook } from './parse-workbook';
export {
  parseApuSheet,
  parseCrewDescription,
  type ParsedApuSheet,
  type ParsedApuActivity,
  type ParsedApuComponent,
  type ParsedSalaryRole,
  type RecognizedRole,
} from './parse-apu-sheet';
export {
  deriveSalaryRole,
  numberToDecimalString,
  differsFromEvidence,
  type SalaryBlockInputs,
} from './salary';
export {
  buildResourceMatchIndex,
  matchMaterialComponent,
  type MaterialMatchOutcome,
} from './matching';
export {
  buildApuImportPreview,
  resolveLaborRoles,
  persistedCodeFor,
  type ApuPreviewBuild,
  type ActivityBuildPlan,
  type ComponentBuildPlan,
  type BoqCandidateItem,
  type ExistingLaborRole,
  type LaborResolution,
  type BuildPreviewInput,
} from './preview';
export {
  DbApuImportRepository,
  type ApuBatchRpcPayload,
  type ApuBatchRpcResult,
} from './db-repository';
export type { ApuCellGrid, ApuColumn, ApuSheetGrid, RawCell } from './sheet-model';
export { cellNumber, cellText, normalizeDescription, normalizeLabel } from './sheet-model';
