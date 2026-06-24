/**
 * apu-productivity-overrides — Servicio de override de rendimiento/cuadrilla por
 * componente labor (APU_PRODUCTIVITY_CREW_OVERRIDES_V1C). Llama a las RPC
 * SECURITY DEFINER `update_/reset_apu_component_labor_productivity_override`; la
 * RPC es el BACKSTOP real (sesión, org, rol, componente labor, APU no archivado,
 * validaciones). Aquí solo: validar entrada, invocar, mapear errores.
 *
 * NO toca unit_price_snapshot / waste_pct / precios / descuentos. Solo ajusta
 * `quantity` (vía RPC) y el trigger reafirma total_component_cost.
 */
import { createClient } from '@/lib/supabase/server';
import type { Uuid } from '@/lib/utils/types';
import {
  validateProductivityOverride,
  mapProductivityOverrideRpcError,
  type ProductivityOverrideInputRaw,
} from './validation';

export * from './validation';

export interface ProductivityOverrideResult {
  componentId: Uuid;
  quantity: string;
  recommendedLaborQuantity: string | null;
  appliedProductivity: string | null;
  productivityUnit: string | null;
  appliedCrewSize: string | null;
}

export interface ProductivityResetResult {
  componentId: Uuid;
  quantity: string;
  reset: boolean;
}

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

/**
 * Aplica el override de rendimiento llamando a la RPC RLS-bound. La RPC re-valida
 * TODO server-side (backstop) y solo toca `quantity` + metadata.
 *
 * @throws ProductivityOverrideError mapeado desde la RPC.
 */
export async function updateApuComponentLaborProductivityOverride(
  input: ProductivityOverrideInputRaw,
): Promise<ProductivityOverrideResult> {
  const valid = validateProductivityOverride(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('update_apu_component_labor_productivity_override', {
    p_component_id: valid.componentId,
    p_productivity: valid.productivity,
    p_crew_size: valid.crewSize,
    p_productivity_unit: valid.productivityUnit,
    p_note: valid.note,
  });
  if (error) throw mapProductivityOverrideRpcError(error);
  const r = data as Record<string, unknown>;
  return {
    componentId: String(r.componentId) as Uuid,
    quantity: String(r.quantity),
    recommendedLaborQuantity: str(r.recommendedLaborQuantity),
    appliedProductivity: str(r.appliedProductivity),
    productivityUnit: str(r.productivityUnit),
    appliedCrewSize: str(r.appliedCrewSize),
  };
}

/**
 * Restaura el consumo laboral recomendado (reset) llamando a la RPC RLS-bound.
 *
 * @throws ProductivityOverrideError mapeado desde la RPC.
 */
export async function resetApuComponentLaborProductivityOverride(
  componentId: string,
): Promise<ProductivityResetResult> {
  const id = (componentId ?? '').trim();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reset_apu_component_labor_productivity_override', {
    p_component_id: id,
  });
  if (error) throw mapProductivityOverrideRpcError(error);
  const r = data as Record<string, unknown>;
  return {
    componentId: String(r.componentId) as Uuid,
    quantity: String(r.quantity),
    reset: Boolean(r.reset),
  };
}
