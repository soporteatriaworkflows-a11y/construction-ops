/**
 * validation.ts — Lógica PURA del override de desperdicio (APU_SMART_DEFAULTS_V1B).
 * Sin I/O ni deps de servidor (testeable). El backstop real es la RPC.
 */
import type { Uuid } from '@/lib/utils/types';

export type WasteOverrideErrorCode =
  | 'invalid_component'
  | 'invalid_waste_pct'
  | 'no_session'
  | 'no_membership'
  | 'insufficient_role'
  | 'component_not_found'
  | 'apu_archived'
  | 'override_failed';

export class WasteOverrideError extends Error {
  constructor(readonly code: WasteOverrideErrorCode, message: string) {
    super(message);
    this.name = 'WasteOverrideError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WasteOverrideInput {
  componentId: string;
  /** Fracción [0,1] como string (p. ej. "0.08"). */
  wastePct: string;
  note?: string | null;
}

export interface ValidWasteOverrideInput {
  componentId: Uuid;
  wastePct: number;
  note: string | null;
}

/** Mensajes es-CO por código. */
export const WASTE_OVERRIDE_MESSAGES: Record<WasteOverrideErrorCode, string> = {
  invalid_component: 'Componente inválido.',
  invalid_waste_pct: 'El desperdicio debe estar entre 0% y 100%.',
  no_session: 'No hay sesión activa. Inicia sesión e inténtalo de nuevo.',
  no_membership: 'No tienes una organización activa.',
  insufficient_role: 'Tu rol no permite ajustar el desperdicio.',
  component_not_found: 'No se encontró el componente del APU.',
  apu_archived: 'Este APU está archivado; no se puede editar.',
  override_failed: 'No se pudo guardar el ajuste. Inténtalo de nuevo.',
};

/**
 * Valida y normaliza la entrada del override. PURA. El backstop real es la RPC.
 * @throws WasteOverrideError ('invalid_component' | 'invalid_waste_pct').
 */
export function validateWasteOverrideInput(input: WasteOverrideInput): ValidWasteOverrideInput {
  const componentId = input.componentId?.trim();
  if (!componentId || !UUID_RE.test(componentId)) {
    throw new WasteOverrideError('invalid_component', WASTE_OVERRIDE_MESSAGES.invalid_component);
  }
  const n = Number(input.wastePct);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new WasteOverrideError('invalid_waste_pct', WASTE_OVERRIDE_MESSAGES.invalid_waste_pct);
  }
  const note = (input.note ?? '').trim().slice(0, 500);
  return { componentId: componentId as Uuid, wastePct: n, note: note === '' ? null : note };
}

/** Mapea el error de la RPC (mensaje/código PG) a un `WasteOverrideError`. PURA. */
export function mapWasteOverrideRpcError(
  error: { message?: string; code?: string } | null,
): WasteOverrideError {
  const raw = (error?.message ?? '').toLowerCase();
  const codes: WasteOverrideErrorCode[] = [
    'no_session',
    'no_membership',
    'insufficient_role',
    'invalid_waste_pct',
    'component_not_found',
    'apu_archived',
  ];
  for (const code of codes) {
    if (raw.includes(code)) return new WasteOverrideError(code, WASTE_OVERRIDE_MESSAGES[code]);
  }
  return new WasteOverrideError('override_failed', WASTE_OVERRIDE_MESSAGES.override_failed);
}
