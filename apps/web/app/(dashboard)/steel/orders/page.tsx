/**
 * /steel/orders — Pedidos a proveedor (preview, D4: manual en V1).
 * La vigencia vencida se resalta por línea. Export deshabilitado con
 * explicación: el generador real (Excel/PDF sin datos internos) llega en la
 * fase de exports.
 */
import { Download, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_ORDERS } from '@/lib/steel/mock-data';
import { formatCop, formatDecimal, isExpired } from '@/lib/steel/format';
import { SteelStatusBadge } from '../_components/steel-status-badge';

/** Fecha de referencia fija del preview (mock, evita depender del reloj en una vista de demo). */
const PREVIEW_TODAY = '2026-07-03';

export default function SteelOrdersPage() {
  const orders = MOCK_STEEL_ORDERS;

  return (
    <div>
      <PageHeader
        title="Pedidos a proveedor"
        description="Agrupa las cantidades comerciales por material y proveedor para pedir sin retrabajos. En V1 el pedido es manual: el sistema arma el resumen, una persona lo envía y aprueba."
      />

      <InlineCallout tone="tip" title="Qué sigue después del borrador" className="mb-4">
        Borrador → cotizado → aprobado (humano, con nombre y fecha) → comprado → recibido. El
        export al proveedor saldrá <strong>sin precios internos ni descuentos</strong> (perfil de
        privacidad proveedor). Correo/notificación automática queda para una fase futura.
      </InlineCallout>

      {orders.length === 0 ? (
        <EmptyState
          title="Sin pedidos"
          description="Cuando un takeoff aprobado genere un pedido, aparecerá aquí con sus cantidades comerciales agregadas."
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <SurfaceCard key={order.id} variant="primary">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-iconic-ink">{order.name}</h3>
                  <p className="text-xs tabular-nums text-iconic-graphite/60">
                    {formatDecimal(order.totalKg, 1)} kg · {formatDecimal(order.totalMl, 0)} ml ·{' '}
                    {formatCop(order.totalEstimatedCop)} estimado
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <SteelStatusBadge kind="order" status={order.status} />
                  <button
                    type="button"
                    className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-iconic-soft-blue/50 px-2.5 py-1 text-xs font-medium text-iconic-graphite/40"
                    disabled
                    aria-disabled="true"
                    title="Export pendiente: el generador Excel/PDF llega en la fase de exports (sin datos internos para el proveedor)"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Exportar (pendiente)
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
                    <tr>
                      <th scope="col" className="px-2 py-1.5">Material / longitud comercial</th>
                      <th scope="col" className="px-2 py-1.5 text-right">Unidades</th>
                      <th scope="col" className="px-2 py-1.5 text-right">kg</th>
                      <th scope="col" className="px-2 py-1.5">Proveedor</th>
                      <th scope="col" className="px-2 py-1.5 text-right">Precio unitario</th>
                      <th scope="col" className="px-2 py-1.5">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-iconic-soft-blue/20">
                    {order.lines.map((line) => {
                      const expired = isExpired(line.validUntil, PREVIEW_TODAY);
                      return (
                        <tr key={line.id} className={expired ? 'bg-red-50/50' : undefined}>
                          <td className="px-2 py-1.5">{line.familyLabel}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(line.commercialUnits, 0)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(line.totalKg, 1)}</td>
                          <td className="px-2 py-1.5">{line.supplierName}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCop(line.unitPriceCop)}</td>
                          <td className="px-2 py-1.5 text-xs">
                            {expired ? (
                              <span className="inline-flex items-center gap-1 font-medium text-red-700">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                Vencida {line.validUntil} — recotizar
                              </span>
                            ) : (
                              <span className="text-iconic-graphite/60">Hasta {line.validUntil}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}
    </div>
  );
}
