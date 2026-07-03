/**
 * actions.ts — Server Actions de proveedores (Price Intelligence Fase 3A).
 *
 * Propiedad: agent-pricing / agent-frontend-boq.
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
import { parseReadModelSource } from '@/lib/supabase/env';
import {
  getProviderRepository,
  ProviderValidationError,
  PriceIntelligenceWriteNotSupportedError,
  InsufficientRoleError,
} from '@/server/pricing';
import type { ProviderCreateInput, ProviderUpdateInput } from '@/server/pricing';

export interface ProviderActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  providerId?: string;
}

function isWriteModeEnabled(): boolean {
  try {
    const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
    return source === 'db';
  } catch {
    return false;
  }
}

function handleAuthError(e: unknown): ProviderActionResult {
  if (e instanceof AuthError) {
    const msgs: Record<string, string> = {
      no_session: 'No hay sesión activa.',
      no_membership: 'No tienes membresía activa.',
      invalid_role: 'Tu rol no permite esta acción.',
      config: 'Error de configuración.',
    };
    return { success: false, error: msgs[e.reason] ?? 'Error de autenticación.' };
  }
  return { success: false, error: 'Error al verificar la sesión.' };
}

export async function createProviderAction(
  _prevState: ProviderActionResult | null,
  formData: FormData,
): Promise<ProviderActionResult> {
  if (!isWriteModeEnabled()) {
    return { success: false, error: 'Creación no disponible en modo demostración.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return handleAuthError(e);
  }

  if (!(['management', 'internal'] as string[]).includes(viewer.role)) {
    return { success: false, error: 'Tu rol no permite crear proveedores.' };
  }

  const input: ProviderCreateInput = {
    name: (formData.get('name') as string | null) ?? '',
    supplierType: ((formData.get('supplierType') as string | null) ?? 'vendor') as ProviderCreateInput['supplierType'],
    websiteUrl: (formData.get('websiteUrl') as string | null) || null,
    defaultDiscountPercent: (formData.get('defaultDiscountPercent') as string | null) ?? '0',
    notes: (formData.get('notes') as string | null) || null,
  };

  try {
    const repo = getProviderRepository();
    const provider = await repo.createProvider(viewer, input);
    revalidatePath('/catalog/providers');
    return { success: true, providerId: provider.id };
  } catch (e) {
    if (e instanceof ProviderValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { success: false, fieldErrors };
    }
    if (e instanceof PriceIntelligenceWriteNotSupportedError) {
      return { success: false, error: 'Escritura no disponible en modo fixture.' };
    }
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'No tienes permiso para crear proveedores.' };
    }
    return { success: false, error: 'No se pudo crear el proveedor. Intenta de nuevo.' };
  }
}

export async function updateProviderAction(
  _prevState: ProviderActionResult | null,
  formData: FormData,
): Promise<ProviderActionResult> {
  if (!isWriteModeEnabled()) {
    return { success: false, error: 'Edición no disponible en modo demostración.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return handleAuthError(e);
  }

  if (!(['management', 'internal'] as string[]).includes(viewer.role)) {
    return { success: false, error: 'Tu rol no permite editar proveedores.' };
  }

  const providerId = formData.get('providerId') as string | null;
  if (!providerId) return { success: false, error: 'ID de proveedor faltante.' };

  const input: ProviderUpdateInput = {
    name: (formData.get('name') as string | null) ?? undefined,
    websiteUrl: (formData.get('websiteUrl') as string | null) || null,
    defaultDiscountPercent: (formData.get('defaultDiscountPercent') as string | null) ?? undefined,
    notes: (formData.get('notes') as string | null) || null,
    active: formData.get('active') !== 'false',
  };

  try {
    const repo = getProviderRepository();
    await repo.updateProvider(viewer, providerId, input);
    revalidatePath('/catalog/providers');
    return { success: true, providerId };
  } catch (e) {
    if (e instanceof ProviderValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { success: false, fieldErrors };
    }
    return { success: false, error: 'No se pudo actualizar el proveedor.' };
  }
}
