/**
 * actions.ts — Server Actions de importación de lista de precios de proveedor
 * (CATALOG_BULK_ONBOARDING_V1, contrato §6).
 *
 * Cada precio importado crea una observación `pending` (NUNCA approved) del
 * proveedor seleccionado. Sin match ⇒ "Sin asociar" (no se crean recursos).
 */
'use server';

import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import {
  previewProviderPriceList,
  confirmProviderPriceList,
  CatalogImportFileError,
  CatalogImportParseError,
  CatalogImportDigestMismatchError,
  CatalogImportNotImportableError,
  CatalogImportNotSupportedError,
  CatalogImportProviderNotFoundError,
} from '@/server/catalog/import';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import type {
  ColumnAssignment,
  PriceListPreview,
  PriceListResult,
} from '@/lib/catalog-import/types';

export type PriceListPreviewActionResult =
  | { ok: true; preview: PriceListPreview }
  | { ok: false; error: string };

export type PriceListConfirmActionResult =
  | { ok: true; result: PriceListResult }
  | { ok: false; error: string };

const MAPPING_LIMIT = 64;

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
    e instanceof CatalogImportNotSupportedError ||
    e instanceof CatalogImportProviderNotFoundError
  ) {
    return e.message;
  }
  if (e instanceof InsufficientRoleError) {
    return 'Tu rol no permite importar listas de precios.';
  }
  return 'No se pudo procesar el archivo. Verifica el formato e intenta de nuevo.';
}

export async function previewPriceListAction(
  formData: FormData,
): Promise<PriceListPreviewActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const providerId = (formData.get('providerId') as string | null)?.trim() ?? '';
  if (!providerId) return { ok: false, error: 'Selecciona un proveedor.' };

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.' };
  }
  try {
    const mapping = parseMappingInput(formData.get('mapping'));
    const preview = await previewProviderPriceList(viewer, providerId, formData.get('file'), mapping);
    return { ok: true, preview };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}

export async function confirmPriceListAction(
  formData: FormData,
): Promise<PriceListConfirmActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const providerId = (formData.get('providerId') as string | null)?.trim() ?? '';
  const digest = (formData.get('digest') as string | null)?.trim() ?? '';
  if (!providerId) return { ok: false, error: 'Selecciona un proveedor.' };
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
    const result = await confirmProviderPriceList(viewer, providerId, formData.get('file'), mapping, digest);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}
