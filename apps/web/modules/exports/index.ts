/**
 * index.ts — Punto de entrada público del módulo de exportaciones.
 *
 * Propiedad: agent-exports. Contrato: `docs/EXPORT_PROFILES_CONTRACT.md`.
 *
 * Solo re-exporta los tipos y validadores del dominio puro. La implementación
 * del `ExportService` vive en `apps/web/server/exports/export-service.ts`
 * (server-side, con acceso al `ReadModelPort`).
 */

export type {
  ExportProfile,
  ExportFormat,
  ExportRequest,
  ExportResult,
  ExportService,
} from './types';

export {
  FORMAT_PROFILE_COMPAT,
  FORMAT_CONTENT_TYPE,
  FORMAT_EXTENSION,
  EXPORT_SIZE_LIMIT_BYTES,
  ExportProfileFormatMismatchError,
  ExportSizeLimitError,
  ExportGenerationError,
} from './types';

export {
  validateProfileFormat,
  isProfileFormatCompatible,
} from './profile-validator';

export {
  buildFileName,
  toSlug,
  formatDateCompact,
} from './filename';

export {
  formatCOP,
  decimalStringToNumber,
  formatPercent,
} from './format-cop';

export type { CopPrecision } from './format-cop';

export {
  generateXlsxClient,
  generateXlsxInternal,
  generatePdfClient,
  generatePdfManagement,
  generateCsvSchedule,
} from './generators';
