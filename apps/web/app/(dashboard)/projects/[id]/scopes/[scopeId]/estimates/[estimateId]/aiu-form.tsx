/**
 * aiu-form.tsx — Formulario AIU + resumen financiero (4D.2). Client Component.
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/AIU_CRUD_CONTRACT.md §6`.
 *
 * Preview INMEDIATA client-side (UX) con los porcentajes humanos; el cálculo
 * DEFINITIVO y la persistencia son server-side (`updateAiuAction`). Si la versión
 * está bloqueada, los campos son read-only y el CTA se deshabilita.
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, CheckCircle2, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/form-error';
import { Badge } from '@/components/ui/badge';
import { formatCOP } from '@/lib/utils/format';
import { AIU_MAX_RATE, type AiuRatesView, type FinancialSummary } from '@/lib/estimates/aiu-types';
import { updateAiuAction, type AiuActionResult } from './aiu-actions';

/** Preview client-side (solo UX); el valor definitivo lo recalcula el servidor. */
function previewSummary(directTotal: string, rates: Record<string, string>): FinancialSummary {
  const dt = Number(directTotal) || 0;
  const f = (v: string) => (Number(v) || 0) / 100;
  const a = dt * f(rates.administrationRate ?? '');
  const i = dt * f(rates.contingencyRate ?? '');
  const u = dt * f(rates.utilityRate ?? '');
  const iva = u * f(rates.utilityVatRate ?? '');
  const ind = a + i + u + iva;
  const s = (n: number) => n.toFixed(4);
  return {
    directTotal: s(dt), administrationAmount: s(a), contingencyAmount: s(i),
    utilityAmount: s(u), utilityVatAmount: s(iva), indirectTotal: s(ind), grandTotal: s(dt + ind),
  };
}

const FIELDS = [
  { name: 'administrationRate', label: 'Administración' },
  { name: 'contingencyRate', label: 'Imprevistos' },
  { name: 'utilityRate', label: 'Utilidad' },
  { name: 'utilityVatRate', label: 'IVA sobre utilidad' },
] as const;

export function AiuForm({
  estimateId,
  aiu,
  directTotal,
  serverSummary,
}: {
  estimateId: string;
  aiu: AiuRatesView;
  directTotal: string;
  serverSummary: FinancialSummary;
}) {
  const editable = aiu.editable;
  const [rates, setRates] = useState<Record<string, string>>({
    administrationRate: aiu.isEmpty ? '' : aiu.administrationRate,
    contingencyRate: aiu.isEmpty ? '' : aiu.contingencyRate,
    utilityRate: aiu.isEmpty ? '' : aiu.utilityRate,
    utilityVatRate: aiu.isEmpty ? '' : aiu.utilityVatRate,
  });
  const [summary, setSummary] = useState<FinancialSummary>(serverSummary);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Preview UX inmediata (no es la fuente de verdad).
  const preview = useMemo(() => previewSummary(directTotal, rates), [directTotal, rates]);

  function onChange(name: string, value: string) {
    setRates((r) => ({ ...r, [name]: value }));
    setSaved(false);
  }

  function save() {
    if (!editable || pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      for (const f of FIELDS) fd.set(f.name, rates[f.name] ?? '');
      const res: AiuActionResult = await updateAiuAction(fd);
      if (res.ok) {
        setSummary(res.summary); // resumen DEFINITIVO server-side
        setSaved(true);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        setError(res.error ?? null);
      }
    });
  }

  const shown = pending ? preview : saved ? summary : preview;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Formulario de porcentajes */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Porcentajes (%)</h3>
          <Badge variant="secondary">AIU ajustable por versión</Badge>
        </div>
        {!editable && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta versión no admite cambios (versión emitida). Los porcentajes son de solo lectura.
          </p>
        )}
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f.name} className="space-y-1">
              <Label htmlFor={f.name}>{f.label} (%)</Label>
              <div className="relative">
                <Input
                  id={f.name}
                  name={f.name}
                  type="number"
                  step="0.01"
                  min={0}
                  max={AIU_MAX_RATE}
                  inputMode="decimal"
                  value={rates[f.name] ?? ''}
                  onChange={(e) => onChange(f.name, e.target.value)}
                  disabled={!editable || pending}
                  placeholder="0"
                  aria-invalid={!!fieldErrors[f.name]}
                  className="pr-8"
                />
                <Percent className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" aria-hidden="true" />
              </div>
              {fieldErrors[f.name] && <FormError id={`err-${f.name}`} message={fieldErrors[f.name]!} />}
            </div>
          ))}
        </div>

        {error && <div className="mt-3"><FormError id="aiu-error" message={error} /></div>}
        {saved && !pending && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Ajustes guardados.
          </div>
        )}

        {editable && (
          <div className="mt-4">
            <Button type="button" onClick={save} disabled={pending} size="sm">
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Guardar ajustes
            </Button>
          </div>
        )}
      </div>

      {/* Resumen financiero */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Resumen financiero</h3>
        <dl className="space-y-1.5 text-sm">
          <Row label="Costos directos" value={formatCOP(shown.directTotal)} />
          <Row label="Administración" value={formatCOP(shown.administrationAmount)} muted />
          <Row label="Imprevistos" value={formatCOP(shown.contingencyAmount)} muted />
          <Row label="Utilidad" value={formatCOP(shown.utilityAmount)} muted />
          <Row label="IVA sobre utilidad" value={formatCOP(shown.utilityVatAmount)} muted />
          <Row label="Costos indirectos" value={formatCOP(shown.indirectTotal)} />
          <div className="mt-2 border-t border-gray-200 pt-2">
            <Row label="Total general" value={formatCOP(shown.grandTotal)} strong />
          </div>
        </dl>
        {pending && <p className="mt-2 text-xs text-gray-400">Vista previa (recalculando al guardar…).</p>}
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-gray-500' : 'text-gray-700'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-base font-bold text-blue-700' : muted ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
        {value}
      </dd>
    </div>
  );
}
