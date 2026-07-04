/**
 * manual-lines-table.tsx — Tabla de líneas manuales YA calculadas por el
 * dominio F1 (ml/kg/unidades comerciales/desperdicio). Presentacional.
 */
'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDecimal } from '@/lib/steel/format';
import type { ManualComputedLine } from '@/lib/steel/manual-takeoff';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

const WASTE_SEVERITY_CLASS: Record<'ok' | 'warning' | 'critical', string> = {
  ok: 'text-green-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
};

export function ManualLinesTable({
  lines,
  canEdit,
  onDelete,
}: {
  lines: readonly ManualComputedLine[];
  canEdit: boolean;
  onDelete: (lineId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-iconic-soft-blue/40">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-iconic-graphite/60">
          <tr>
            <th scope="col" className="px-3 py-2">Descripción original</th>
            <th scope="col" className="px-3 py-2">Interpretación</th>
            <th scope="col" className="px-3 py-2">Varilla</th>
            <th scope="col" className="px-3 py-2 text-right">Long. corte (m)</th>
            <th scope="col" className="px-3 py-2 text-right">Piezas</th>
            <th scope="col" className="px-3 py-2 text-right">Total ml</th>
            <th scope="col" className="px-3 py-2 text-right">Total kg</th>
            <th scope="col" className="px-3 py-2 text-right">Unid. com.</th>
            <th scope="col" className="px-3 py-2 text-right">Desp. %</th>
            <th scope="col" className="px-3 py-2">Estado</th>
            <th scope="col" className="px-3 py-2">Alertas</th>
            {canEdit && <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-iconic-soft-blue/20">
          {lines.map((line) => (
            <tr
              key={line.record.id}
              className={line.calculated.verificationStatus === 'needs_review' ? 'bg-amber-50/50' : undefined}
            >
              <td className="px-3 py-2 font-mono text-xs text-iconic-graphite/80">
                {line.record.originalDescription}
              </td>
              <td className="max-w-xs px-3 py-2 text-xs text-iconic-graphite/70" title={line.parsed.explanation}>
                <span className="line-clamp-2">{line.parsed.explanation}</span>
              </td>
              <td className="px-3 py-2">{line.barLabel}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.calculated.cutLengthM)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.totalPieces, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.calculated.totalMl)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.calculated.totalKg)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatDecimal(line.calculated.commercialUnitsRequired, 0)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums font-medium ${WASTE_SEVERITY_CLASS[line.wasteSeverity]}`}>
                {formatDecimal(line.wastePct, 1)}
              </td>
              <td className="px-3 py-2">
                <SteelStatusBadge kind="verification" status={line.calculated.verificationStatus ?? 'unreviewed'} />
              </td>
              <td className="px-3 py-2">
                {line.alerts.length === 0 ? (
                  <span className="text-xs text-iconic-graphite/40">—</span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      line.alerts.some((a) => a.severity === 'critical') ? 'text-red-700' : 'text-amber-700'
                    }`}
                    title={line.alerts.map((a) => `${a.code}: ${a.message}`).join(' · ')}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {line.alerts.length}
                  </span>
                )}
              </td>
              {canEdit && (
                <td className="px-3 py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(line.record.id)}
                    aria-label={`Eliminar línea ${line.record.originalDescription}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
