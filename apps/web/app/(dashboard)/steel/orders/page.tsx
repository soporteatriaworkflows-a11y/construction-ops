import { Download } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_ORDERS } from '@/lib/steel/mock-data';
import { formatCop, formatDecimal } from '@/lib/steel/format';
import { SteelStatusBadge } from '../_components/steel-status-badge';

export default function SteelOrdersPage() {
  const orders = MOCK_STEEL_ORDERS;

  return (
    <div>
      <PageHeader
        title="Pedidos a proveedor"
        description="D4: pedido manual en V1 — el sistema arma el resumen/export, el envío al proveedor lo hace una persona. Sin notificaciones/email automático."
      />

      <InlineCallout tone="tip" title="Export pendiente" className="mb-4">
        El botón de exportar es mock (sin backend). En la versión real generará Excel/PDF sin
        precios internos para el proveedor (perfil de privacidad proveedor), separado del export
        interno completo.
      </InlineCallout>

      {orders.length === 0 ? (
        <EmptyState title="Sin pedidos" description="Cuando se genere un pedido a partir de un takeoff, aparecerá aquí." />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <SurfaceCard key={order.id} variant="primary">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-iconic-ink">{order.name}</h3>
                  <p className="text-xs text-iconic-graphite/60">Total estimado {formatCop(order.totalEstimatedCop)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <SteelStatusBadge kind="order" status={order.status} />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-iconic-soft-blue/50 px-2.5 py-1 text-xs font-medium text-iconic-graphite/70 hover:bg-brand-50"
                    disabled
                    title="Export pendiente — mock, sin backend"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Exportar
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
                    <tr>
                      <th className="px-2 py-1.5">Familia / longitud comercial</th>
                      <th className="px-2 py-1.5 text-right">Unidades</th>
                      <th className="px-2 py-1.5">Proveedor</th>
                      <th className="px-2 py-1.5 text-right">Precio unitario</th>
                      <th className="px-2 py-1.5">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-iconic-soft-blue/20">
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-2 py-1.5">{line.familyLabel}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatDecimal(line.commercialUnits, 0)}</td>
                        <td className="px-2 py-1.5">{line.supplierName}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatCop(line.unitPriceCop)}</td>
                        <td className="px-2 py-1.5 text-xs text-iconic-graphite/60">{line.validUntil}</td>
                      </tr>
                    ))}
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
