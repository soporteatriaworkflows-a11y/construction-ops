/**
 * index.ts — Servicio de exportación del presupuesto real (4E.1).
 *
 * Contrato: `docs/BUDGET_EXPORT_CONTRACT.md`. Resuelve el repositorio vía el
 * selector `READ_MODEL_SOURCE` (sin fallback silencioso db→fixture), arma el
 * payload server-derived y serializa Excel/PDF en memoria. No recalcula
 * finanzas; reutiliza el resumen financiero de 4D.2.
 */
import type { ViewerContext, Uuid } from '../types';
import {
  getEstimatesWriteRepository,
  type GetEstimatesWriteRepositoryOptions,
} from '../index';
import type {
  EstimateExportFormat,
  EstimateExportPayload,
  EstimateExportResult,
} from '@/lib/estimates/export-types';
import { EXPORT_MAX_BYTES, EXPORT_MIME } from '@/lib/estimates/export-types';
import { generateEstimateExcel } from './xlsx';
import { generateEstimatePdf } from './pdf';
import { buildEstimateExportFileName } from './filename';

export class EstimateExportSizeError extends Error {
  constructor(public readonly sizeBytes: number, public readonly maxBytes: number) {
    super(`estimate_export_too_large: ${sizeBytes} > ${maxBytes}`);
    this.name = 'EstimateExportSizeError';
  }
}

/** Logger inyectable (sin contenido completo ni datos sensibles). */
export interface EstimateExportLogger {
  info(message: string): void;
  error(message: string): void;
}
const defaultLogger: EstimateExportLogger = {
  info: (m) => console.info(m),
  error: (m) => console.error(m),
};

/**
 * Payload completo para exportar el presupuesto real (versión activa).
 * Delegado al repositorio RLS-bound (cross-org/inexistente ⇒ NotFound).
 */
export async function getEstimateExportPayload(
  viewer: ViewerContext,
  estimateId: Uuid,
  options: GetEstimatesWriteRepositoryOptions = {},
): Promise<EstimateExportPayload> {
  return getEstimatesWriteRepository(options).getEstimateExportPayload(viewer, estimateId);
}

async function finalize(
  buffer: Uint8Array,
  payload: EstimateExportPayload,
  format: EstimateExportFormat,
  logger: EstimateExportLogger,
): Promise<EstimateExportResult> {
  if (buffer.byteLength > EXPORT_MAX_BYTES) {
    throw new EstimateExportSizeError(buffer.byteLength, EXPORT_MAX_BYTES);
  }
  const fileName = buildEstimateExportFileName(payload, format);
  logger.info(`[estimate-export] done format=${format} file=${fileName} size=${buffer.byteLength}`);
  return {
    buffer,
    fileName,
    contentType: EXPORT_MIME[format],
    sizeBytes: buffer.byteLength,
    generatedAt: payload.generatedAt,
  };
}

/** Genera el Excel del presupuesto real (RESUMEN/PRESUPUESTO/TRAZABILIDAD). */
export async function generateEstimateExcelExport(
  viewer: ViewerContext,
  estimateId: Uuid,
  options: GetEstimatesWriteRepositoryOptions = {},
  logger: EstimateExportLogger = defaultLogger,
): Promise<EstimateExportResult> {
  const payload = await getEstimateExportPayload(viewer, estimateId, options);
  const buffer = await generateEstimateExcel(payload);
  return finalize(buffer, payload, 'xlsx', logger);
}

/** Genera el PDF del presupuesto real (sin UUID/source_row/secretos). */
export async function generateEstimatePdfExport(
  viewer: ViewerContext,
  estimateId: Uuid,
  options: GetEstimatesWriteRepositoryOptions = {},
  logger: EstimateExportLogger = defaultLogger,
): Promise<EstimateExportResult> {
  const payload = await getEstimateExportPayload(viewer, estimateId, options);
  const buffer = await generateEstimatePdf(payload);
  return finalize(buffer, payload, 'pdf', logger);
}

export { generateEstimateExcel } from './xlsx';
export { generateEstimatePdf } from './pdf';
export { buildEstimateExportFileName, sanitizeSegment } from './filename';
export { versionLabel } from './version-label';
export {
  BRAND,
  BRAND_HEX,
  BRAND_ARGB,
  loadBrandLogo,
  __resetBrandLogoCache,
  type BrandLogo,
} from './branding';
