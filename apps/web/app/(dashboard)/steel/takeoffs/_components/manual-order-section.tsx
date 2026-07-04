/**
 * manual-order-section.tsx — Pedido proveedor MOCK (Agente 6): agrupa las
 * barras del plan de corte por varilla × longitud comercial y muestra
 * kg/ml/unidades/precio mock. No persiste ni envía nada a proveedores.
 */
'use client';

import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineCallout } from '@/components/shared/inline-callout';
import { formatCop, formatDecimal, isExpired } from '@/lib/steel/format';
import type { ManualOrderDraft } from '@/lib/steel/manual-takeoff';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

export function ManualOrderSection({
  order,
  hasPlan,
  onGenerate,
  referenceDate,
}: {
  order: ManualOrderDraft | null;
  hasPlan: boolean;
  onGenerate: () => void;
  referenceDate: string;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onGenerate} disabled={!hasPlan}>
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          {order ? 'Regenerar pedido proveedor (mock)' : 'Generar pedido proveedor (mock)'}
        </Button>
        {!hasPlan && (
          <span className="text-xs text-iconic-graphite/50">
            Primero genera el plan de corte: el pedido se arma con las barras comerciales del plan.
          </span>
        )}
      </div>

      {order && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-iconic-ink">{order.name}</h4>
            <SteelStatusBadge kind="order" status={order.status} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-iconic-soft-blue/40">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-iconic-graphite/60">
                <tr>
                  <th scope="col" className="px-3 py-2">Referencia</th>
                  <th scope="col" className="px-3 py-2 text-right">Long. comercial (m)</th>
                  <th scope="col" className="px-3 py-2 text-right">Unidades</th>
                  <th scope="col" className="px-3 py-2 text-right">Total ml</th>
                  <th scope="col" className="px-3 py-2 text-right">Total kg</th>
                  <th scope="col" className="px-3 py-2">Proveedor</th>
                  <th scope="col" className="px-3 py-2 text-right">Precio COP/kg</th>
                  <th scope="col" className="px-3 py-2">Estado precio</th>
                  <th scope="col" className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-iconic-soft-blue/20">
                {order.lines.map((line) => {
                  const expired = isExpired(line.validUntil, referenceDate);
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2 font-medium text-iconic-ink">{line.specLabel}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.commercialLengthM)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.commercialUnits, 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.totalMl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.totalKg, 1)}</td>
                      <td className="px-3 py-2 text-xs text-iconic-graphite/70">{line.supplierName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCop(line.unitPriceCopPerKg)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <SteelStatusBadge kind="price" status={line.priceStatus} />
                          {line.validUntil && (
                            <span className={`text-[10px] ${expired ? 'font-medium text-red-700' : 'text-iconic-graphite/50'}`}>
                              {expired ? 'Vigencia vencida: ' : 'Vigente hasta '}
                              {line.validUntil}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCop(line.subtotalCop)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-brand-50/40 text-xs font-semibold text-iconic-ink">
                <tr>
                  <td className="px-3 py-2">Totales</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(order.totalUnits, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(order.totalMl)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(order.totalKg, 1)}</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-right tabular-nums">{formatCop(order.totalEstimatedCop)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <InlineCallout tone={order.linesWithoutApprovedPrice > 0 ? 'warning' : 'info'} className="mt-3">
            Pedido mock: precios de referencia del catálogo preview, no cotización real.
            {order.linesWithoutApprovedPrice > 0 &&
              ` ${order.linesWithoutApprovedPrice} línea(s) sin precio APROBADO — en el flujo real requerirían observación de precio aprobada antes de comprar.`}
          </InlineCallout>
        </>
      )}
    </div>
  );
}
