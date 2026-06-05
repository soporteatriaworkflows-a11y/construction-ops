/**
 * actions.ts — Server Action de creación de presupuestos (4B.3).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §7,§8`.
 *
 * Reglas de seguridad:
 *  - Viewer resuelto server-side con `resolveAuthenticatedViewer()`.
 *  - `scopeId` llega del formulario pero se VALIDA server-side (visibilidad RLS).
 *  - `organizationId`, `createdBy`, `code`, `id`, `status` y `projectId` NO se
 *    aceptan del navegador: la RPC deriva `created_by`; `projectId` se deriva del
 *    estimate creado para el redirect.
 *  - Estimate + V01 se crean ATÓMICAMENTE (RPC). Creación exige supabase+db.
 */
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  getEstimatesWriteRepository,
  EstimateValidationError,
  EstimateWriteNotSupportedError,
  ScopeNotFoundError,
} from '@/server/estimates';
import type { CreateEstimateInput } from '@/server/estimates';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../../../mode-guard';

export interface CreateEstimateResult {
  success: false;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createEstimateAction(
  _prevState: CreateEstimateResult | null,
  formData: FormData,
): Promise<CreateEstimateResult> {
  // 1. Requisito de modo
  if (!isCreationModeEnabled()) {
    return {
      success: false,
      error:
        'La creación de presupuestos no está disponible en modo demostración. ' +
        'Se requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.',
    };
  }

  // 2. scopeId del formulario (se valida server-side vía RLS en el repo).
  const scopeId = (formData.get('scopeId') as string | null)?.trim() ?? '';
  if (!scopeId) {
    return { success: false, error: 'Alcance no especificado.' };
  }

  // 3. Resolver viewer real (deny-by-default)
  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    if (e instanceof AuthError) {
      const messages: Record<string, string> = {
        no_session: 'No hay sesión activa. Por favor inicia sesión.',
        no_membership:
          'No tienes membresía activa en ninguna organización. Contacta al administrador.',
        invalid_role: 'Tu rol no permite realizar esta acción.',
        config: 'Error de configuración del servidor.',
      };
      return { success: false, error: messages[e.reason] ?? 'Error de autenticación.' };
    }
    return { success: false, error: 'Error al verificar la sesión. Intenta de nuevo.' };
  }

  // 4. Extraer SOLO campos permitidos (jamás scope_id confiado, org, created_by…).
  const input: CreateEstimateInput = {
    name: (formData.get('name') as string | null) ?? '',
    description: (formData.get('description') as string | null) ?? undefined,
  };
  if (!input.description?.trim()) {
    delete input.description;
  }

  // 5. Crear estimate + V01 (atómico). projectId se DERIVA del estimate creado.
  let redirectTo: string;
  let scopeDetailPath: string;
  try {
    const repo = getEstimatesWriteRepository();
    const estimate = await repo.insertEstimateWithInitialVersion(viewer, scopeId, input);
    scopeDetailPath = `/projects/${estimate.projectId}/scopes/${scopeId}`;
    redirectTo = `${scopeDetailPath}/estimates/${estimate.id}`;
  } catch (e) {
    if (e instanceof EstimateValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { success: false, fieldErrors };
    }
    if (e instanceof ScopeNotFoundError) {
      return { success: false, error: 'El alcance no existe o no es accesible.' };
    }
    if (e instanceof EstimateWriteNotSupportedError) {
      return {
        success: false,
        error:
          'La creación de presupuestos no está disponible en modo demostración. ' +
          'Se requiere READ_MODEL_SOURCE=db.',
      };
    }
    return {
      success: false,
      error: 'No se pudo crear el presupuesto. Intenta de nuevo o contacta a soporte.',
    };
  }

  // 6. Éxito: revalidar el detalle del alcance y redirigir al presupuesto.
  revalidatePath(scopeDetailPath);
  redirect(redirectTo);
}
