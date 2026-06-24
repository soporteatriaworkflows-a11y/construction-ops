/**
 * validation.ts — Lógica PURA del override de consumo material
 * (APU_MATERIAL_CONSUMPTION_OVERRIDES_V1). Sin I/O. El backstop REAL es la RPC.
 */
import type { Uuid } from '@/lib/utils/types';

export type MaterialConsumptionErrorCode =
  | 'invalid_component'
  | 'invalid_quantity'
  | 'no_session'
  | 'no_membership'
  | 'insufficient_role'
  | 'component_not_found'
  | 'not_material_component'
  | 'apu_archived'
  | 'no_recommended_baseline'
  | 'unknown_error';

export class MaterialConsumptionError extends Error {
  constructor(readonly code: MaterialConsumptionErrorCode, message: string) {
    super(message);
    this.name = 'MaterialConsumptionError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MATERIAL_CONSUMPTION_MESSAGES: Record<MaterialConsumptionErrorCode, string> = {
  invalid_component: 'Componente inválido.',
  invalid_quantity: 'El consumo debe ser mayor que cero.',
  no_session: 'No hay sesión activa. Inicia sesión e inténtalo de nuevo.',
  no_membership: 'No tienes una organización activa.',
  insufficient_role: 'Tu rol no permite ajustar el consumo.',
  component_not_found: 'No se encontró el componente del APU.',
  not_material_component: 'Solo se puede ajustar el consumo de componentes de material.',
  apu_archived: 'Este APU está archivado; no se puede editar.',
  no_recommended_baseline: 'No hay un valor recomendado para restaurar.',
  unknown_error: 'No se pudo guardar el ajuste. Inténtalo de nuevo.',
};

export interface MaterialConsumptionInput {
  componentId: string;
  /** Consumo unitario (coeficiente) del material, string decimal > 0. */
  quantity: string;
  note?: string | null;
}

export interface ValidMaterialConsumptionInput {
  componentId: Uuid;
  quantity: string;
  note: string | null;
}

/**
 * Valida y normaliza la entrada. PURA. El backstop real es la RPC.
 * @throws MaterialConsumptionError ('invalid_component' | 'invalid_quantity').
 */
export function validateMaterialConsumptionInput(
  input: MaterialConsumptionInput,
): ValidMaterialConsumptionInput {
  const componentId = input.componentId?.trim();
  if (!componentId || !UUID_RE.test(componentId)) {
    throw new MaterialConsumptionError('invalid_component', MATERIAL_CONSUMPTION_MESSAGES.invalid_component);
  }
  const q = Number(input.quantity);
  if (!Number.isFinite(q) || q <= 0) {
    throw new MaterialConsumptionError('invalid_quantity', MATERIAL_CONSUMPTION_MESSAGES.invalid_quantity);
  }
  const note = (input.note ?? '').trim().slice(0, 500);
  return { componentId: componentId as Uuid, quantity: String(input.quantity).trim(), note: note === '' ? null : note };
}

/** Mapea el error de la RPC a un `MaterialConsumptionError`. PURA. */
export function mapMaterialConsumptionRpcError(
  error: { message?: string; code?: string } | null,
): MaterialConsumptionError {
  const raw = (error?.message ?? '').toLowerCase();
  const codes: MaterialConsumptionErrorCode[] = [
    'no_session',
    'no_membership',
    'insufficient_role',
    'not_material_component',
    'component_not_found',
    'apu_archived',
    'invalid_quantity',
    'no_recommended_baseline',
  ];
  for (const code of codes) {
    if (raw.includes(code)) return new MaterialConsumptionError(code, MATERIAL_CONSUMPTION_MESSAGES[code]);
  }
  return new MaterialConsumptionError('unknown_error', MATERIAL_CONSUMPTION_MESSAGES.unknown_error);
}
