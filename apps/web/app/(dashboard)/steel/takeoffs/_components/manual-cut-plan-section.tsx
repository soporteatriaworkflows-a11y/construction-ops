/**
 * manual-cut-plan-section.tsx — Envía las líneas válidas al optimizador FFD
 * REAL de F1 (`optimizeSteelCutsFFD` vía `buildManualCutPlan`) y muestra el
 * plan de corte por varilla + banco de sobrantes resultante.
 */
'use client';

import { Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineCallout } from '@/components/shared/inline-callout';
import { computeOffcutSavings, groupBarsBySpec } from '@/lib/steel/domain-bridge';
import { formatCop, formatDecimal } from '@/lib/steel/format';
import type { ManualComputedLine, ManualCutPlanResult } from '@/lib/steel/manual-takeoff';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

export function ManualCutPlanSection({
  lines,
  planResult,
  onGenerate,
}: {
  lines: readonly ManualComputedLine[];
  planResult: ManualCutPlanResult | null;
  onGenerate: () => void;
}) {
  const eligibleCount = lines.filter((l) => l.cutPlanEligible).length;
  const savings = planResult ? computeOffcutSavings([planResult.plan]) : null;

  return (
    <div>
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
            {['6', '9', '12'].join(' / ')} m: heurística buena, no necesariamente el óptimo absoluto.
            Desperdicio final del plan: {formatDecimal(planResult.plan.totalWasteM)} m.
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
