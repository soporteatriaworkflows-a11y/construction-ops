/**
 * actions.ts — Server Actions del constructor manual de APU (/apu/new).
 *
 * Reglas: organization_id / actor SIEMPRE server-side; el navegador solo provee
 * selección, cantidades, rendimientos y desperdicios (nunca precios/subtotales).
 */
'use server';

import { redirect } from 'next/navigation';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import {
  archiveManualApu,
  createManualApu,
  loadApuBuilderData,
  previewManualApu,
} from '@/server/apu-builder';
import { InsufficientRoleError } from '@/server/pricing/errors';
import {
  ApuArchiveError,
  ApuBuilderValidationError,
  ApuBuilderWriteNotSupportedError,
  ResourceWithoutApprovedPriceError,
} from '@/server/apu-builder';
import type { ManualApuInput, SerializableManualApuPreview } from '@/lib/apu-builder/types';

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

/** Valida y calcula el preview server-side del APU (sin persistir). */
export async function previewManualApuAction(
  _prev: SerializableManualApuPreview | null,
  formData: FormData,
): Promise<SerializableManualApuPreview> {
  const raw = formData.get('payload');
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'No se recibió información del APU.' };
  }
  let input: ManualApuInput;
  try {
    input = JSON.parse(raw) as ManualApuInput;
  } catch {
    return { ok: false, error: 'Formato de APU inválido.' };
  }
  try {
    const viewer = await resolveAuthenticatedViewer();
    const data = await loadApuBuilderData(viewer);
    const preview = previewManualApu(input, data);
    return {
      ok: true,
      components: preview.components.map((c) => ({
        kind: c.kind,
        label: c.label,
        unit: c.unit,
        quantity: c.quantity,
        wastePct: c.wastePct,
        unitPriceSnapshot: c.unitPriceSnapshot,
        totalComponentCost: c.totalComponentCost,
      })),
      materialsCost: preview.materialsCost,
      laborCost: preview.laborCost,
      toolDerivedCost: preview.toolDerivedCost,
      unitCostTotal: preview.unitCostTotal,
    };
  } catch (e) {
    if (e instanceof ApuBuilderValidationError || e instanceof ResourceWithoutApprovedPriceError) {
      return { ok: false, error: (e as Error).message };
    }
    if (e instanceof InsufficientRoleError) return { ok: false, error: 'No tienes permiso.' };
    return { ok: false, error: 'Error al calcular el preview. Revisa los datos.' };
  }
}

export interface ArchiveApuActionResult {
  success?: boolean;
  error?: string;
}

/** Archiva (soft) un APU manual. Requiere management/internal. */
export async function archiveApuAction(
  apuTemplateId: string,
  reason: string,
): Promise<ArchiveApuActionResult> {
  if (!reason.trim()) return { error: 'Debes indicar una razón para archivar.' };
  try {
    const viewer = await resolveAuthenticatedViewer();
    await archiveManualApu(viewer, { apuTemplateId, reason: reason.trim() });
    return { success: true };
  } catch (e) {
    if (e instanceof ApuArchiveError) {
      const msgs: Record<string, string> = {
        apu_already_archived: 'El APU ya está archivado.',
        apu_has_boq_items: 'No se puede archivar: el APU está vinculado a ítems BOQ.',
        apu_not_archivable_type: 'Solo los APU creados manualmente pueden archivarse.',
        archive_reason_required: 'La razón de archivo es obligatoria.',
      };
      return { error: msgs[(e as ApuArchiveError).code] ?? `No se pudo archivar: ${(e as ApuArchiveError).code}` };
    }
    if (e instanceof InsufficientRoleError) return { error: 'No tienes permiso para archivar APU.' };
    return { error: 'No se pudo archivar el APU. Inténtalo de nuevo.' };
  }
}
