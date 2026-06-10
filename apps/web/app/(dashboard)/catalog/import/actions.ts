/**
 * actions.ts — Server Actions de importación masiva de catálogo
 * (CATALOG_BULK_ONBOARDING_V1, contrato §4–§5).
 *
 * Dos pasos, sin persistir el archivo:
 *  - `previewCatalogImportAction`: parsea + valida, NO escribe; preview+digest.
 *  - `confirmCatalogImportAction`: re-parsea, compara digest e importa por lotes.
 *
 * Seguridad: modo supabase+db, viewer server-side, errores sanitizados,
 * mapeo del cliente tratado como intención (re-validado server-side).
 */
'use server';

import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import {
  previewCatalogImport,
  confirmCatalogImport,
  CatalogImportFileError,
  CatalogImportParseError,
  CatalogImportDigestMismatchError,
  CatalogImportNotImportableError,
  CatalogImportNotSupportedError,
} from '@/server/catalog/import';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import type {
  CatalogImportPreview,
  CatalogImportResult,
  ColumnAssignment,
} from '@/lib/catalog-import/types';

export type CatalogPreviewActionResult =
  | { ok: true; preview: CatalogImportPreview }
  | { ok: false; error: string };

export type CatalogConfirmActionResult =
  | { ok: true; result: CatalogImportResult }
  | { ok: false; error: string };

const MAPPING_LIMIT = 64;

/** Parsea el mapeo enviado por el cliente como intención mínima (validado luego). */
function parseMappingInput(raw: FormDataEntryValue | null): ColumnAssignment[] | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const out: ColumnAssignment[] = [];
  for (const e of data.slice(0, MAPPING_LIMIT)) {
    if (e && typeof e === 'object' && typeof (e as { field?: unknown }).field === 'string') {
      const idx = (e as { columnIndex?: unknown }).columnIndex;
      out.push({
        field: (e as { field: string }).field,
        columnIndex: typeof idx === 'number' && Number.isInteger(idx) ? idx : null,
      });
    }
  }
  return out;
}

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
  if (
    e instanceof CatalogImportFileError ||
    e instanceof CatalogImportParseError ||
    e instanceof CatalogImportDigestMismatchError ||
    e instanceof CatalogImportNotImportableError ||
    e instanceof CatalogImportNotSupportedError
  ) {
    return e.message;
  }
  if (e instanceof InsufficientRoleError) {
    return 'Tu rol no permite importar al catálogo.';
  }
  return 'No se pudo procesar el archivo. Verifica el formato e intenta de nuevo.';
}

export async function previewCatalogImportAction(
  formData: FormData,
): Promise<CatalogPreviewActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.' };
  }
  try {
    const mapping = parseMappingInput(formData.get('mapping'));
    const preview = await previewCatalogImport(viewer, formData.get('file'), mapping);
    return { ok: true, preview };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}

export async function confirmCatalogImportAction(
  formData: FormData,
): Promise<CatalogConfirmActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const digest = (formData.get('digest') as string | null)?.trim() ?? '';
  if (!digest) {
    return { ok: false, error: 'Falta la vista previa. Analiza el archivo antes de confirmar.' };
  }
  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.' };
  }
  try {
    const mapping = parseMappingInput(formData.get('mapping'));
    const result = await confirmCatalogImport(viewer, formData.get('file'), mapping, digest);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}
