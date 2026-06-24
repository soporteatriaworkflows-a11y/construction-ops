/**
 * productivity-override-control.tsx — Edición controlada del rendimiento/cuadrilla
 * de un componente de mano de obra (APU_PRODUCTIVITY_CREW_OVERRIDES_V1C). Client
 * Component.
 *
 * Gated por `canEdit` (resuelto server-side). Si NO se puede editar, muestra el
 * estado (chip Manual/Heredado) + "Solo lectura". Si se puede, ofrece un panel
 * modal: editar consumo laboral directo (persona·día/unidad) o rendimiento de
 * cuadrilla (unidades/día de cuadrilla + tamaño de cuadrilla), con preview de la
 * nueva cantidad, delta y "Volver al heredado". Solo edita `quantity` (vía RPC);
 * NO cambia precio diario, unit_price_snapshot ni desperdicio.
 */
'use client';

import { useActionState, useMemo, useState } from 'react';
import { Loader2, Gauge } from 'lucide-react';
import {
  updateApuComponentLaborProductivityOverrideAction,
  resetApuComponentLaborProductivityOverrideAction,
  type ProductivityOverrideActionResult,
} from '../actions';
import { validateProductivityOverrideInput, type ProductivityUnit } from '@/modules/apu/productivity';

interface Props {
  apuId: string;
  componentId: string;
  /** Cantidad consolidada actual (persona·día/unidad). */
  quantity: string;
  /** Cantidad formateada para mostrar. */
  quantityText: string;
  /** Consumo laboral recomendado congelado (heredado), o null. */
  recommendedLaborQuantity: string | null;
  /** Origen del valor: 'manual' | 'reset' | null (heredado). */
  productivitySource: string | null;
  canEdit: boolean;
}

const INITIAL: ProductivityOverrideActionResult | null = null;

