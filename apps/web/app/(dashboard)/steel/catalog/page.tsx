import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_SPECS } from '@/lib/steel/mock-data';
import { formatCop } from '@/lib/steel/format';
import { SteelStatusBadge } from '../_components/steel-status-badge';

export default function SteelCatalogPage() {
  return (
    <div>
      <PageHeader
        title="Catálogo de acero"
        description="Vista mock de especificaciones técnicas (varillas y perfiles) con su precio vigente por proveedor."
      />

      <InlineCallout tone="info" title="Fuente de verdad" className="mb-4">
        Esta vista es solo de lectura mock. La fuente de verdad real de precios sigue siendo el
        catálogo/precios existente de ICONIC OPS (<code>resources</code> + <code>supplier_products</code> +{' '}
        <code>price_observations</code>) — Steel no crea un catálogo de precios paralelo.
      </InlineCallout>

      <SurfaceCard variant="metric">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
              <tr>
                <th className="px-3 py-2">Especificación</th>
                <th className="px-3 py-2">Familia</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2 text-right">Precio vigente</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {MOCK_STEEL_SPECS.map((spec) => (
                <tr key={spec.id}>
                  <td className="px-3 py-2 font-medium text-iconic-ink">{spec.label}</td>
                  <td className="px-3 py-2 text-iconic-graphite/70">
                    {spec.family === 'rebar' ? 'Refuerzo' : 'Estructura metálica'}
                  </td>
                  <td className="px-3 py-2 text-iconic-graphite/70">{spec.unit}</td>
                  <td className="px-3 py-2 text-iconic-graphite/70">{spec.supplierName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCop(spec.priceCop)}</td>
                  <td className="px-3 py-2">
                    <SteelStatusBadge kind="price" status={spec.priceStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
}
