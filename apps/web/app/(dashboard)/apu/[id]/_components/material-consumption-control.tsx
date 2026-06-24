/**
 * material-consumption-control.tsx — Edición controlada del CONSUMO unitario de un
 * componente Material (APU_MATERIAL_CONSUMPTION_OVERRIDES_V1). Client Component.
 *
 * Gated por `canEdit`. Si NO se puede editar, muestra el estado (chip
 * Manual/Recomendado) + "Solo lectura". Si se puede, panel modal: editar el
 * consumo (coeficiente) del material por unidad de obra, con preview del nuevo
 * subtotal, delta y "Volver al recomendado". Solo edita `quantity` (vía RPC); NO
 * cambia el precio unitario ni el desperdicio.
 */
'use client';

import { useActionState, useMemo, useState } from 'react';
import { Loader2, Ruler } from 'lucide-react';
import {
  updateApuComponentMaterialConsumptionOverrideAction,
  resetApuComponentMaterialConsumptionOverrideAction,
  type MaterialConsumptionActionResult,
} from '../actions';
import { formatCOP } from '@/lib/utils/format';

interface Props {
  apuId: string;
  componentId: string;
  /** Consumo unitario actual (coeficiente). */
  quantity: string;
  /** Consumo formateado para mostrar. */
  quantityText: string;
  /** Precio unitario snapshot (no editable). */
  unitPriceSnapshot: string;
  /** Desperdicio aplicado (fracción, no editable aquí). */
  wastePct: string;
  /** Subtotal actual del componente. */
  totalComponentCost: string;
  /** Consumo recomendado congelado, o null (heredado). */
  recommendedMaterialQuantity: string | null;
  /** Origen: 'manual' | 'reset' | 'imported' | 'suggested' | null. */
  materialQuantitySource: string | null;
  canEdit: boolean;
}

const INITIAL: MaterialConsumptionActionResult | null = null;

