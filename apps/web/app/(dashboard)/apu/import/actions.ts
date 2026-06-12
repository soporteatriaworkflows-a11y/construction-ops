/**
 * actions.ts — Server Actions del importador APU
 * (ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1, contrato §6–§8).
 *
 * Dos pasos, sin persistir el archivo:
 *  - `previewApuImportAction`: parsea + matchea, NO escribe; preview + digest.
 *  - `confirmApuImportAction`: re-parsea, compara digest, re-valida aceptes y
 *    ejecuta UNA transacción atómica (RPC RLS-bound).
 *
 * Seguridad: modo supabase+db, viewer server-side, errores sanitizados; los
 * aceptes de sugerencias y la versión objetivo son INTENCIÓN del cliente y se
 * re-validan server-side.
 */
'use server';

import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import {
  previewApuImport,
  confirmApuImport,
  listApuLinkableVersions,
  ApuImportFileError,
  ApuImportParseError,
  ApuSheetNotFoundError,
  ApuImportDigestMismatchError,
  ApuImportNotImportableError,
  ApuImportNotSupportedError,
  ApuSuggestionRejectedError,
  ApuLinkVersionInvalidError,
} from '@/server/apu-import';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import type {
  AcceptedSuggestion,
  ApuImportPreview,
  ApuImportResult,
  LinkableVersionOption,
} from '@/lib/apu-import/types';

export type ApuPreviewActionResult =
  | { ok: true; preview: ApuImportPreview; linkableVersions: LinkableVersionOption[] }
  | { ok: false; error: string };

export type ApuConfirmActionResult =
  | { ok: true; result: ApuImportResult }
  | { ok: false; error: string };

const ACCEPT_LIMIT = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLinkVersionId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/** Aceptes del cliente como intención mínima (re-validados server-side). */
function parseAcceptedSuggestions(raw: FormDataEntryValue | null): AcceptedSuggestion[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: AcceptedSuggestion[] = [];
  for (const entry of data.slice(0, ACCEPT_LIMIT)) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { componentKey?: unknown }).componentKey === 'string' &&
      typeof (entry as { resourceId?: unknown }).resourceId === 'string' &&
      UUID_RE.test((entry as { resourceId: string }).resourceId)
    ) {
      out.push({
        componentKey: (entry as { componentKey: string }).componentKey,
        resourceId: (entry as { resourceId: string }).resourceId,
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
    e instanceof ApuImportFileError ||
    e instanceof ApuImportParseError ||
    e instanceof ApuSheetNotFoundError ||
    e instanceof ApuImportDigestMismatchError ||
    e instanceof ApuImportNotImportableError ||
    e instanceof ApuImportNotSupportedError ||
    e instanceof ApuSuggestionRejectedError ||
    e instanceof ApuLinkVersionInvalidError
  ) {
    return e.message;
  }
  if (e instanceof InsufficientRoleError) {
    return 'Tu rol no permite importar APU.';
  }
  return 'No se pudo procesar el workbook. Verifica el archivo e intenta de nuevo.';
}

export async function previewApuImportAction(
  formData: FormData,
): Promise<ApuPreviewActionResult> {
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
      previewApuImport(viewer, formData.get('file'), linkVersionId),
      listApuLinkableVersions(viewer),
    ]);
    return { ok: true, preview, linkableVersions };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}

export async function confirmApuImportAction(
  formData: FormData,
): Promise<ApuConfirmActionResult> {
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
    const result = await confirmApuImport(viewer, formData.get('file'), digest, {
      linkVersionId: parseLinkVersionId(formData.get('linkVersionId')),
      acceptedSuggestions: parseAcceptedSuggestions(formData.get('acceptedSuggestions')),
    });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}
