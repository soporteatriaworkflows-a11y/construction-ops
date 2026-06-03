/**
 * actions.ts — Server Action de creación de proyectos (4B.1).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §7,§8`.
 *
 * Reglas de seguridad:
 *  - Viewer resuelto server-side con `resolveAuthenticatedViewer()`.
 *  - `organization_id`, `created_by`, `code`, `id`, `role` del navegador son IGNORADOS.
 *  - Creación exige APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db.
 *  - Sin servicio-role. Sin open redirect. Errores sanitizados (sin SQL/stack).
 *
 * NOTA: `isCreationModeEnabled` vive en `./mode-guard.ts` (función síncrona pura)
 * para evitar conflicto con la directiva 'use server' (que exige que todas las
 * exportaciones sean funciones async).
 */
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  getProjectsWriteRepository,
  ProjectValidationError,
  ProjectWriteNotSupportedError,
} from '@/server/projects';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from './mode-guard';
import type { CreateProjectInput } from '@/server/projects/types';

/** Resultado de la action (éxito o errores de campo legibles). */
export interface CreateProjectResult {
  success: false;
  /** Error general (auth, modo, inesperado). */
  error?: string;
  /** Errores por campo (validación del input). */
  fieldErrors?: Record<string, string>;
}

/**
 * Server Action: crea un proyecto en la organización del viewer autenticado.
 *
 * Flujo:
 * 1. Valida el modo (solo supabase+db).
 * 2. Resuelve el viewer real (session→profiles). Deny sin sesión/membresía/rol.
 * 3. Extrae SOLO los campos permitidos del FormData (ignora org_id, created_by, code, id, role).
 * 4. Llama al repositorio de escritura.
 * 5. En éxito: revalida /projects y redirige al detalle.
 * 6. En error: retorna resultado con mensajes sanitizados.
 *
 * IMPORTANTE (Next.js 16): `redirect()` se llama FUERA del try/catch porque
 * lanza internamente una excepción especial (`NEXT_REDIRECT`) que no debe capturarse.
 */
export async function createProjectAction(
  _prevState: CreateProjectResult | null,
  formData: FormData,
): Promise<CreateProjectResult> {
  // 1. Requisito de modo (contrato §7.2)
  if (!isCreationModeEnabled()) {
    return {
      success: false,
      error:
        'La creación de proyectos no está disponible en modo demostración. ' +
        'Se requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.',
    };
  }

  // 2. Resolver viewer real (deny-by-default)
  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    if (e instanceof AuthError) {
      // Mensaje legible según motivo; sin detalles de sesión interna
      const messages: Record<string, string> = {
        no_session: 'No hay sesión activa. Por favor inicia sesión.',
        no_membership:
          'No tienes membresía activa en ninguna organización. Contacta al administrador.',
        invalid_role: 'Tu rol no permite realizar esta acción.',
        config: 'Error de configuración del servidor.',
      };
      return {
        success: false,
        error: messages[e.reason] ?? 'Error de autenticación.',
      };
    }
    return {
      success: false,
      error: 'Error al verificar la sesión. Intenta de nuevo.',
    };
  }

  // 3. Extraer SOLO campos permitidos del FormData
  //    NUNCA leer organization_id, created_by, code, id, role del navegador.
  const input: CreateProjectInput = {
    name: (formData.get('name') as string | null) ?? '',
    city: (formData.get('city') as string | null) ?? '',
    description: (formData.get('description') as string | null) ?? undefined,
    initialStatus: 'active', // único valor permitido en 4B.1; forzado server-side
  };

  // Limpiar description vacía para no enviar string vacío
  if (!input.description?.trim()) {
    delete input.description;
  }

  // 4. Llamar al repositorio
  let projectId: string;
  try {
    const repo = getProjectsWriteRepository();
    const project = await repo.createProject(viewer, input);
    projectId = project.id;
  } catch (e) {
    if (e instanceof ProjectValidationError) {
      // Traducir issues de validación a mensajes por campo
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        fieldErrors[issue.field] = issue.message;
      }
      return { success: false, fieldErrors };
    }
    if (e instanceof ProjectWriteNotSupportedError) {
      return {
        success: false,
        error:
          'La creación de proyectos no está disponible en modo demostración. ' +
          'Se requiere READ_MODEL_SOURCE=db.',
      };
    }
    // Error inesperado — sanitizar; sin SQL/stack
    return {
      success: false,
      error: 'No se pudo crear el proyecto. Intenta de nuevo o contacta a soporte.',
    };
  }

  // 5. Éxito: revalidar la lista y redirigir al detalle.
  //    redirect() DEBE llamarse FUERA del try/catch (Next.js 16: lanza NEXT_REDIRECT).
  revalidatePath('/projects');
  redirect(`/projects/${projectId}`);
}