export function MaterialConsumptionControl({
  apuId,
  componentId,
  quantity,
  quantityText,
  unitPriceSnapshot,
  wastePct,
  totalComponentCost,
  recommendedMaterialQuantity,
  materialQuantitySource,
  canEdit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(quantity);
  const [state, formAction, isPending] = useActionState(updateApuComponentMaterialConsumptionOverrideAction, INITIAL);
  const [resetState, resetAction, isResetting] = useActionState(resetApuComponentMaterialConsumptionOverrideAction, INITIAL);

  const isManual = materialQuantitySource === 'manual';
  const statusChip = isManual
    ? { label: 'Consumo manual', cls: 'bg-iconic-soft-blue/30 text-iconic-primary ring-iconic-soft-blue' }
    : { label: 'Consumo recomendado', cls: 'bg-gray-100 text-gray-500 ring-gray-400/20' };

  const preview = useMemo(() => {
    const q = Number(value);
    const price = Number(unitPriceSnapshot);
    const waste = Number(wastePct);
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(price) || !Number.isFinite(waste)) return null;
    const newSubtotal = q * (1 + waste) * price;
    const baseline = Number(recommendedMaterialQuantity ?? quantity);
    const deltaPct = Number.isFinite(baseline) && baseline > 0 ? ((q - baseline) / baseline) * 100 : null;
    return { newSubtotal, deltaPct };
  }, [value, unitPriceSnapshot, wastePct, recommendedMaterialQuantity, quantity]);

  const outOfBand = preview?.deltaPct != null && Math.abs(preview.deltaPct) > 20;
  const canReset = recommendedMaterialQuantity != null || isManual;

  if (!canEdit) {
    return (
      <span className="mt-1 flex flex-col items-end gap-0.5">
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusChip.cls}`}>
          {statusChip.label}
        </span>
      </span>
    );
  }

  return (
    <>
      <span className="mt-1 flex flex-col items-end gap-1">
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusChip.cls}`}>
          {statusChip.label}
        </span>
        <button
          type="button"
          onClick={() => { setValue(quantity); setOpen(true); }}
          className="inline-flex items-center gap-1 rounded-md border border-iconic-soft-blue/70 bg-white px-1.5 py-0.5 text-[10px] font-medium text-iconic-primary transition-colors hover:bg-iconic-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
        >
          <Ruler className="h-3 w-3" aria-hidden="true" /> Ajustar consumo
        </button>
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-iconic-ink/30 px-4 backdrop-blur-sm" role="presentation" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ajustar consumo del material"
            className="w-full max-w-md rounded-2xl border border-iconic-soft-blue bg-white p-5 text-left shadow-iconic"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-iconic-ink">Ajustar consumo del material</h3>
            <p className="mt-1 text-xs text-iconic-graphite/60">
              Modificar este consumo cambia la cantidad de material del APU. No cambia el precio
              unitario ni el desperdicio. Úsalo cuando el rendimiento del material varía por obra,
              proveedor o condición técnica. Este cambio solo aplica a este APU en borrador.
            </p>

            <div className="mt-3 space-y-1 rounded-lg bg-iconic-gray/40 px-3 py-2 text-[11px]">
              <div className="flex justify-between"><span className="text-iconic-graphite/60">Consumo actual</span><span className="font-medium tabular-nums">{quantityText}</span></div>
              {recommendedMaterialQuantity != null && (
                <div className="flex justify-between"><span className="text-iconic-graphite/60">Recomendado</span><span className="tabular-nums">{recommendedMaterialQuantity}</span></div>
              )}
              <div className="flex justify-between"><span className="text-iconic-graphite/60">Precio unitario</span><span className="tabular-nums">{formatCOP(unitPriceSnapshot)}</span></div>
              <div className="flex justify-between"><span className="text-iconic-graphite/60">Desperdicio</span><span className="tabular-nums">{(Number(wastePct) * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-iconic-graphite/60">Subtotal actual</span><span className="font-medium tabular-nums">{formatCOP(totalComponentCost)}</span></div>
            </div>

            <form action={formAction} className="mt-4 space-y-3">
              <input type="hidden" name="apuId" value={apuId} />
              <input type="hidden" name="componentId" value={componentId} />
              <label className="block text-sm">
                <span className="text-iconic-graphite/60">Consumo por unidad de obra</span>
                <input
                  type="number"
                  name="quantity"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={isPending}
                  className="mt-1 w-full rounded-md border border-iconic-soft-blue bg-white px-3 py-2 text-sm text-iconic-ink outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
                />
              </label>

              {preview && (
                <div className="rounded-md bg-iconic-gray/40 px-2.5 py-1.5 text-[11px] text-iconic-graphite/70">
                  Nuevo subtotal: <span className="font-medium tabular-nums">{formatCOP(String(preview.newSubtotal))}</span>
                  {preview.deltaPct != null && (
                    <span className="ml-2">Delta: <span className="font-medium tabular-nums">{preview.deltaPct >= 0 ? '+' : ''}{preview.deltaPct.toFixed(1)}%</span></span>
                  )}
                </div>
              )}
              {outOfBand && (
                <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Este cambio modifica el consumo en más de 20% frente al recomendado. Verifica que
                  corresponda a una condición real.
                </p>
              )}

              <label className="block text-sm">
                <span className="text-iconic-graphite/60">Justificación técnica (opcional)</span>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={500}
                  disabled={isPending}
                  placeholder="Ej. rendimiento real de obra / proveedor…"
                  className="mt-1 w-full rounded-md border border-iconic-soft-blue bg-white px-3 py-2 text-sm text-iconic-ink outline-none placeholder:text-iconic-graphite/40 focus-visible:ring-2 focus-visible:ring-iconic-primary"
                />
              </label>

              {state && !state.ok && <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 ring-1 ring-inset ring-red-600/20">{state.error}</p>}
              {state?.ok && <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Consumo guardado. Cierra para ver el APU actualizado.</p>}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button type="submit" disabled={isPending || preview === null} className="inline-flex items-center gap-1.5 rounded-lg bg-iconic-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-iconic-primary/90 disabled:opacity-60">
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Guardar
                </button>
                <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded-lg px-3 py-1.5 text-sm text-iconic-graphite/70 hover:bg-iconic-gray">
                  {state?.ok ? 'Cerrar' : 'Cancelar'}
                </button>
              </div>
            </form>

            {canReset && (
              <form action={resetAction} className="mt-2 border-t border-iconic-soft-blue/40 pt-2">
                <input type="hidden" name="apuId" value={apuId} />
                <input type="hidden" name="componentId" value={componentId} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-iconic-graphite/55">Para volver al valor original, usa Volver al recomendado.</span>
                  <button type="submit" disabled={isResetting} className="text-xs font-medium text-iconic-primary hover:underline disabled:opacity-50">
                    {isResetting ? 'Restaurando…' : 'Volver al recomendado'}
                  </button>
                </div>
                {resetState && !resetState.ok && <p className="mt-1 text-[11px] text-red-600">{resetState.error}</p>}
                {resetState?.ok && <p className="mt-1 text-[11px] text-emerald-700">Valor restaurado. Cierra para ver el APU.</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
