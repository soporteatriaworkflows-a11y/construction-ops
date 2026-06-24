/**
 * waste-override-control.tsx — Edición controlada del desperdicio de un
 * componente APU (APU_SMART_DEFAULTS_V1B). Client Component.
 *
 * Gated por `canEdit` (resuelto server-side). Si NO se puede editar, muestra un
 * chip "Solo lectura". Si se puede, ofrece un panel modal con recomendado vs
 * aplicado, delta, rango, advertencia, justificación opcional, Guardar y Volver
 * al recomendado. Solo edita el desperdicio (vía server action → RPC backstop).
 */
'use client';

import { useActionState, useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import {
  updateApuComponentWasteOverrideAction,
  type WasteOverrideActionResult,
} from '../actions';
import { formatFractionPct } from '@/app/(dashboard)/apu/_lib/apu-factor-display';

interface Props {
  apuId: string;
  componentId: string;
  /** Fracción aplicada (efectiva) actual. */
  applied: string;
  /** Fracción recomendada (= aplicada si no hay recomendado persistido). */
  recommended: string;
  /** Banda sugerida [min,max] en fracción, o null si no aplica al tipo. */
  suggestedRange: { min: number; max: number } | null;
  canEdit: boolean;
}

const INITIAL: WasteOverrideActionResult | null = null;

export function WasteOverrideControl({
  apuId,
  componentId,
  applied,
  recommended,
  suggestedRange,
  canEdit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(() => round1(Number(applied) * 100));
  const [state, formAction, isPending] = useActionState(
    updateApuComponentWasteOverrideAction,
    INITIAL,
  );

  if (!canEdit) {
    return (
      <span className="mt-1 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-inset ring-gray-400/20">
        Solo lectura
      </span>
    );
  }

  const recommendedPct = round1(Number(recommended) * 100);
  const fraction = pct / 100;
  const delta = round1(pct - recommendedPct);
  const outOfRange = suggestedRange !== null && fraction > suggestedRange.max;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPct(round1(Number(applied) * 100));
          setOpen(true);
        }}
        className="mt-1 inline-flex items-center gap-1 rounded-md border border-iconic-soft-blue/70 bg-white px-1.5 py-0.5 text-[10px] font-medium text-iconic-primary transition-colors hover:bg-iconic-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
      >
        <SlidersHorizontal className="h-3 w-3" aria-hidden="true" /> Ajustar desperdicio
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-iconic-ink/30 px-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ajustar desperdicio del componente"
            className="w-full max-w-sm rounded-2xl border border-iconic-soft-blue bg-white p-5 text-left shadow-iconic"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-iconic-ink">Ajustar desperdicio</h3>
            <p className="mt-1 text-xs text-iconic-graphite/60">
              Este valor afecta el consumo del material dentro del APU. Úsalo solo si las
              condiciones reales del proyecto justifican un desperdicio diferente.
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-iconic-graphite/60">Valor recomendado</span>
                <span className="font-medium text-iconic-ink tabular-nums">
                  {formatFractionPct(Number(recommended))}
                </span>
              </div>

              <form action={formAction} className="space-y-3">
                <input type="hidden" name="apuId" value={apuId} />
                <input type="hidden" name="componentId" value={componentId} />
                <input type="hidden" name="wastePct" value={String(fraction)} />

                <label className="block text-sm">
                  <span className="text-iconic-graphite/60">Valor aplicado (%)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.1}
                    value={pct}
                    onChange={(e) => setPct(round1(Number(e.target.value)))}
                    disabled={isPending}
                    className="mt-1 w-full rounded-md border border-iconic-soft-blue bg-white px-3 py-2 text-sm text-iconic-ink outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
                  />
                </label>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-iconic-graphite/55">
                    Delta: <span className="font-medium tabular-nums">{delta >= 0 ? '+' : ''}{delta}%</span>
                  </span>
                  {suggestedRange && (
                    <span className="text-iconic-graphite/45">
                      Sugerido: {formatFractionPct(suggestedRange.min)} – {formatFractionPct(suggestedRange.max)}
                    </span>
                  )}
                </div>

                {outOfRange && (
                  <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    Este valor está por fuera del rango sugerido. Verifica si corresponde a una
                    condición especial.
                  </p>
                )}

                <label className="block text-sm">
                  <span className="text-iconic-graphite/60">Justificación técnica (opcional)</span>
                  <textarea
                    name="note"
                    rows={2}
                    maxLength={500}
                    disabled={isPending}
                    placeholder="Ej. material frágil / condiciones de obra…"
                    className="mt-1 w-full rounded-md border border-iconic-soft-blue bg-white px-3 py-2 text-sm text-iconic-ink outline-none placeholder:text-iconic-graphite/40 focus-visible:ring-2 focus-visible:ring-iconic-primary"
                  />
                </label>

                {state && !state.ok && (
                  <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 ring-1 ring-inset ring-red-600/20">
                    {state.error}
                  </p>
                )}
                {state?.ok && (
                  <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    Ajuste guardado. Cierra para ver el APU actualizado.
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPct(recommendedPct)}
                    disabled={isPending}
                    className="text-xs font-medium text-iconic-primary hover:underline disabled:opacity-50"
                  >
                    Volver al recomendado
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      disabled={isPending}
                      className="rounded-lg px-3 py-1.5 text-sm text-iconic-graphite/70 hover:bg-iconic-gray"
                    >
                      {state?.ok ? 'Cerrar' : 'Cancelar'}
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-iconic-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-iconic-primary/90 disabled:opacity-60"
                    >
                      {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      Guardar ajuste
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Redondea a 1 decimal (umbral visual, no financiero). */
function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}
