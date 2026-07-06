/**
 * manual-cut-plan-section.tsx — Envía las líneas válidas al optimizador FFD
 * REAL de F1 (`optimizeSteelCutsFFD` vía `buildManualCutPlan`) y muestra el
 * plan de corte por varilla + banco de sobrantes resultante.
 */
'use client';

import { useState } from 'react';
import { Plus, Ruler, Scissors, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineCallout } from '@/components/shared/inline-callout';
import { computeOffcutSavings, groupBarsBySpec } from '@/lib/steel/domain-bridge';
import { formatCop, formatDecimal } from '@/lib/steel/format';
import {
  DEFAULT_COMMERCIAL_LENGTHS_M,
  validateCommercialLengthInput,
  type ManualComputedLine,
  type ManualCutPlanResult,
} from '@/lib/steel/manual-takeoff';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

/**
 * Editor de longitudes comerciales del takeoff (F7.1): chips + alta/baja con
 * validación. El mercado cambia (proveedor/disponibilidad/desperdicio
 * asumido), así que 6/9/12 es solo el default — no una constante.
 */
function CommercialLengthsEditor({
  lengths,
  canEdit,
  onChange,
}: {
  lengths: readonly string[];
  canEdit: boolean;
  onChange: (next: readonly string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isDefault =
    lengths.length === DEFAULT_COMMERCIAL_LENGTHS_M.length &&
    lengths.every((length, index) => length === DEFAULT_COMMERCIAL_LENGTHS_M[index]);

  function handleAdd() {
    const result = validateCommercialLengthInput(draft);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (lengths.includes(result.lengthM)) {
      setError(`La longitud ${result.lengthM} m ya está en la lista.`);
      return;
    }
    setError(null);
    setDraft('');
    onChange([...lengths, result.lengthM].sort((a, b) => Number(a) - Number(b)));
  }

  function handleRemove(length: string) {
    if (lengths.length <= 1) {
      setError('Debe quedar al menos una longitud comercial disponible.');
      return;
    }
    setError(null);
    onChange(lengths.filter((l) => l !== length));
  }

  return (
    <div className="mb-3 rounded-lg border border-iconic-soft-blue/40 p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
        <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
        Longitudes comerciales
      </h4>
      <p className="mt-1 text-[11px] text-iconic-graphite/60">
        Longitudes de barra disponibles para el plan de corte y el pedido. Editables por takeoff:
        hoy 6/9/12 m, mañana puede cambiar por proveedor, disponibilidad o decisión de asumir
        desperdicio. Se guardan en este navegador.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lengths.map((length) => (
          <Badge key={length} variant="secondary" className="gap-1">
            {formatDecimal(length)} m
            {canEdit && (
              <button
                type="button"
                onClick={() => handleRemove(length)}
                aria-label={`Quitar longitud comercial ${length} m`}
                className="ml-0.5 rounded hover:text-red-600"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </Badge>
        ))}
        {isDefault && <span className="text-[11px] text-iconic-graphite/50">(default del preview)</span>}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-32">
            <Label htmlFor="commercial-length-input">Agregar (m)</Label>
            <Input
              id="commercial-length-input"
              type="number"
              min="0.5"
              step="0.5"
              value={draft}
              placeholder="7.5"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAdd();
                }
              }}
              className="mt-1"
            />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Agregar longitud
          </Button>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function ManualCutPlanSection({
  lines,
  planResult,
  commercialLengths,
  canEditLengths,
  onChangeCommercialLengths,
  onGenerate,
}: {
  lines: readonly ManualComputedLine[];
  planResult: ManualCutPlanResult | null;
  commercialLengths: readonly string[];
  canEditLengths: boolean;
  onChangeCommercialLengths: (next: readonly string[]) => void;
  onGenerate: () => void;
}) {
  const eligibleCount = lines.filter((l) => l.cutPlanEligible).length;
  const savings = planResult ? computeOffcutSavings([planResult.plan]) : null;

  return (
    <div>
      <CommercialLengthsEditor
        lengths={commercialLengths}
        canEdit={canEditLengths}
        onChange={onChangeCommercialLengths}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onGenerate} disabled={eligibleCount === 0}>
          <Scissors className="h-4 w-4" aria-hidden="true" />
          {planResult
            ? `Recalcular plan de corte (${eligibleCount} líneas válidas)`
            : `Enviar ${eligibleCount} línea(s) válida(s) al plan de corte`}
        </Button>
        {eligibleCount === 0 && (
          <span className="text-xs text-iconic-graphite/50">
            No hay líneas elegibles: cada línea necesita interpretación válida, longitud, cantidad y
            número de varilla.
          </span>
        )}
      </div>

      {planResult && planResult.excluded.length > 0 && (
        <InlineCallout tone="warning" title={`${planResult.excluded.length} línea(s) quedaron fuera del plan`} className="mb-3">
          <ul role="list" className="list-inside list-disc space-y-0.5">
            {planResult.excluded.map((item) => (
              <li key={item.lineId}>
                <code className="font-mono">{item.originalDescription}</code> — {item.reason}
              </li>
            ))}
          </ul>
        </InlineCallout>
      )}

      {planResult && (
        <>
          <InlineCallout tone="info" className="mb-3">
            Optimización FFD (first-fit decreasing) con longitudes comerciales{' '}
            {commercialLengths.map((l) => formatDecimal(l)).join(' / ')} m: heurística buena, no
            necesariamente el óptimo absoluto. Desperdicio final del plan:{' '}
            {formatDecimal(planResult.plan.totalWasteM)} m.
          </InlineCallout>

          {planResult.plan.rejectedCuts.length > 0 && (
            <InlineCallout tone="warning" title="Cortes rechazados por el optimizador" className="mb-3">
              <ul role="list" className="list-inside list-disc space-y-0.5">
                {planResult.plan.rejectedCuts.map((cut) => (
                  <li key={cut.cutId}>{cut.reason}</li>
                ))}
              </ul>
            </InlineCallout>
          )}

          <div className="space-y-4">
            {groupBarsBySpec(planResult.plan).map((group) => (
              <div key={group.specId}>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
                  {group.specLabel} · {group.bars.length} barra(s) comercial(es)
                </h4>
                <div className="overflow-x-auto rounded-xl border border-iconic-soft-blue/40">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-iconic-graphite/60">
                      <tr>
                        <th scope="col" className="px-3 py-2">Barra</th>
                        <th scope="col" className="px-3 py-2 text-right">Long. comercial (m)</th>
                        <th scope="col" className="px-3 py-2">Cortes asignados (m)</th>
                        <th scope="col" className="px-3 py-2 text-right">Sobrante (m)</th>
                        <th scope="col" className="px-3 py-2">Destino del sobrante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-iconic-soft-blue/20">
                      {group.bars.map((bar) => (
                        <tr key={bar.id}>
                          <td className="px-3 py-2 font-medium text-iconic-ink">{bar.id}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(bar.commercialLengthM)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-iconic-graphite/80">
                            {bar.assignments.map((a) => formatDecimal(a.lengthM)).join(' + ')}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(bar.remainingLengthM)}</td>
                          <td className="px-3 py-2">
                            <SteelStatusBadge kind="offcut" status={bar.offcutStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
              Banco de sobrantes del plan
            </h4>
            {planResult.plan.offcuts.length === 0 ? (
              <p className="text-xs text-iconic-graphite/50">
                El plan no dejó sobrantes reutilizables (≥ mínimo útil configurado).
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-iconic-soft-blue/40">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-iconic-graphite/60">
                      <tr>
                        <th scope="col" className="px-3 py-2">Sobrante</th>
                        <th scope="col" className="px-3 py-2 text-right">Longitud (m)</th>
                        <th scope="col" className="px-3 py-2">Estado</th>
                        <th scope="col" className="px-3 py-2">Barra origen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-iconic-soft-blue/20">
                      {planResult.plan.offcuts.map((offcut) => (
                        <tr key={offcut.id}>
                          <td className="px-3 py-2 font-medium text-iconic-ink">{offcut.id}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(offcut.lengthM)}</td>
                          <td className="px-3 py-2">
                            <SteelStatusBadge kind="offcut" status={offcut.status} />
                          </td>
                          <td className="px-3 py-2 text-xs text-iconic-graphite/60">
                            {offcut.sourceCutPlanBarId ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {savings && (
                  <p className="mt-2 text-xs text-iconic-graphite/60">
                    Reutilizar los sobrantes disponibles ahorraría ≈ {formatDecimal(savings.totalMl)} ml ·{' '}
                    {formatDecimal(savings.totalKg, 1)} kg · {formatCop(savings.totalCop)} (precio COP de
                    referencia mock, no aprobado).
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
