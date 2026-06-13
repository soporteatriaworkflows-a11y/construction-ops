/**
 * actions.ts — Server Actions del constructor manual de APU (/apu/new).
 *
 * Reglas: organization_id / actor SIEMPRE server-side; el navegador solo provee
 * selección, cantidades, rendimientos y desperdicios (nunca precios/subtotales).
 */
'use server';

import { redirect } from 'next/navigation';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { createManualApu } from '@/server/apu-builder';
import { InsufficientRoleError } from '@/server/pricing/errors';
import {
  ApuBuilderValidationError,
  ApuBuilderWriteNotSupportedError,
  ResourceWithoutApprovedPriceError,
} from '@/server/apu-builder';
import type { ManualApuInput } from '@/lib/apu-builder/types';

export interface CreateManualApuActionResult {
  success?: boolean;
  error?: string;
}

export async function createManualApuAction(
  _prev: CreateManualApuActionResult | null,
  formData: FormData,
): Promise<CreateManualApuActionResult> {
  const raw = formData.get('payload');
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { error: 'No se recibió información del APU.' };
  }

  let input: ManualApuInput;
  try {
    input = JSON.parse(raw) as ManualApuInput;
  } catch {
    return { error: 'Formato de APU inválido.' };
  }

  let apuTemplateId: string;
  try {
    const viewer = await resolveAuthenticatedViewer();
    const result = await createManualApu(viewer, input);
    apuTemplateId = result.apuTemplateId;
  } catch (e) {
    if (
      e instanceof ApuBuilderValidationError ||
      e instanceof ResourceWithoutApprovedPriceError
    ) {
      return { error: e.message };
    }
    if (e instanceof InsufficientRoleError) {
      return { error: 'No tienes permiso para crear APU.' };
    }
    if (e instanceof ApuBuilderWriteNotSupportedError) {
      return { error: 'La creación de APU requiere modo Supabase + base de datos.' };
    }
    return { error: 'No se pudo crear el APU. Revisa los datos e inténtalo de nuevo.' };
  }

  // Éxito: redirige al detalle del APU recién creado (fuera del try/catch
  // porque `redirect` lanza internamente).
  redirect(`/apu/${apuTemplateId}`);
}
