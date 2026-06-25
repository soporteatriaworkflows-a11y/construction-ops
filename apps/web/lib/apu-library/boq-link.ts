/**
 * boq-link.ts — Helpers PUROS para vincular un APU de la Biblioteca a un BOQ
 * desde la vista Tarjetas (APU_LIBRARY_BOQ_LINK_FROM_CARDS_V1). Sin DB, sin
 * 'use server', sin recalcular finanzas. La verdad de la mutación vive en el
 * dominio `addApuToBoq` (RPC `add_apu_to_boq`); esto solo decide elegibilidad
 * de UI y compatibilidad de unidades para advertencias.
 */
import type { EstimateVersionStatus } from '@/lib/utils/types';
import type { ApuCompletenessState } from './completeness';

export type ApuLinkBlockReason = 'archived' | 'incomplete' | 'not_allowed';

export interface ApuLinkEligibility {
  canLink: boolean;
  reason?: ApuLinkBlockReason;
  message?: string;
}

const REASON_MESSAGE: Record<ApuLinkBlockReason, string> = {
  archived: 'APU archivado: no se puede vincular.',
  incomplete: 'APU incompleto: resuelve los pendientes críticos antes de vincular.',
  not_allowed: 'Requiere modo edición (Supabase + base de datos) y rol autorizado.',
};

/**
 * ¿Se puede ofrecer "Vincular a BOQ" para este APU desde la tarjeta?
 *
 * Bloquea si: APU archivado, APU incompleto crítico, o el visor no puede mutar
 * (modo demo/fixture o rol no autorizado — `canMutate` ya combina ambos en la
 * página). NO sustituye la verificación server-side del dominio (defensa en
 * profundidad): el RPC vuelve a validar rol, modo y estado de versión.
 */
export function apuLinkEligibility(args: {
  completenessState: ApuCompletenessState;
  canMutate: boolean;
}): ApuLinkEligibility {
  const { completenessState, canMutate } = args;
  if (completenessState === 'archived') {
    return { canLink: false, reason: 'archived', message: REASON_MESSAGE.archived };
  }
  if (completenessState === 'incomplete') {
    return { canLink: false, reason: 'incomplete', message: REASON_MESSAGE.incomplete };
  }
  if (!canMutate) {
    return { canLink: false, reason: 'not_allowed', message: REASON_MESSAGE.not_allowed };
  }
  // `ready` y `review` (solo advertencias) son vinculables.
  return { canLink: true };
}

/**
 * Solo las versiones EDITABLES admiten agregar partidas. `issued`/`approved`/
 * `archived` están bloqueadas (igual que el RPC + RLS). `review` se considera
 * editable (borrador en revisión) consistente con el dominio BOQ-add.
 */
export function isEditableVersionStatus(status: EstimateVersionStatus): boolean {
  return status === 'draft' || status === 'review';
}

/** Etiqueta legible del estado de versión para el selector guiado. */
export function versionStatusLabel(status: EstimateVersionStatus): string {
  switch (status) {
    case 'draft':
      return 'Borrador';
    case 'review':
      return 'En revisión';
    case 'approved':
      return 'Aprobada';
    case 'issued':
      return 'Emitida';
    case 'archived':
      return 'Archivada';
    default:
      return status;
  }
}

/**
 * Normaliza una unidad para comparación tolerante: minúsculas, sin espacios,
 * y mapeo de superíndices comunes (m²→m2, m³→m3). NO altera la unidad mostrada;
 * solo sirve para decidir si advertir por incompatibilidad.
 */
export function normalizeUnit(unit: string): string {
  return (unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+/g, '');
}

/** ¿Son compatibles (misma unidad normalizada)? Vacíos se tratan como incompatibles. */
export function unitsCompatible(a: string, b: string): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  if (na === '' || nb === '') return false;
  return na === nb;
}
