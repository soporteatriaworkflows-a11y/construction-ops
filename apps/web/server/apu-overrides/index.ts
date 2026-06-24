/**
 * apu-overrides — Servicio mínimo de override de desperdicio por componente APU
 * (APU_SMART_DEFAULTS_V1B). Llama a la RPC SECURITY DEFINER existente
 * `update_apu_component_waste_override`; la RPC es el BACKSTOP real (sesión, org,
 * rol, APU no archivado, rango). Aquí solo: validar entrada, invocar, mapear
 * errores. NO toca quantity/unit_price_snapshot/precios/rendimiento.
 */
import { createClient } from '@/lib/supabase/server';
import type { Uuid } from '@/lib/utils/types';
import {
  validateWasteOverrideInput,
  mapWasteOverrideRpcError,
  type WasteOverrideInput,
} from './validation';

export * from './validation';

export interface WasteOverrideResult {
  componentId: Uuid;
  wastePct: string;
  recommendedWastePct: string | null;
  overridden: boolean;
}

/**
 * Persiste el override llamando a la RPC RLS-bound. La RPC re-valida TODO
 * server-side (backstop). No toca otras columnas.
 *
 * @throws WasteOverrideError mapeado desde la RPC.
 */
export async function updateApuComponentWasteOverride(
  input: WasteOverrideInput,
): Promise<WasteOverrideResult> {
  const valid = validateWasteOverrideInput(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('update_apu_component_waste_override', {
    p_component_id: valid.componentId,
    p_waste_pct: valid.wastePct,
    p_note: valid.note,
  });
  if (error) throw mapWasteOverrideRpcError(error);
  const result = data as {
    componentId: string;
    wastePct: number | string;
    recommendedWastePct: number | string | null;
    overridden: boolean;
  };
  return {
    componentId: result.componentId as Uuid,
    wastePct: String(result.wastePct),
    recommendedWastePct: result.recommendedWastePct == null ? null : String(result.recommendedWastePct),
    overridden: Boolean(result.overridden),
  };
}
