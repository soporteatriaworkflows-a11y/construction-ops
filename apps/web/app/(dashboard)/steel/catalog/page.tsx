/**
 * /steel/catalog — Catálogo de acero (preview, solo lectura mock).
 * Los estados de precio son espejo del pipeline real de ICONIC OPS
 * (estimado/proveedor/aprobado) + vencido; cuando se conecte, esta vista
 * leerá `resources`/`supplier_products`/`price_observations`, no una tabla
 * propia.
 */
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_SPECS } from '@/lib/steel/mock-data';
import { formatCop, STEEL_FAMILY_LABEL } from '@/lib/steel/format';
import { SteelStatusBadge } from '../_components/steel-status-badge';

export default function SteelCatalogPage() {
  return (
    <div>
      <PageHeader
        title="Catálogo de acero"
        description="Especificaciones técnicas (varillas, perfiles, tubos, platinas, mallas) con el estado de su precio por proveedor."
      />

      <InlineCallout tone="info" title="Una sola fuente de verdad" className="mb-4">
        Steel Ops no crea un catálogo de precios paralelo: cuando se conecte, la fuente de verdad
        seguirá siendo el catálogo/proveedores/precios existente de ICONIC OPS
        (<code>resources</code> + <code>supplier_products</code> + <code>price_observations</code>).
        Los estados espejo son: <strong>estimado</strong> (referencia interna),{' '}
        <strong>proveedor</strong> (cotizado, sin aprobar), <strong>aprobado</strong> (baseline
        vigente) y <strong>vencido</strong> (vigencia expirada, recotizar).
      </InlineCallout>

      <SurfaceCard variant="metric">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
              <tr>
                <th scope="col" className="px-3 py-2">Especificación</th>
                <th scope="col" className="px-3 py-2">Familia</th>
                <th scope="col" className="px-3 py-2">Unidad</th>
                <th scope="col" className="px-3 py-2">Proveedor</th>
                <th scope="col" className="px-3 py-2 text-right">Precio</th>
                <th scope="col" className="px-3 py-2">Vigencia</th>
                <th scope="col" className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {MOCK_STEEL_SPECS.map((spec) => (
                <tr key={spec.id}>
                  <td className="px-3 py-2 font-medium text-iconic-ink">{spec.label}</td>
                  <td className="px-3 py-2 text-iconic-graphite/70">
                    {STEEL_FAMILY_LABEL[spec.family] ?? spec.family}
                  </td>
                  <td className="px-3 py-2 text-iconic-graphite/70">{spec.unit}</td>
                  <td className="px-3 py-2 text-iconic-graphite/70">{spec.supplierName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCop(spec.priceCop)}</td>
                  <td className="px-3 py-2 text-xs text-iconic-graphite/60">{spec.validUntil ?? '—'}</td>
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
