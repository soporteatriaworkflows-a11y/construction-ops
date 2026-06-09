/**
 * version-actions.ts — Server Actions de emisión/clonación de versiones (4E.3A).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/ESTIMATE_ISSUE_CLONE_CONTRACT.md`.
 *
 * El navegador solo envía `estimateId`. Viewer/organización/`issued_by` se derivan
 * server-side. Errores sanitizados. Requiere modo supabase+db.
 */
'use server';

import {
  getEstimatesWriteRepository,
  BoqWriteNotSupportedError,
  EstimateNotFoundError,
  VersionNotDraftError,
  VersionNotIssuedError,
} from '@/server/estimates';
import type { EstimateVersionSummary } from '@/lib/estimates/version-types';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../../../../mode-guard';

export type VersionActionResult =
  | { ok: true; version: EstimateVersionSummary }
  | { ok: false; error: string };

const AUTH_MESSAGES: Record<string, string> = {
  no_session: 'No hay sesión activa. Por favor inicia sesión.',
  no_membership: 'No tienes membresía activa en ninguna organización.',
  invalid_role: 'Tu rol no permite realizar esta acción.',
  config: 'Error de configuración del servidor.',
};

function mapError(e: unknown): VersionActionResult {
  if (e instanceof VersionNotDraftError) return { ok: false, error: e.message };
  if (e instanceof VersionNotIssuedError) return { ok: false, error: e.message };
  if (e instanceof BoqWriteNotSupportedError) return { ok: false, error: e.message };
  if (e instanceof EstimateNotFoundError) return { ok: false, error: 'El presupuesto no existe o no es accesible.' };
  return { ok: false, error: 'No se pudo completar la operación. Intenta de nuevo.' };
}

async function run(
  formData: FormData,
  op: (
    repo: ReturnType<typeof getEstimatesWriteRepository>,
    viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>,
    estimateId: string,
  ) => Promise<EstimateVersionSummary>,
): Promise<VersionActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La gestión de versiones requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  if (!estimateId) return { ok: false, error: 'Presupuesto no especificado.' };
  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? (AUTH_MESSAGES[e.reason] ?? 'Error de autenticación.') : 'Error al verificar la sesión.' };
  }
  try {
    const version = await op(getEstimatesWriteRepository(), viewer, estimateId);
    return { ok: true, version };
  } catch (e) {
    return mapError(e);
  }
}

export async function issueVersionAction(formData: FormData): Promise<VersionActionResult> {
  return run(formData, (repo, viewer, estimateId) => repo.issueEstimateVersion(viewer, estimateId));
}
export async function cloneVersionAction(formData: FormData): Promise<VersionActionResult> {
  return run(formData, (repo, viewer, estimateId) => repo.cloneIssuedEstimateVersion(viewer, estimateId));
}
