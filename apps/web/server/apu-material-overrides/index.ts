/**
 * apu-material-overrides — Servicio de override del consumo unitario de un
 * componente MATERIAL (APU_MATERIAL_CONSUMPTION_OVERRIDES_V1). Llama a las RPC
 * SECURITY DEFINER `update_/reset_apu_component_material_consumption_override`;
 * la RPC es el BACKSTOP real (sesión, org, rol, componente material, APU no
 * archivado, quantity>0). Aquí solo: validar, invocar, mapear errores.
 *
 * NO toca unit_price_snapshot / waste_pct / precios / descuentos / labor. Solo
 * ajusta `quantity` (vía RPC); el trigger reafirma total_component_cost.
 */
import { createClient } from '@/lib/supabase/server';
import type { Uuid } from '@/lib/utils/types';
import {
  validateMaterialConsumptionInput,
  mapMaterialConsumptionRpcError,
  type MaterialConsumptionInput,
} from './validation';

export * from './validation';

export interface MaterialConsumptionResult {
  componentId: Uuid;
  quantity: string;
  recommendedMaterialQuantity: string | null;
  overridden: boolean;
}

export interface MaterialConsumptionResetResult {
  componentId: Uuid;
  quantity: string;
  reset: boolean;
}

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

/**
 * Aplica el override de consumo llamando a la RPC RLS-bound. La RPC re-valida
 * TODO server-side (backstop) y solo toca `quantity` + metadata.
 *
 * @throws MaterialConsumptionError mapeado desde la RPC.
 */
export async function updateApuComponentMaterialConsumptionOverride(
  input: MaterialConsumptionInput,
): Promise<MaterialConsumptionResult> {
  const valid = validateMaterialConsumptionInput(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('update_apu_component_material_consumption_override', {
    p_component_id: valid.componentId,
    p_quantity: valid.quantity,
    p_note: valid.note,
  });
  if (error) throw mapMaterialConsumptionRpcError(error);
  const r = data as Record<string, unknown>;
  return {
    componentId: String(r.componentId) as Uuid,
    quantity: String(r.quantity),
    recommendedMaterialQuantity: str(r.recommendedMaterialQuantity),
    overridden: Boolean(r.overridden),
  };
}

/**
 * Restaura el consumo recomendado (reset) llamando a la RPC RLS-bound.
 *
 * @throws MaterialConsumptionError mapeado desde la RPC.
 */
export async function resetApuComponentMaterialConsumptionOverride(
  componentId: string,
): Promise<MaterialConsumptionResetResult> {
  const id = (componentId ?? '').trim();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reset_apu_component_material_consumption_override', {
    p_component_id: id,
  });
  if (error) throw mapMaterialConsumptionRpcError(error);
  const r = data as Record<string, unknown>;
  return {
    componentId: String(r.componentId) as Uuid,
    quantity: String(r.quantity),
    reset: Boolean(r.reset),
  };
}
