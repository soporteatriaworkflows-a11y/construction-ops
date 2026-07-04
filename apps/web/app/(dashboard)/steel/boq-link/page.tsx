import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_BOQ_LINKS } from '@/lib/steel/mock-data';
import { SteelStatusBadge } from '../_components/steel-status-badge';

export default function SteelBoqLinkPage() {
  return (
    <div>
      <PageHeader
        title="Vinculación con APU / BOQ"
        description="Vista mock de sugerencias de vínculo entre líneas de acero y actividades del presupuesto. No modifica BOQ real."
      />

      <InlineCallout tone="warning" title="Solo lectura" className="mb-4">
        Vincular aquí no escribe en el BOQ/APU real — es una previsualización de cómo se vería la
        sugerencia. La vinculación real, cuando exista, seguirá el mismo patrón de
        <code> link-to-boq-button</code> (server action, sin precios calculados en el navegador).
      </InlineCallout>

      <SurfaceCard variant="metric">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
              <tr>
                <th className="px-3 py-2">Línea de acero</th>
                <th className="px-3 py-2">Actividad BOQ sugerida</th>
                <th className="px-3 py-2">Recurso de catálogo sugerido</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {MOCK_STEEL_BOQ_LINKS.map((link) => (
                <tr key={link.id}>
                  <td className="px-3 py-2 font-medium text-iconic-ink">{link.elementLabel}</td>
                  <td className="px-3 py-2 text-iconic-graphite/70">{link.suggestedBoqActivity}</td>
                  <td className="px-3 py-2 text-iconic-graphite/70">{link.suggestedCatalogResource}</td>
                  <td className="px-3 py-2">
                    <SteelStatusBadge kind="boq_link" status={link.status} />
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
