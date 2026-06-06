/**
 * aiu-actions.ts — Server Action para guardar AIU de la versión activa (4D.2).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/AIU_CRUD_CONTRACT.md §4,§6`.
 *
 * El navegador SOLO envía los 4 porcentajes (humanos). Viewer/versión/directTotal/
 * montos se derivan/recalculan server-side. Errores sanitizados.
 */
'use server';

import {
  getEstimatesWriteRepository,
  AiuValidationError,
  AiuWriteNotSupportedError,
  AiuVersionLockedError,
  EstimateNotFoundError,
} from '@/server/estimates';
import type { AiuRatesInput, FinancialSummary } from '@/lib/estimates/aiu-types';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../../../../mode-guard';

export type AiuActionResult =
  | { ok: true; summary: FinancialSummary }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export async function updateAiuAction(formData: FormData): Promise<AiuActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición de AIU requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  if (!estimateId) return { ok: false, error: 'Presupuesto no especificado.' };

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    const messages: Record<string, string> = {
      no_session: 'No hay sesión activa. Por favor inicia sesión.',
      no_membership: 'No tienes membresía activa en ninguna organización.',
      invalid_role: 'Tu rol no permite realizar esta acción.',
      config: 'Error de configuración del servidor.',
    };
    return { ok: false, error: e instanceof AuthError ? (messages[e.reason] ?? 'Error de autenticación.') : 'Error al verificar la sesión.' };
  }

  const input: AiuRatesInput = {
    administrationRate: (formData.get('administrationRate') as string | null) ?? '',
    contingencyRate: (formData.get('contingencyRate') as string | null) ?? '',
    utilityRate: (formData.get('utilityRate') as string | null) ?? '',
    utilityVatRate: (formData.get('utilityVatRate') as string | null) ?? '',
  };

  try {
    const summary = await getEstimatesWriteRepository().updateEstimateVersionAiu(viewer, estimateId, input);
    return { ok: true, summary };
  } catch (e) {
    if (e instanceof AiuValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { ok: false, fieldErrors };
    }
    if (e instanceof AiuVersionLockedError) return { ok: false, error: e.message };
    if (e instanceof AiuWriteNotSupportedError) return { ok: false, error: e.message };
    if (e instanceof EstimateNotFoundError) return { ok: false, error: 'El presupuesto no existe o no es accesible.' };
    return { ok: false, error: 'No se pudieron guardar los ajustes. Intenta de nuevo.' };
  }
}