export function ProductivityOverrideControl({
  apuId,
  componentId,
  quantity,
  quantityText,
  recommendedLaborQuantity,
  productivitySource,
  canEdit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<ProductivityUnit>('unit_per_crew_day');
  const [productivity, setProductivity] = useState('');
  const [crewSize, setCrewSize] = useState('1');
  const [state, formAction, isPending] = useActionState(
    updateApuComponentLaborProductivityOverrideAction,
    INITIAL,
  );
  const [resetState, resetAction, isResetting] = useActionState(
    resetApuComponentLaborProductivityOverrideAction,
    INITIAL,
  );

  const isManual = productivitySource === 'manual';
  const statusChip = isManual
    ? { label: 'Rendimiento manual', cls: 'bg-iconic-soft-blue/30 text-iconic-primary ring-iconic-soft-blue' }
    : { label: 'Rendimiento heredado', cls: 'bg-gray-100 text-gray-500 ring-gray-400/20' };

  // Preview de la nueva cantidad (espejo PURO de la RPC; no muta nada).
  const preview = useMemo(() => {
    const v = validateProductivityOverrideInput({
      productivityUnit: unit,
      productivity: productivity.trim(),
      crewSize: unit === 'unit_per_crew_day' ? crewSize.trim() : null,
    });
    if (!v.ok) return null;
    const baseline = recommendedLaborQuantity ?? quantity;
    const base = Number(baseline);
    const next = Number(v.newQuantity);
    const deltaPct = Number.isFinite(base) && base > 0 ? ((next - base) / base) * 100 : null;
    return { newQuantity: v.newQuantity, deltaPct };
  }, [unit, productivity, crewSize, quantity, recommendedLaborQuantity]);

  const outOfBand = preview?.deltaPct != null && Math.abs(preview.deltaPct) > 20;
  const canReset = recommendedLaborQuantity != null || isManual;

  if (!canEdit) {
    return (
      <span className="mt-1 flex flex-col items-end gap-0.5">
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusChip.cls}`}>
          {statusChip.label}
        </span>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 ring-1 ring-inset ring-gray-400/20">
          Solo lectura
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
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-iconic-soft-blue/70 bg-white px-1.5 py-0.5 text-[10px] font-medium text-iconic-primary transition-colors hover:bg-iconic-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
        >
          <Gauge className="h-3 w-3" aria-hidden="true" /> Ajustar rendimiento
        </button>
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-iconic-ink/30 px-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ajustar rendimiento del componente de mano de obra"
            className="w-full max-w-md rounded-2xl border border-iconic-soft-blue bg-white p-5 text-left shadow-iconic"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-iconic-ink">Ajustar rendimiento de mano de obra</h3>
            <p className="mt-1 text-xs text-iconic-graphite/60">
              Modificar este rendimiento cambia la cantidad de mano de obra del APU. No cambia el
              precio diario ni el costo unitario de la cuadrilla. Solo úsalo si tienes criterio
              técnico o datos reales de obra. Este cambio solo aplica a este APU en borrador.
            </p>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-iconic-gray/40 px-3 py-2 text-xs">
              <span className="text-iconic-graphite/60">Cantidad consolidada actual</span>
              <span className="font-medium tabular-nums text-iconic-ink">{quantityText} persona·día / unidad</span>
            </div>

            <form action={formAction} className="mt-4 space-y-3">
              <input type="hidden" name="apuId" value={apuId} />
              <input type="hidden" name="componentId" value={componentId} />
              <input type="hidden" name="productivityUnit" value={unit} />

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-iconic-graphite/70">Forma de ajuste</legend>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="unitChoice"
                    checked={unit === 'unit_per_crew_day'}
                    onChange={() => setUnit('unit_per_crew_day')}
                    disabled={isPending}
                  />
                  Rendimiento de cuadrilla (unidades / día de cuadrilla)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="unitChoice"
                    checked={unit === 'person_day_per_unit'}
                    onChange={() => setUnit('person_day_per_unit')}
                    disabled={isPending}
                  />
                  Consumo laboral directo (persona·día / unidad)
                </label>
              </fieldset>

              <label className="block text-sm">
                <span className="text-iconic-graphite/60">
                  {unit === 'unit_per_crew_day' ? 'Rendimiento (unidades / día)' : 'Consumo (persona·día / unidad)'}
                </span>
                <input
                  type="number"
                  name="productivity"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={productivity}
                  onChange={(e) => setProductivity(e.target.value)}
                  disabled={isPending}
                  className="mt-1 w-full rounded-md border border-iconic-soft-blue bg-white px-3 py-2 text-sm text-iconic-ink outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
                />
              </label>

              {unit === 'unit_per_crew_day' && (
                <label className="block text-sm">
                  <span className="text-iconic-graphite/60">Tamaño de cuadrilla (personas)</span>
                  <input
                    type="number"
                    name="crewSize"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={crewSize}
                    onChange={(e) => setCrewSize(e.target.value)}
                    disabled={isPending}
                    className="mt-1 w-full rounded-md border border-iconic-soft-blue bg-white px-3 py-2 text-sm text-iconic-ink outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
                  />
                </label>
              )}
              {unit === 'person_day_per_unit' && <input type="hidden" name="crewSize" value="" />}

              {preview && (
                <div className="rounded-md bg-iconic-gray/40 px-2.5 py-1.5 text-[11px] text-iconic-graphite/70">
                  Nueva cantidad: <span className="font-medium tabular-nums">{preview.newQuantity}</span> persona·día / unidad
                  {preview.deltaPct != null && (
                    <span className="ml-2">
                      Delta: <span className="font-medium tabular-nums">{preview.deltaPct >= 0 ? '+' : ''}{preview.deltaPct.toFixed(1)}%</span>
                    </span>
                  )}
                </div>
              )}
              {outOfBand && (
                <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Este cambio modifica el costo de mano de obra en más de 20% frente al valor heredado.
                  Verifica que corresponda a una condición real de obra.
                </p>
              )}

              <label className="block text-sm">
                <span className="text-iconic-graphite/60">Justificación técnica (opcional)</span>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={500}
                  disabled={isPending}
                  placeholder="Ej. cuadrilla reforzada / condiciones de obra…"
                  className="mt-1 w-full rounded-md border border-iconic-soft-blue bg-white px-3 py-2 text-sm text-iconic-ink outline-none placeholder:text-iconic-graphite/40 focus-visible:ring-2 focus-visible:ring-iconic-primary"
                />
              </label>

              {state && !state.ok && (
                <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 ring-1 ring-inset ring-red-600/20">{state.error}</p>
              )}
              {state?.ok && (
                <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Rendimiento guardado. Cierra para ver el APU actualizado.
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isPending || preview === null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-iconic-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-iconic-primary/90 disabled:opacity-60"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="rounded-lg px-3 py-1.5 text-sm text-iconic-graphite/70 hover:bg-iconic-gray"
                >
                  {state?.ok ? 'Cerrar' : 'Cancelar'}
                </button>
              </div>
            </form>

            {canReset && (
              <form action={resetAction} className="mt-2 border-t border-iconic-soft-blue/40 pt-2">
                <input type="hidden" name="apuId" value={apuId} />
                <input type="hidden" name="componentId" value={componentId} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-iconic-graphite/55">
                    Para volver al valor original, usa Volver al heredado.
                  </span>
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="text-xs font-medium text-iconic-primary hover:underline disabled:opacity-50"
                  >
                    {isResetting ? 'Restaurando…' : 'Volver al heredado'}
                  </button>
                </div>
                {resetState && !resetState.ok && (
                  <p className="mt-1 text-[11px] text-red-600">{resetState.error}</p>
                )}
                {resetState?.ok && <p className="mt-1 text-[11px] text-emerald-700">Valor restaurado. Cierra para ver el APU.</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
