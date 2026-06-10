/**
 * actions.ts — Server Actions de catalogo de recursos (Bootstrap CTAs).
 *
 * Propiedad: agent-frontend-boq.
 *
 * Reglas de seguridad:
 *  - Viewer resuelto server-side. organization_id y created_by nunca del navegador.
 *  - Solo APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db permite escritura.
 *  - Errores sanitizados (sin SQL/stack).
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import {
  getResourceRepository,
  ResourceValidationError,
  ResourceWriteNotSupportedError,
} from '@/server/catalog';
import type { ResourceCreateInput } from '@/server/catalog';

export interface ResourceActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  resourceId?: string;
}

function handleAuthError(e: unknown): ResourceActionResult {
  if (e instanceof AuthError) {
    const msgs: Record<string, string> = {
      no_session: 'No hay sesion activa.',
      no_membership: 'No tienes membresia activa.',
      invalid_role: 'Tu rol no permite esta accion.',
      config: 'Error de configuracion.',
    };
    return { success: false, error: msgs[e.reason] ?? 'Error de autenticacion.' };
  }
  return { success: false, error: 'Error al verificar la sesion.' };
}

export async function createResourceAction(
  _prevState: ResourceActionResult | null,
  formData: FormData,
): Promise<ResourceActionResult> {
  if (!isCreationModeEnabled()) {
    return {
      success: false,
      error: 'Creacion no disponible en modo demostracion.',
    };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return handleAuthError(e);
  }

  if (!(['management', 'internal'] as string[]).includes(viewer.role)) {
    return {
      success: false,
      error: 'Solo admin y gerencia pueden crear recursos.',
    };
  }

  const input: ResourceCreateInput = {
    code: (formData.get('code') as string | null) ?? '',
    name: (formData.get('name') as string | null) ?? '',
    resourceType: ((formData.get('resourceType') as string | null) ??
      'material') as ResourceCreateInput['resourceType'],
    unit: (formData.get('unit') as string | null) ?? '',
  };

  try {
    const repo = getResourceRepository();
    const resource = await repo.createResource(viewer, input);
    revalidatePath('/catalog');
    return { success: true, resourceId: resource.id };
  } catch (e) {
    if (e instanceof ResourceValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { success: false, fieldErrors };
    }
    if (e instanceof ResourceWriteNotSupportedError) {
      return { success: false, error: 'Escritura no disponible en modo fixture.' };
    }
    return {
      success: false,
      error: 'No se pudo crear el recurso. Intenta de nuevo.',
    };
  }
}
