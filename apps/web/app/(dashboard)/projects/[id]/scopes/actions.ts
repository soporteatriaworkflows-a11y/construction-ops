/**
 * actions.ts — Server Action de creación de alcances (4B.2).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §7,§8`.
 *
 * Reglas de seguridad:
 *  - Viewer resuelto server-side con `resolveAuthenticatedViewer()`.
 *  - `organization_id`, `created_by`, `code`, `id`, `status` del navegador IGNORADOS.
 *  - `projectId` llega del formulario pero se VALIDA server-side (el repositorio
 *    verifica visibilidad por RLS; cross-org ⇒ ProjectNotFoundError).
 *  - Creación exige APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db.
 *  - Sin service-role. Sin open redirect. Errores sanitizados (sin SQL/stack).
 */
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  getScopesWriteRepository,
  ScopeValidationError,
  ScopeWriteNotSupportedError,
  ProjectNotFoundError,
} from '@/server/scopes';
import type { CreateScopeInput, ScopeType } from '@/server/scopes';
import { SCOPE_TYPES } from '@/server/scopes';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../mode-guard';

/** Resultado de la action (éxito o errores legibles). */
export interface CreateScopeResult {
  success: false;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseScopeType(raw: unknown): ScopeType | undefined {
  return typeof raw === 'string' && (SCOPE_TYPES as readonly string[]).includes(raw)
    ? (raw as ScopeType)
    : undefined;
}

/**
 * Server Action: crea un alcance en un proyecto del viewer autenticado.
 * `redirect()` se llama FUERA del try/catch (Next 16 lanza NEXT_REDIRECT).
 */
export async function createScopeAction(
  _prevState: CreateScopeResult | null,
  formData: FormData,
): Promise<CreateScopeResult> {
  // 1. Requisito de modo
  if (!isCreationModeEnabled()) {
    return {
      success: false,
      error:
        'La creación de alcances no está disponible en modo demostración. ' +
        'Se requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.',
    };
  }

  // 2. projectId del formulario (se valida server-side vía RLS en el repo).
  const projectId = (formData.get('projectId') as string | null)?.trim() ?? '';
  if (!projectId) {
    return { success: false, error: 'Proyecto no especificado.' };
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

  // 4. Extraer SOLO campos permitidos (jamás org_id, created_by, code, id, status).
  const input: CreateScopeInput = {
    name: (formData.get('name') as string | null) ?? '',
    scopeType: parseScopeType(formData.get('scopeType')) ?? ('' as ScopeType),
    description: (formData.get('description') as string | null) ?? undefined,
  };
  if (!input.description?.trim()) {
    delete input.description;
  }

  // 5. Crear
  let scopeId: string;
  try {
    const repo = getScopesWriteRepository();
    const scope = await repo.insertScope(viewer, projectId, input);
    scopeId = scope.id;
  } catch (e) {
    if (e instanceof ScopeValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { success: false, fieldErrors };
    }
    if (e instanceof ProjectNotFoundError) {
      return { success: false, error: 'El proyecto no existe o no es accesible.' };
    }
    if (e instanceof ScopeWriteNotSupportedError) {
      return {
        success: false,
        error:
          'La creación de alcances no está disponible en modo demostración. ' +
          'Se requiere READ_MODEL_SOURCE=db.',
      };
    }
    return {
      success: false,
      error: 'No se pudo crear el alcance. Intenta de nuevo o contacta a soporte.',
    };
  }

  // 6. Éxito: revalidar el detalle del proyecto y redirigir al alcance.
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/scopes/${scopeId}`);
}
