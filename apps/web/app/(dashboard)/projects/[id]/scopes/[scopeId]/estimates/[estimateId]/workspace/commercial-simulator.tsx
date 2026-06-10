/**
 * commercial-simulator.tsx — Panel "Simulador comercial" (V1). Client Component.
 * Oleada OPERATIONAL BUDGET UX V1. Contrato §5.
 *
 * SEPARADO del presupuesto técnico: no modifica BOQ, AIU, versiones ni exports.
 * Preview client-side INMEDIATA (solo UX, como AiuForm); el cálculo DEFINITIVO
 * es server-side (`simulateCommercialAction`, base técnico server-derived).
 * Sin persistencia en esta oleada (decisión registrada en DECISIONS.md).
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, Calculator, Target, TrendingDown, TrendingUp, CheckCircle2, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/auth/form-error';
import { formatCOP } from '@/lib/utils/format';
import {
  COMMERCIAL_SIMULATION_DISCLAIMER,
  type CommercialSimulationResult,
  type TargetStatus,
} from '@/modules/estimates/commercial-simulation';
import { simulateCommercialAction, type SimulateCommercialResult } from './simulator-actions';

/** Preview client-side (solo UX); el valor definitivo lo calcula el servidor. */
function previewSimulation(baseTotal: string, f: Record<string, string>): CommercialSimulationResult {
  const base = Number(baseTotal) || 0;
  const pct = (v: string) => (Number((v ?? '').replace(',', '.')) || 0) / 100;
  const commercialSubtotal = base * (1 + pct(f.commercialAdjustmentPct ?? ''));
  const discountAmount = commercialSubtotal * pct(f.discountPct ?? '');
  const subtotalAfterDiscount = commercialSubtotal - discountAmount;
  const additionalTaxAmount = subtotalAfterDiscount * pct(f.additionalTaxPct ?? '');
  const finalPrice = subtotalAfterDiscount + additionalTaxAmount;
  const targetRaw = (f.targetPrice ?? '').trim();
  const target = targetRaw === '' ? null : Number(targetRaw.replace(',', '.'));
  const diff = target === null || Number.isNaN(target) ? null : finalPrice - target;
  const s = (n: number) => n.toFixed(4);
  return {
    baseTotal: s(base),
    commercialAdjustmentPct: f.commercialAdjustmentPct ?? '0',
    discountPct: f.discountPct ?? '0',
    additionalTaxPct: f.additionalTaxPct ?? '0',
    commercialSubtotal: s(commercialSubtotal),
    discountAmount: s(discountAmount),
    subtotalAfterDiscount: s(subtotalAfterDiscount),
    additionalTaxAmount: s(additionalTaxAmount),
    finalPrice: s(finalPrice),
    targetPrice: target === null || Number.isNaN(target) ? null : s(target),
    targetDifference: diff === null ? null : s(diff),
    targetStatus: diff === null ? null : diff === 0 ? 'on_target' : diff > 0 ? 'above_target' : 'below_target',
  };
}

const TARGET_STATUS_UI: Record<TargetStatus, { label: string; className: string; Icon: typeof Target }> = {
  on_target: { label: 'Dentro del objetivo', className: 'bg-green-50 text-green-700 border-green-200', Icon: Target },
  above_target: { label: 'Por encima del objetivo', className: 'bg-red-50 text-red-700 border-red-200', Icon: TrendingUp },
  below_target: { label: 'Por debajo del objetivo', className: 'bg-blue-50 text-blue-700 border-blue-200', Icon: TrendingDown },
};

const PCT_FIELDS = [
  { name: 'commercialAdjustmentPct', label: 'Ajuste comercial (%)', hint: 'Margen o rebaja sobre el total técnico (−100 a 100).', min: -100 },
  { name: 'discountPct', label: 'Descuento (%)', hint: 'Sobre el subtotal comercial (0 a 100).', min: 0 },
  { name: 'additionalTaxPct', label: 'Impuesto adicional (%)', hint: 'Sobre el subtotal con descuento (0 a 100).', min: 0 },
] as const;

