/**
 * actions.ts — Server Actions de importación de Excel (4C.1).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/EXCEL_IMPORT_CONTRACT.md §2,§3`.
 *
 * Dos pasos, sin persistir el archivo:
 *  - `previewExcelImportAction`: parsea + valida, NO escribe; devuelve preview+digest.
 *  - `confirmExcelImportAction`: re-parsea, compara digest e importa atómicamente.
 *
 * Seguridad: modo supabase+db, viewer autenticado server-side, errores sanitizados.
 * El `estimateId` se valida por visibilidad RLS dentro del repositorio.
 */
'use server';

import {
  previewEstimateExcelImport,
  confirmEstimateExcelImport,
  ExcelParseError,
  ImportFileError,
  ImportVersionNotEmptyError,
  ImportVersionLockedError,
  ImportDigestMismatchError,
  ImportHasErrorsError,
  ImportNotSupportedError,
} from '@/server/estimates/import';
import { EstimateNotFoundError } from '@/server/estimates';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../../../../../mode-guard';
import type { ImportPreview, ImportResult, MappingOverride } from '@/lib/import/types';

/** Parsea de forma segura los overrides de mapping enviados por el cliente. */
function parseOverrides(raw: FormDataEntryValue | null): MappingOverride[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: MappingOverride[] = [];
  for (const e of data.slice(0, IMPORT_OVERRIDE_LIMIT)) {
    if (
      e &&
      typeof e === 'object' &&
      ((e as { rowType?: unknown }).rowType === 'chapter' || (e as { rowType?: unknown }).rowType === 'item') &&
      Number.isInteger((e as { sourceRow?: unknown }).sourceRow) &&
      typeof (e as { canonicalCode?: unknown }).canonicalCode === 'string'
    ) {
      const o = e as MappingOverride;
      out.push({ rowType: o.rowType, sourceRow: o.sourceRow, canonicalCode: o.canonicalCode.trim().slice(0, 60) });
    }
  }
  return out;
}
const IMPORT_OVERRIDE_LIMIT = 6000;

export type PreviewActionResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string; detectedSheets?: string[] };

export type ConfirmActionResult =
  | { ok: true; result: ImportResult }
  | { ok: false; error: string };

function authMessage(e: AuthError): string {
  const messages: Record<string, string> = {
    no_session: 'No hay sesión activa. Por favor inicia sesión.',
    no_membership: 'No tienes membresía activa en ninguna organización.',
    invalid_role: 'Tu rol no permite realizar esta acción.',
    config: 'Error de configuración del servidor.',
  };
  return messages[e.reason] ?? 'Error de autenticación.';
}

function sanitizeError(e: unknown): string {
  if (e instanceof ImportFileError) return e.message;
  if (e instanceof ExcelParseError) return e.message;
  if (e instanceof ImportVersionNotEmptyError) return e.message;
  if (e instanceof ImportVersionLockedError) return e.message;
  if (e instanceof ImportDigestMismatchError) return e.message;
  if (e instanceof ImportHasErrorsError) return e.message;
  if (e instanceof ImportNotSupportedError) return e.message;
  if (e instanceof EstimateNotFoundError) return 'El presupuesto no existe o no es accesible.';
  return 'No se pudo procesar el archivo. Verifica el formato e intenta de nuevo.';
}

export async function previewExcelImportAction(
  formData: FormData,
): Promise<PreviewActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  const file = formData.get('file');
  if (!estimateId) return { ok: false, error: 'Presupuesto no especificado.' };

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.' };
  }

  try {
    const overrides = parseOverrides(formData.get('overrides'));
    const preview = await previewEstimateExcelImport(viewer, estimateId, file, overrides);
    return { ok: true, preview };
  } catch (e) {
    const detectedSheets = e instanceof ExcelParseError ? e.detectedSheets : undefined;
    return { ok: false, error: sanitizeError(e), ...(detectedSheets ? { detectedSheets } : {}) };
  }
}

export async function confirmExcelImportAction(
  formData: FormData,
): Promise<ConfirmActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  const digest = (formData.get('digest') as string | null)?.trim() ?? '';
  const file = formData.get('file');
  if (!estimateId) return { ok: false, error: 'Presupuesto no especificado.' };
  if (!digest) return { ok: false, error: 'Falta la vista previa. Analiza el archivo antes de confirmar.' };

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.' };
  }

  try {
    const overrides = parseOverrides(formData.get('overrides'));
    const result = await confirmEstimateExcelImport(viewer, estimateId, file, digest, overrides);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}
