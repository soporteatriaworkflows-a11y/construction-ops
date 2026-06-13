/**
 * actions.ts — Server Actions del importador de memorias de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1, contrato §9, §12).
 *
 * Dos pasos, sin persistir el archivo:
 *  - `previewQuantityImportAction`: parsea + matchea, NO escribe; preview + digest.
 *  - `confirmQuantityImportAction`: re-parsea, compara digest, re-matchea
 *    server-side y ejecuta UNA transacción atómica (RPC RLS-bound).
 *
 * Seguridad: modo supabase+db, viewer server-side, errores sanitizados; la
 * versión objetivo es INTENCIÓN del cliente y se re-valida server-side.
 */
'use server';

import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import {
  previewQuantityImport,
  confirmQuantityImport,
  listQuantityLinkableVersions,
  QuantityImportFileError,
  QuantityImportParseError,
  QuantitySheetNotFoundError,
  QuantityImportDigestMismatchError,
  QuantityImportNotImportableError,
  QuantityImportNotSupportedError,
  QuantityLinkVersionInvalidError,
} from '@/server/quantity-import';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import type {
  QuantityImportPreview,
  QuantityImportResult,
  TakeoffLinkableVersion,
} from '@/lib/quantity-import/types';

export type QuantityPreviewActionResult =
  | { ok: true; preview: QuantityImportPreview; linkableVersions: TakeoffLinkableVersion[] }
  | { ok: false; error: string };

export type QuantityConfirmActionResult =
  | { ok: true; result: QuantityImportResult }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLinkVersionId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
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
    e instanceof QuantityImportFileError ||
    e instanceof QuantityImportParseError ||
    e instanceof QuantitySheetNotFoundError ||
    e instanceof QuantityImportDigestMismatchError ||
    e instanceof QuantityImportNotImportableError ||
    e instanceof QuantityImportNotSupportedError ||
    e instanceof QuantityLinkVersionInvalidError
  ) {
    return e.message;
  }
  if (e instanceof InsufficientRoleError) {
    return 'Tu rol no permite importar memorias de cantidades.';
  }
  return 'No se pudo procesar el workbook. Verifica el archivo e intenta de nuevo.';
}

export async function previewQuantityImportAction(
  formData: FormData,
): Promise<QuantityPreviewActionResult> {
  if (!isCreationModeEnabled()) {
    return {
      ok: false,
      error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.',
    };
  }
  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.',
    };
  }
  try {
    const linkVersionId = parseLinkVersionId(formData.get('linkVersionId'));
    const [preview, linkableVersions] = await Promise.all([
      previewQuantityImport(viewer, formData.get('file'), linkVersionId),
      listQuantityLinkableVersions(viewer),
    ]);
    return { ok: true, preview, linkableVersions };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}

export async function confirmQuantityImportAction(
  formData: FormData,
): Promise<QuantityConfirmActionResult> {
  if (!isCreationModeEnabled()) {
    return {
      ok: false,
      error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.',
    };
  }
  const digest = (formData.get('digest') as string | null)?.trim() ?? '';
  if (!digest) {
    return { ok: false, error: 'Falta la vista previa. Analiza el workbook antes de confirmar.' };
  }
  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.',
    };
  }
  try {
    const result = await confirmQuantityImport(viewer, formData.get('file'), digest, {
      linkVersionId: parseLinkVersionId(formData.get('linkVersionId')),
    });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}