export function CommercialSimulator({
  estimateId,
  baseTotal,
}: {
  estimateId: string;
  baseTotal: string;
}) {
  const [fields, setFields] = useState<Record<string, string>>({
    commercialAdjustmentPct: '',
    discountPct: '',
    additionalTaxPct: '',
    targetPrice: '',
  });
  const [serverResult, setServerResult] = useState<CommercialSimulationResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => previewSimulation(baseTotal, fields), [baseTotal, fields]);
  // Resultado mostrado: definitivo del servidor cuando está al día; si el usuario
  // cambia un campo después de simular, vuelve a la preview (y se indica).
  const showingServer = serverResult !== null;
  const shown = showingServer ? serverResult : preview;

  function onChange(name: string, value: string) {
    setFields((f) => ({ ...f, [name]: value }));
    setServerResult(null); // la preview vuelve a mandar hasta recalcular
    setError(null);
  }

  function simulate() {
    if (pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      fd.set('commercialAdjustmentPct', fields.commercialAdjustmentPct ?? '');
      fd.set('discountPct', fields.discountPct ?? '');
      fd.set('additionalTaxPct', fields.additionalTaxPct ?? '');
      fd.set('targetPrice', fields.targetPrice ?? '');
      const res: SimulateCommercialResult = await simulateCommercialAction(fd);
      if (res.ok) {
        setServerResult(res.result);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        setError(res.error ?? null);
      }
    });
  }

  const statusUi = shown.targetStatus ? TARGET_STATUS_UI[shown.targetStatus] : null;

  return (
    <div className="rounded-xl border-2 border-dashed border-iconic-cyan/50 bg-cyan-50/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-iconic-ink">
          <Calculator className="h-4 w-4 text-iconic-primary" aria-hidden="true" />
          Simulador comercial
        </h3>
        <Badge variant="secondary">Simulación · no modifica el presupuesto técnico</Badge>
      </div>

      <p className="mb-4 rounded-md border border-cyan-200 bg-white/70 px-3 py-2 text-xs text-iconic-graphite" role="note">
        {COMMERCIAL_SIMULATION_DISCLAIMER}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Parámetros */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Total técnico base</span>
            <span className="font-bold tabular-nums text-iconic-ink">{formatCOP(baseTotal)}</span>
          </div>
          <div className="space-y-3">
            {PCT_FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label htmlFor={`sim-${f.name}`}>{f.label}</Label>
                <div className="relative">
                  <Input
                    id={`sim-${f.name}`}
                    type="number"
                    step="0.01"
                    min={f.min}
                    max={100}
                    inputMode="decimal"
                    value={fields[f.name] ?? ''}
                    onChange={(e) => onChange(f.name, e.target.value)}
                    disabled={pending}
                    placeholder="0"
                    aria-invalid={!!fieldErrors[f.name]}
                    className="pr-8"
                  />
                  <Percent className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" aria-hidden="true" />
                </div>
                <p className="text-[11px] text-gray-400">{f.hint}</p>
                {fieldErrors[f.name] && <FormError id={`err-sim-${f.name}`} message={fieldErrors[f.name]!} />}
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="sim-targetPrice">Precio objetivo (COP, opcional)</Label>
              <Input
                id="sim-targetPrice"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                value={fields.targetPrice ?? ''}
                onChange={(e) => onChange('targetPrice', e.target.value)}
                disabled={pending}
                placeholder="Sin objetivo"
                aria-invalid={!!fieldErrors.targetPrice}
              />
              {fieldErrors.targetPrice && <FormError id="err-sim-targetPrice" message={fieldErrors.targetPrice} />}
            </div>
          </div>

          {error && <div className="mt-3"><FormError id="sim-error" message={error} /></div>}

          <div className="mt-4 flex items-center gap-3">
            <Button type="button" size="sm" onClick={simulate} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Simular
            </Button>
            {showingServer && !pending && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Cálculo definitivo (server-side)
              </span>
            )}
            {!showingServer && !pending && (
              <span className="text-xs text-gray-400">Vista previa — pulsa Simular para el cálculo definitivo.</span>
            )}
          </div>
        </div>

        {/* Vista previa comercial (F): lectura limpia del resultado */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-900">Vista previa comercial</h4>
          <dl className="space-y-1.5 text-sm">
            <SimRow label="Total técnico" value={formatCOP(shown.baseTotal)} />
            <SimRow label="Subtotal comercial (con ajuste)" value={formatCOP(shown.commercialSubtotal)} muted />
            <SimRow label="Descuento" value={`− ${formatCOP(shown.discountAmount)}`} muted />
            <SimRow label="Subtotal con descuento" value={formatCOP(shown.subtotalAfterDiscount)} muted />
            <SimRow label="Impuesto adicional" value={`+ ${formatCOP(shown.additionalTaxAmount)}`} muted />
            <div className="mt-2 border-t border-gray-200 pt-2">
              <SimRow label="Precio final simulado" value={formatCOP(shown.finalPrice)} strong />
            </div>
            {shown.targetPrice !== null && (
              <>
                <SimRow label="Precio objetivo" value={formatCOP(shown.targetPrice)} />
                <SimRow
                  label="Diferencia frente al objetivo"
                  value={
                    shown.targetDifference !== null && Number(shown.targetDifference) < 0
                      ? `− ${formatCOP(String(Math.abs(Number(shown.targetDifference))))}`
                      : formatCOP(shown.targetDifference ?? '0')
                  }
                />
              </>
            )}
          </dl>
          {statusUi && (
            <div className={`mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${statusUi.className}`} role="status">
              <statusUi.Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {statusUi.label}
            </div>
          )}
          {pending && <p className="mt-2 text-xs text-gray-400">Calculando en el servidor…</p>}
        </div>
      </div>
    </div>
  );
}

function SimRow({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-gray-500' : 'text-gray-700'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-base font-bold text-iconic-primary' : muted ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
        {value}
      </dd>
    </div>
  );
}
