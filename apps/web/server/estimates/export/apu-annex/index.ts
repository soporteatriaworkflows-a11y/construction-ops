/**
 * index.ts — Orquestación de la exportación de APU vinculados y del paquete
 * completo (APU_EXPORTS_V1 + BUDGET_EXPORT_WITH_APU_ANNEX_V1).
 *
 * Resuelve la selección RLS-bound (sin fallback silencioso), serializa Excel/PDF
 * en memoria, aplica el límite de tamaño y construye el nombre de archivo
 * sanitizado. Read-only: no muta datos, sin escritura remota. Contrato §1, §9–§11.
 */
import type { ViewerContext } from '@/lib/contracts/read-model';
import type { Uuid } from '@/lib/utils/types';
import {
  getEstimatesWriteRepository,
  type GetEstimatesWriteRepositoryOptions,
} from '../../index';
import { getReadModel } from '@/server/read-model';
import {
  EXPORT_MAX_BYTES,
  EXPORT_MIME,
  EXPORT_EXTENSION,
  type EstimateExportFormat,
  type EstimateExportResult,
} from '@/lib/estimates/export-types';
import type {
  ApuExportKind,
  BudgetApuExportSelection,
} from '@/lib/estimates/apu-export-types';
import { sanitizeSegment } from '../filename';
import { EstimateExportSizeError } from '../index';
import {
  resolveBudgetApuExportSelection,
  type ApuExportSelectionDeps,
} from './selection';
import { generateLinkedApuExcel, generatePackageExcel } from './apu-xlsx';
import { generateLinkedApuPdf, generatePackagePdf } from './apu-pdf';

/** Construye las deps RLS-bound del resolver desde el selector READ_MODEL_SOURCE. */
function defaultDeps(options: GetEstimatesWriteRepositoryOptions = {}): ApuExportSelectionDeps {
  const repo = getEstimatesWriteRepository(options);
  const readModel = getReadModel(options);
  return {
    getPayload: (v, e, ver) => repo.getEstimateExportPayload(v, e, ver),
    getApuLinks: (v, e, ver) => repo.getVersionApuTemplateLinks(v, e, ver),
    getApuDetail: (v, id) => readModel.getApuDetail(v, id),
  };
}

/** Resuelve la selección de export (expuesto para reutilización/UI). */
export async function getBudgetApuExportSelection(
  viewer: ViewerContext,
  estimateId: Uuid,
  versionId?: Uuid,
  options: GetEstimatesWriteRepositoryOptions = {},
  deps: ApuExportSelectionDeps = defaultDeps(options),
): Promise<BudgetApuExportSelection> {
  return resolveBudgetApuExportSelection(viewer, estimateId, versionId, deps);
}

const PREFIX: Record<ApuExportKind, string> = {
  apu: 'apu_vinculados',
  package: 'paquete_presupuesto_apu',
};

/**
 * Nombre de archivo de los documentos NUEVOS:
 * `apu_vinculados_<codigo>_<version>.<ext>` /
 * `paquete_presupuesto_apu_<codigo>_<version>.<ext>`. Sanitizado.
 */
export function buildApuExportFileName(
  selection: BudgetApuExportSelection,
  kind: ApuExportKind,
  format: EstimateExportFormat,
): string {
  const code = sanitizeSegment(selection.payload.estimate.code) || 'PRESUPUESTO';
  const version = sanitizeSegment(selection.payload.version.label) || 'V01';
  return `${PREFIX[kind]}_${code}_${version}.${EXPORT_EXTENSION[format]}`.toLowerCase();
}

function finalize(
  buffer: Uint8Array,
  fileName: string,
  format: EstimateExportFormat,
  generatedAt: string,
): EstimateExportResult {
  if (buffer.byteLength > EXPORT_MAX_BYTES) {
    throw new EstimateExportSizeError(buffer.byteLength, EXPORT_MAX_BYTES);
  }
  return {
    buffer,
    fileName,
    contentType: EXPORT_MIME[format],
    sizeBytes: buffer.byteLength,
    generatedAt,
  };
}

type Generator = (s: BudgetApuExportSelection) => Promise<Uint8Array>;
const GENERATORS: Record<ApuExportKind, Record<EstimateExportFormat, Generator>> = {
  apu: { xlsx: generateLinkedApuExcel, pdf: generateLinkedApuPdf },
  package: { xlsx: generatePackageExcel, pdf: generatePackagePdf },
};

/**
 * Genera un documento de export APU/paquete (Excel o PDF) en memoria, con
 * nombre sanitizado y límite de tamaño aplicado.
 */
export async function generateApuExport(
  viewer: ViewerContext,
  estimateId: Uuid,
  kind: ApuExportKind,
  format: EstimateExportFormat,
  versionId?: Uuid,
  options: GetEstimatesWriteRepositoryOptions = {},
  deps?: ApuExportSelectionDeps,
): Promise<EstimateExportResult> {
  const selection = await getBudgetApuExportSelection(
    viewer,
    estimateId,
    versionId,
    options,
    deps ?? defaultDeps(options),
  );
  const buffer = await GENERATORS[kind][format](selection);
  const fileName = buildApuExportFileName(selection, kind, format);
  return finalize(buffer, fileName, format, selection.payload.generatedAt);
}

export {
  resolveBudgetApuExportSelection,
  type ApuExportSelectionDeps,
} from './selection';
export { generateLinkedApuExcel, generatePackageExcel, addApuSheets } from './apu-xlsx';
export { generateLinkedApuPdf, generatePackagePdf, buildApuPages } from './apu-pdf';
export { safeCell, cleanText, isFormulaInjection } from './sanitize';
