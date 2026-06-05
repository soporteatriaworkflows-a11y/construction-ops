/**
 * index.ts — Importación de Excel hacia la versión activa del presupuesto (4C.1).
 *
 * Propiedad: agent-db-rls / agent-excel-mapper. Contrato:
 * `docs/EXCEL_IMPORT_CONTRACT.md §3`.
 *
 * Flujo de DOS pasos sin persistir el archivo original:
 *  - `previewEstimateExcelImport`: parsea + valida, NO escribe (digest SHA-256).
 *  - `confirmEstimateExcelImport`: re-parsea, recalcula digest, lo compara con el
 *    del preview y, si coincide, importa atómicamente vía la RPC
 *    `import_boq_into_version` (capítulos + ítems en una transacción).
 *  - `getEstimateImportStatus`: estado de la versión activa (vacía/importada).
 *
 * Seguridad: viewer/identidad server-side; estimate validado por visibilidad RLS;
 * subtotales/total recalculados server-side; sin service-role; sin fallback fixture.
 */
import { createClient } from '@/lib/supabase/server';
import { resolveSource } from '@/server/read-model';
import { getEstimatesWriteRepository } from '@/server/estimates';
import { IMPORT_LIMITS, type ImportPreview, type ImportResult, type ImportStatus } from '@/lib/import/types';
import { parseBoqWorkbook } from './parse';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext, Uuid } from '@/lib/contracts/read-model';
import {
  EstimateNotFoundError,
  ImportDigestMismatchError,
  ImportFileError,
  ImportHasErrorsError,
  ImportNotSupportedError,
  ImportVersionLockedError,
  ImportVersionNotEmptyError,
} from './errors';

function assertFile(file: unknown): asserts file is File {
  if (!(file instanceof File) || file.size === 0) {
    throw new ImportFileError('Selecciona un archivo .xlsx válido.');
  }
  if (!/\.xlsx$/i.test(file.name)) {
    throw new ImportFileError('Solo se admiten archivos .xlsx.');
  }
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    const mb = (IMPORT_LIMITS.maxFileBytes / (1024 * 1024)).toFixed(0);
    throw new ImportFileError(`El archivo supera el tamaño máximo de ${mb} MB.`);
  }
}

/**
 * Valida que el presupuesto sea visible y que su versión activa sea importable
 * (draft + vacía). Devuelve el id de la versión activa.
 */
async function assertImportableVersion(
  viewer: ViewerContext,
  estimateId: Uuid,
): Promise<Uuid> {
  const repo = getEstimatesWriteRepository();
  // getEstimateById lanza EstimateNotFoundError si cross-org/inexistente.
  await repo.getEstimateById(viewer, estimateId);
  const active = await repo.getEstimateActiveVersion(viewer, estimateId);
  if (!active) {
    throw new EstimateNotFoundError(estimateId);
  }
  if (active.status !== 'draft') {
    throw new ImportVersionLockedError();
  }
  if (active.chapterCount > 0 || active.itemCount > 0) {
    throw new ImportVersionNotEmptyError();
  }
  return active.id;
}

/** Paso A — preview sin escritura. */
export async function previewEstimateExcelImport(
  viewer: AuthenticatedViewer,
  estimateId: Uuid,
  file: unknown,
): Promise<ImportPreview> {
  assertFile(file);
  await assertImportableVersion(viewer, estimateId);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { preview } = parseBoqWorkbook(buffer, file.name);
  return preview;
}

/** Paso B — confirmación: re-parse + digest + import atómico (RPC). */
export async function confirmEstimateExcelImport(
  viewer: AuthenticatedViewer,
  estimateId: Uuid,
  file: unknown,
  expectedDigest: string,
): Promise<ImportResult> {
  if (resolveSource(process.env.READ_MODEL_SOURCE) !== 'db') {
    throw new ImportNotSupportedError();
  }
  assertFile(file);
  const versionId = await assertImportableVersion(viewer, estimateId);

  const buffer = Buffer.from(await file.arrayBuffer());
  const { preview, normalized } = parseBoqWorkbook(buffer, file.name);

  // El archivo confirmado debe coincidir EXACTAMENTE con el del preview.
  if (!expectedDigest || preview.digest !== expectedDigest) {
    throw new ImportDigestMismatchError();
  }
  // No se confirma si el preview tiene errores bloqueantes (diagnóstico agregado).
  if (!preview.importable) {
    throw new ImportHasErrorsError();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_boq_into_version', {
    p_version_id: versionId,
    p_chapters: normalized.chapters,
    p_items: normalized.items,
  });

  if (error) {
    const msg = `${error.message ?? ''}`;
    if (msg.includes('version_not_empty')) throw new ImportVersionNotEmptyError();
    if (msg.includes('version_locked')) throw new ImportVersionLockedError();
    if (msg.includes('version_not_found')) throw new EstimateNotFoundError(estimateId);
    throw new Error(`import_failed: ${error.code ?? 'unknown'}`);
  }

  const result = (data ?? {}) as { chapterCount?: number; itemCount?: number; directTotal?: string };
  return {
    chapterCount: result.chapterCount ?? 0,
    itemCount: result.itemCount ?? 0,
    directTotal: result.directTotal ?? '0',
  };
}

/** Estado de importación de la versión activa (vacía vs importada). */
export async function getEstimateImportStatus(
  viewer: ViewerContext,
  estimateId: Uuid,
): Promise<ImportStatus> {
  const repo = getEstimatesWriteRepository();
  const active = await repo.getEstimateActiveVersion(viewer, estimateId);
  if (!active) {
    return {
      versionId: null,
      versionNumber: null,
      status: null,
      chapterCount: 0,
      itemCount: 0,
      hasContent: false,
      importable: false,
    };
  }
  const hasContent = active.chapterCount > 0 || active.itemCount > 0;
  return {
    versionId: active.id,
    versionNumber: active.versionNumber,
    status: active.status,
    chapterCount: active.chapterCount,
    itemCount: active.itemCount,
    hasContent,
    importable: active.status === 'draft' && !hasContent,
  };
}

export {
  ImportFileError,
  ImportVersionNotEmptyError,
  ImportVersionLockedError,
  ImportDigestMismatchError,
  ImportHasErrorsError,
  ImportNotSupportedError,
} from './errors';
export { ExcelParseError } from './parse';
