/**
 * actions.ts — Server Actions de observaciones de precio (Price Intelligence Fase 3A + 3B).
 *
 * Propiedad: agent-pricing / agent-frontend-boq.
 *
 * Reglas:
 *  - organization_id y created_by/approved_by SIEMPRE server-side.
 *  - Solo mode=db permite escritura.
 *  - Observaciones append-only: INSERT solo; approve/reject solo actualiza status.
 *  - Aprobar/rechazar: solo admin/gerencia.
 *  - Phase 3B: validatePublicUrlAction + confirmProposalAction — nunca aprueba automáticamente.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { parseReadModelSource } from '@/lib/supabase/env';
import {
  getObservationRepository,
  ObservationValidationError,
  ObservationAlreadyReviewedError,
  ObservationNotFoundError,
  PriceIntelligenceWriteNotSupportedError,
  InsufficientRoleError,
  validatePublicPriceUrl,
  confirmPublicPriceObservation,
  UrlValidationError,
  PriceMissingError,
  FetchPublicPageError,
} from '@/server/pricing';
import type { CreateObservationInput, PriceValidationProposal } from '@/server/pricing';

export interface ObservationActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  observationId?: string;
}

function isWriteModeEnabled(): boolean {
  try {
    const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
    return source === 'db';
  } catch {
    return false;
  }
}

function handleAuthError(e: unknown): ObservationActionResult {
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

export async function createObservationAction(
  _prevState: ObservationActionResult | null,
  formData: FormData,
): Promise<ObservationActionResult> {
  if (!isWriteModeEnabled()) {
    return { success: false, error: 'Creación no disponible en modo demostración.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return handleAuthError(e);
  }

  // ViewerRole: management (gerencia) + internal (admin/presupuestos/compras)
  const allowedRoles = ['management', 'internal'] as string[];
  if (!allowedRoles.includes(viewer.role)) {
    return { success: false, error: 'No tienes permiso para registrar observaciones de precio.' };
  }

  const resourceId = formData.get('resourceId') as string | null;
  if (!resourceId) return { success: false, error: 'ID de recurso faltante.' };

  const input: CreateObservationInput = {
    resourceId,
    supplierId: (formData.get('supplierId') as string | null) || null,
    observedPrice: (formData.get('observedPrice') as string | null) ?? '',
    discountPercent: (formData.get('discountPercent') as string | null) ?? '0',
    unit: (formData.get('unit') as string | null) ?? '',
    currency: (formData.get('currency') as string | null) ?? 'COP',
    sourceType: (formData.get('sourceType') as CreateObservationInput['sourceType'] | null) ?? 'manual',
    sourceReference: (formData.get('sourceReference') as string | null) || null,
    observedAt: (formData.get('observedAt') as string | null) ?? new Date().toISOString(),
    validUntil: (formData.get('validUntil') as string | null) || null,
    notes: (formData.get('notes') as string | null) || null,
  };

  try {
    const repo = getObservationRepository();
    const obs = await repo.createResourcePriceObservation(viewer, input);
    revalidatePath(`/catalog/resources/${resourceId}/price-intelligence`);
    return { success: true, observationId: obs.id };
  } catch (e) {
    if (e instanceof ObservationValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { success: false, fieldErrors };
    }
    if (e instanceof PriceIntelligenceWriteNotSupportedError) {
      return { success: false, error: 'Escritura no disponible en modo fixture.' };
    }
    return { success: false, error: 'No se pudo registrar la observación. Intenta de nuevo.' };
  }
}

export async function approveObservationAction(
  _prevState: ObservationActionResult | null,
  formData: FormData,
): Promise<ObservationActionResult> {
  if (!isWriteModeEnabled()) {
    return { success: false, error: 'Aprobación no disponible en modo demostración.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return handleAuthError(e);
  }

  const observationId = formData.get('observationId') as string | null;
  const resourceId = formData.get('resourceId') as string | null;
  if (!observationId) return { success: false, error: 'ID de observación faltante.' };

  try {
    const repo = getObservationRepository();
    const obs = await repo.approveResourcePriceObservation(viewer, { observationId });
    if (resourceId) revalidatePath(`/catalog/resources/${resourceId}/price-intelligence`);
    return { success: true, observationId: obs.id };
  } catch (e) {
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'Solo admin y gerencia pueden aprobar observaciones.' };
    }
    if (e instanceof ObservationAlreadyReviewedError) {
      return { success: false, error: `La observación ya fue revisada (${e.currentStatus}).` };
    }
    if (e instanceof ObservationNotFoundError) {
      return { success: false, error: 'Observación no encontrada.' };
    }
    return { success: false, error: 'No se pudo aprobar la observación.' };
  }
}

export async function rejectObservationAction(
  _prevState: ObservationActionResult | null,
  formData: FormData,
): Promise<ObservationActionResult> {
  if (!isWriteModeEnabled()) {
    return { success: false, error: 'Rechazo no disponible en modo demostración.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return handleAuthError(e);
  }

  const observationId = formData.get('observationId') as string | null;
  const resourceId = formData.get('resourceId') as string | null;
  const rejectionReason = (formData.get('rejectionReason') as string | null) ?? '';
  if (!observationId) return { success: false, error: 'ID de observación faltante.' };
  if (!rejectionReason.trim()) return { success: false, fieldErrors: { rejectionReason: 'La razón de rechazo es obligatoria.' } };

  try {
    const repo = getObservationRepository();
    const obs = await repo.rejectResourcePriceObservation(viewer, { observationId, rejectionReason });
    if (resourceId) revalidatePath(`/catalog/resources/${resourceId}/price-intelligence`);
    return { success: true, observationId: obs.id };
  } catch (e) {
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'Solo admin y gerencia pueden rechazar observaciones.' };
    }
    if (e instanceof ObservationAlreadyReviewedError) {
      return { success: false, error: `La observación ya fue revisada (${e.currentStatus}).` };
    }
    if (e instanceof ObservationNotFoundError) {
      return { success: false, error: 'Observación no encontrada.' };
    }
    return { success: false, error: 'No se pudo rechazar la observación.' };
  }
}

// ---- Phase 3B: URL Price Validation ----

export interface UrlValidationActionResult {
  success: boolean;
  proposal?: PriceValidationProposal;
  error?: string;
}

export interface ConfirmProposalActionResult {
  success: boolean;
  observationId?: string;
  error?: string;
}

export async function validatePublicUrlAction(
  _prevState: UrlValidationActionResult | null,
  formData: FormData,
): Promise<UrlValidationActionResult> {
  if (!isWriteModeEnabled()) {
    return { success: false, error: 'Validación no disponible en modo demostración.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    const { error } = handleAuthError(e);
    return { success: false, error };
  }

  const url = (formData.get('url') as string | null)?.trim() ?? '';
  if (!url) return { success: false, error: 'La URL es obligatoria.' };
  const resourceId = (formData.get('resourceId') as string | null) ?? '';

  try {
    const proposal = await validatePublicPriceUrl(viewer, resourceId, { url });
    return { success: true, proposal };
  } catch (e) {
    if (e instanceof UrlValidationError) {
      return { success: false, error: `URL no válida: ${e.message}` };
    }
    if (e instanceof FetchPublicPageError) {
      return { success: false, error: `No se pudo acceder a la URL: ${e.message}` };
    }
    if (e instanceof PriceMissingError) {
      return { success: false, error: `No se detectó precio. ${e.warnings.join(' ')}` };
    }
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'No tienes permiso para validar precios.' };
    }
    return { success: false, error: 'Error al validar la URL. Intenta de nuevo.' };
  }
}

export async function confirmProposalAction(
  _prevState: ConfirmProposalActionResult | null,
  formData: FormData,
): Promise<ConfirmProposalActionResult> {
  if (!isWriteModeEnabled()) {
    return { success: false, error: 'Confirmación no disponible en modo demostración.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    const { error } = handleAuthError(e);
    return { success: false, error };
  }

  const resourceId = (formData.get('resourceId') as string | null) ?? '';
  const resourceUnit = (formData.get('resourceUnit') as string | null) ?? 'UND';

  const proposal: PriceValidationProposal = {
    sourceUrl: (formData.get('sourceUrl') as string | null) ?? '',
    title: (formData.get('title') as string | null) || null,
    externalReference: (formData.get('externalReference') as string | null) || null,
    externalSku: (formData.get('externalSku') as string | null) || null,
    observedPrice: (formData.get('observedPrice') as string | null) ?? '',
    currency: (formData.get('currency') as string | null) ?? 'COP',
    unit: (formData.get('unit') as string | null) || null,
    extractedAt: (formData.get('extractedAt') as string | null) ?? new Date().toISOString(),
    extractionMethod: ((formData.get('extractionMethod') as string | null) ?? 'none') as PriceValidationProposal['extractionMethod'],
    confidence: ((formData.get('confidence') as string | null) ?? 'low') as PriceValidationProposal['confidence'],
    warnings: [],
    sourceType: 'public_web',
  };

  if (!proposal.observedPrice || !proposal.sourceUrl) {
    return { success: false, error: 'Propuesta incompleta. Valida la URL de nuevo.' };
  }

  try {
    const obs = await confirmPublicPriceObservation(viewer, resourceId, proposal, resourceUnit);
    revalidatePath(`/catalog/resources/${resourceId}/price-intelligence`);
    return { success: true, observationId: obs.id };
  } catch (e) {
    if (e instanceof ObservationValidationError) {
      return { success: false, error: 'Error de validación al crear la observación.' };
    }
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'No tienes permiso para crear observaciones.' };
    }
    return { success: false, error: 'No se pudo crear la observación. Intenta de nuevo.' };
  }
}
