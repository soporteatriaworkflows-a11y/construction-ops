/**
 * generators/index.ts — Re-exports de los generadores de exportación.
 * Propiedad: agent-exports.
 */

export { generateXlsxClient } from './xlsx-client';
export type { XlsxClientInput } from './xlsx-client';

export { generateXlsxInternal } from './xlsx-internal';
export type { XlsxInternalInput } from './xlsx-internal';

export { generatePdfClient } from './pdf-client';
export type { PdfClientInput } from './pdf-client';

export { generatePdfManagement } from './pdf-management';
export type { PdfManagementInput } from './pdf-management';

export { generateCsvSchedule } from './csv-schedule';
export type { CsvScheduleInput } from './csv-schedule';
