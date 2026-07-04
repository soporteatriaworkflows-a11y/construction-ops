/**
 * manual-alerts-panel.tsx — Alertas por línea (Agente 4): diferencia OK /
 * warning / critical y explica POR QUÉ algo necesita revisión, usando las
 * alertas reales de F1 (`evaluateSteelLineAlerts`) + la explicación del parser.
 */
'use client';

import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { InlineCallout } from '@/components/shared/inline-callout';
import type { ManualComputedLine } from '@/lib/steel/manual-takeoff';

const SEVERITY_META = {
  critical: { label: 'Crítico', chip: 'bg-red-100 text-red-800', Icon: AlertOctagon },
  warning: { label: 'Advertencia', chip: 'bg-amber-100 text-amber-800', Icon: AlertTriangle },
  info: { label: 'Info', chip: 'bg-gray-100 text-gray-700', Icon: Info },
} as const;

export function ManualAlertsPanel({ lines }: { lines: readonly ManualComputedLine[] }) {
  const linesWithAlerts = lines.filter((l) => l.alerts.length > 0);

  if (lines.length === 0) return null;

  if (linesWithAlerts.length === 0) {
    return (
      <InlineCallout tone="success" title="Sin alertas">
        Todas las líneas se interpretaron con confianza suficiente y ninguna supera los umbrales de
        desperdicio.
      </InlineCallout>
    );
  }

  return (
    <div className="space-y-3">
      {linesWithAlerts.map((line) => (
        <div key={line.record.id} className="rounded-xl border border-iconic-soft-blue/40 bg-surface p-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <code className="rounded bg-brand-50/70 px-1.5 py-0.5 font-mono text-xs text-iconic-ink">
              {line.record.originalDescription}
            </code>
            <span className="text-xs text-iconic-graphite/50">{line.barLabel}</span>
          </div>
          {line.parsed.needsReview && (
            <p className="mb-2 text-xs text-iconic-graphite/70">
              <span className="font-medium">Por qué necesita revisión:</span> {line.parsed.explanation}
            </p>
          )}
          <ul role="list" className="space-y-1">
            {line.alerts.map((alert) => {
              const meta = SEVERITY_META[alert.severity];
              const Icon = meta.Icon;
              return (
                <li key={`${line.record.id}-${alert.code}`} className="flex items-start gap-2 text-xs">
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium ${meta.chip}`}>
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {meta.label} · {alert.code}
                  </span>
                  <span className="text-iconic-graphite/70">{alert.message}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="flex items-center gap-1.5 text-[11px] text-iconic-graphite/50">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
        Las líneas sin alertas están OK: interpretación confiable, con especificación y desperdicio
        dentro de umbral.
      </p>
    </div>
  );
}
