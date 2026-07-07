/**
 * manual-lines-table.tsx — Tabla de líneas manuales YA calculadas por el
 * dominio F1 (ml/kg/unidades comerciales/desperdicio). Presentacional.
 * F8D: botón "Ver cálculo" por línea — expande la explicación legible
 * (texto original, interpretación, fórmulas ML/KG, fuente del desperdicio y
 * evidencia) sin recalcular nada fuera de F1.
 */
'use client';

import { Fragment, useState } from 'react';
import { AlertTriangle, Calculator, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDecimal } from '@/lib/steel/format';
import type { ManualComputedLine } from '@/lib/steel/manual-takeoff';
import { explainSteelCalculation } from '@/lib/steel/steel-calculation-explanation';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

const WASTE_SEVERITY_CLASS: Record<'ok' | 'warning' | 'critical', string> = {
  ok: 'text-green-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
};

function CalculationDetail({ line }: { line: ManualComputedLine }) {
  const explanation = explainSteelCalculation(line);
  return (
    <div className="rounded border border-iconic-soft-blue/30 bg-brand-50/40 p-2 text-[11px] dark:bg-surface-soft">
      <p>
        <span className="text-iconic-graphite/50">Texto original: </span>
        <code className="font-medium">{explanation.originalDescription}</code>
      </p>
      <p><span className="text-iconic-graphite/50">Interpretación: </span>{explanation.interpretation}</p>
      <p><span className="text-iconic-graphite/50">Cantidad: </span>{explanation.quantityText}</p>
      <p><span className="text-iconic-graphite/50">Longitud de corte: </span>{explanation.cutLengthText}</p>
      <p>{explanation.mlFormula}</p>
      <p>{explanation.kgFormula}</p>
      {explanation.commercialFormula && <p>{explanation.commercialFormula}</p>}
      <p className="text-iconic-graphite/70">{explanation.wasteText}</p>
      {explanation.sourceText && (
        <p className="text-iconic-graphite/60">
          <span className="text-iconic-graphite/50">Evidencia: </span>
          {explanation.sourceText}
        </p>
      )}
      {explanation.warnings.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-amber-700 dark:text-amber-400">
          {explanation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ManualLinesTable({
  lines,
  canEdit,
  onDelete,
}: {
  lines: readonly ManualComputedLine[];
  canEdit: boolean;
  onDelete: (lineId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const columnCount = canEdit ? 12 : 11;
  const manualWaste = lines.some((line) => line.wasteSource === 'manual');

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
            <Fragment key={line.record.id}>
              <tr
                className={line.calculated.verificationStatus === 'needs_review' ? 'bg-amber-50/50' : undefined}
              >
                <td className="px-3 py-2 font-mono text-xs text-iconic-graphite/80">
                  {line.record.originalDescription}
                </td>
                <td className="max-w-xs px-3 py-2 text-xs text-iconic-graphite/70" title={line.parsed.explanation}>
                  <span className="line-clamp-2">{line.parsed.explanation}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-0.5 h-6 px-1.5 text-[11px]"
                    aria-expanded={expandedId === line.record.id}
                    onClick={() => setExpandedId((current) => (current === line.record.id ? null : line.record.id))}
                  >
                    <Calculator className="h-3 w-3" aria-hidden="true" />
                    Ver cálculo
                  </Button>
                </td>
                <td className="px-3 py-2">{line.barLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.calculated.cutLengthM)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.totalPieces, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.calculated.totalMl)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.calculated.totalKg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatDecimal(line.calculated.commercialUnitsRequired, 0)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums font-medium ${WASTE_SEVERITY_CLASS[line.wasteSeverity]}`}
                  title={
                    line.wasteSource === 'manual'
                      ? 'Fuente: factor manual del takeoff (editable)'
                      : 'Fuente: % asumido por línea (pre-optimización); el plan de corte calcula el desperdicio real'
                  }
                >
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
              {expandedId === line.record.id && (
                <tr>
                  <td colSpan={columnCount} className="px-3 pb-2">
                    <CalculationDetail line={line} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-1.5 text-[11px] text-iconic-graphite/50">
        Desp. %:{' '}
        {manualWaste
          ? 'factor manual del takeoff (editable en el plan de corte).'
          : '% asumido por línea (pre-optimización). El desperdicio REAL lo calcula el optimizador en el plan de corte.'}
      </p>
    </div>
  );
}
