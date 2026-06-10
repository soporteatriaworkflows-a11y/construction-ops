/**
 * simulator-actions.ts — Server Action del Simulador Comercial V1.
 * Oleada OPERATIONAL BUDGET UX V1. Contrato: OPERATIONAL_BUDGET_UX_V1_CONTRACT §5.
 *
 * El navegador SOLO envía porcentajes y precio objetivo. El total técnico base
 * se deriva SIEMPRE server-side (`calculateEstimateFinancialSummary`, RLS-bound);
 * nunca se acepta un base arbitrario del cliente. READ-ONLY: esta acción no
 * escribe en BOQ, AIU, versiones ni exports.
 */
'use server';

import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import {
  simulateCommercialPrice,
  CommercialSimulationValidationError,
  type CommercialSimulationResult,
} from '@/modules/estimates/commercial-simulation';
import { resolveViewer } from '@/server/auth/resolve-viewer';

export type SimulateCommercialResult =
  | { ok: true; result: CommercialSimulationResult }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export async function simulateCommercialAction(
  formData: FormData,
): Promise<SimulateCommercialResult> {
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  if (!estimateId) return { ok: false, error: 'Presupuesto no especificado.' };

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    return { ok: false, error: 'No fue posible verificar la sesión.' };
  }

  // Total técnico base server-derived (fuente única: cost-domain vía repo RLS-bound).
  let baseTotal: string;
  try {
    const summary = await getEstimatesWriteRepository().calculateEstimateFinancialSummary(
      viewer,
      estimateId,
    );
    baseTotal = summary.grandTotal;
  } catch (e) {
    if (e instanceof EstimateNotFoundError) {
      return { ok: false, error: 'El presupuesto no existe o no es accesible.' };
    }
    return { ok: false, error: 'No fue posible calcular el total técnico base.' };
  }

  try {
    const result = simulateCommercialPrice({
      baseTotal,
      commercialAdjustmentPct: (formData.get('commercialAdjustmentPct') as string | null) ?? '',
      discountPct: (formData.get('discountPct') as string | null) ?? '',
      additionalTaxPct: (formData.get('additionalTaxPct') as string | null) ?? '',
      targetPrice: (formData.get('targetPrice') as string | null) ?? null,
    });
    return { ok: true, result };
  } catch (e) {
    if (e instanceof CommercialSimulationValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { ok: false, fieldErrors };
    }
    return { ok: false, error: 'No fue posible calcular la simulación. Intenta de nuevo.' };
  }
}
