/**
 * validation.ts — Lógica PURA del override de rendimiento/cuadrilla
 * (APU_PRODUCTIVITY_CREW_OVERRIDES_V1C). Sin I/O ni deps de servidor. El backstop
 * REAL es la RPC SECURITY DEFINER. Aquí solo: validar forma de entrada y mapear
 * los códigos de error de la RPC a mensajes es-CO.
 */
import type { Uuid } from '@/lib/utils/types';
import {
  validateProductivityOverrideInput,
  type ProductivityUnit,
} from '@/modules/apu';

export type ProductivityOverrideErrorCode =
  | 'invalid_component'
  | 'no_session'
  | 'no_membership'
  | 'insufficient_role'
  | 'component_not_found'
  | 'not_labor_component'
  | 'apu_archived'
  | 'invalid_productivity'
  | 'invalid_crew_size'
  | 'invalid_productivity_unit'
  | 'no_recommended_baseline'
  | 'unknown_error';

export class ProductivityOverrideError extends Error {
  constructor(readonly code: ProductivityOverrideErrorCode, message: string) {
    super(message);
    this.name = 'ProductivityOverrideError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mensajes es-CO por código. */
export const PRODUCTIVITY_OVERRIDE_MESSAGES: Record<ProductivityOverrideErrorCode, string> = {
  invalid_component: 'Componente inválido.',
  no_session: 'No hay sesión activa. Inicia sesión e inténtalo de nuevo.',
  no_membership: 'No tienes una organización activa.',
  insufficient_role: 'Tu rol no permite ajustar el rendimiento.',
  component_not_found: 'No se encontró el componente del APU.',
  not_labor_component: 'Solo se puede ajustar el rendimiento de componentes de mano de obra.',
  apu_archived: 'Este APU está archivado; no se puede editar.',
  invalid_productivity: 'El rendimiento debe ser mayor que cero.',
  invalid_crew_size: 'El tamaño de cuadrilla debe ser mayor que cero.',
  invalid_productivity_unit: 'La unidad de rendimiento no es válida.',
  no_recommended_baseline: 'No hay un valor heredado para restaurar.',
  unknown_error: 'No se pudo guardar el ajuste. Inténtalo de nuevo.',
};

export interface ProductivityOverrideInputRaw {
  componentId: string;
  productivityUnit: string;
  /** Productividad o consumo laboral, según la unidad (string decimal > 0). */
  productivity: string;
  /** Tamaño de cuadrilla (string decimal > 0); requerido si unit_per_crew_day. */
  crewSize?: string | null;
  note?: string | null;
}

export interface ValidProductivityOverrideInput {
  componentId: Uuid;
  productivityUnit: ProductivityUnit;
  productivity: string;
  crewSize: string | null;
  note: string | null;
}

/**
 * Valida y normaliza la entrada (forma + semántica de conversión). PURA.
 * Reusa `validateProductivityOverrideInput` (modules/apu) para la semántica de
 * unidad/crew/productividad. El backstop real es la RPC.
 *
 * @throws ProductivityOverrideError ('invalid_component' | 'invalid_productivity_unit'
 *   | 'invalid_productivity' | 'invalid_crew_size').
 */
export function validateProductivityOverride(
  input: ProductivityOverrideInputRaw,
): ValidProductivityOverrideInput {
  const componentId = input.componentId?.trim();
  if (!componentId || !UUID_RE.test(componentId)) {
    throw new ProductivityOverrideError('invalid_component', PRODUCTIVITY_OVERRIDE_MESSAGES.invalid_component);
  }

  const crewSize = input.crewSize == null || String(input.crewSize).trim() === '' ? null : String(input.crewSize).trim();
  const sem = validateProductivityOverrideInput({
    productivityUnit: input.productivityUnit as ProductivityUnit,
    productivity: String(input.productivity).trim(),
    crewSize,
  });
  if (!sem.ok) {
    throw new ProductivityOverrideError(sem.error, PRODUCTIVITY_OVERRIDE_MESSAGES[sem.error]);
  }

  const note = (input.note ?? '').trim().slice(0, 500);
  return {
    componentId: componentId as Uuid,
    productivityUnit: input.productivityUnit as ProductivityUnit,
    productivity: String(input.productivity).trim(),
    crewSize,
    note: note === '' ? null : note,
  };
}

/** Mapea el error de la RPC (mensaje/código PG) a un `ProductivityOverrideError`. PURA. */
export function mapProductivityOverrideRpcError(
  error: { message?: string; code?: string } | null,
): ProductivityOverrideError {
  const raw = (error?.message ?? '').toLowerCase();
  const codes: ProductivityOverrideErrorCode[] = [
    'no_session',
    'no_membership',
    'insufficient_role',
    'not_labor_component',
    'component_not_found',
    'apu_archived',
    'invalid_productivity_unit',
    'invalid_productivity',
    'invalid_crew_size',
    'no_recommended_baseline',
  ];
  for (const code of codes) {
    if (raw.includes(code)) return new ProductivityOverrideError(code, PRODUCTIVITY_OVERRIDE_MESSAGES[code]);
  }
  return new ProductivityOverrideError('unknown_error', PRODUCTIVITY_OVERRIDE_MESSAGES.unknown_error);
}
