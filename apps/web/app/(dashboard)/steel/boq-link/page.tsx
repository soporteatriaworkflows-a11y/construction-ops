'use client';

/**
 * /steel/boq-link — Vinculación visual con APU/BOQ (preview).
 * Steel Ops no reemplaza BOQ/APU: alimenta cantidades y recursos para
 * presupuestar. Acciones mock (estado local, sin escritura real). La
 * vinculación real seguirá el patrón `link-to-boq-button` (server action,
 * sin precios calculados en el navegador).
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_BOQ_LINKS } from '@/lib/steel/mock-data';
import { cn } from '@/lib/utils/cn';
import { SteelStatusBadge } from '../_components/steel-status-badge';
import type { SteelBoqLinkRiskView, SteelBoqLinkStatusView } from '@/lib/steel/types';

const RISK_LABEL: Record<SteelBoqLinkRiskView, string> = {
  sin_precio: 'Sin precio',
  sin_actividad: 'Sin actividad',
  sin_proveedor: 'Sin proveedor',
};

type MockAction = 'link' | 'review' | 'ignore';

export default function SteelBoqLinkPage() {
  const [actions, setActions] = useState<Record<string, MockAction>>({});
  const setAction = (id: string, action: MockAction) => setActions((prev) => ({ ...prev, [id]: action }));

  const statusFor = (id: string, base: SteelBoqLinkStatusView): SteelBoqLinkStatusView =>
    actions[id] === 'link' ? 'vinculado' : base;

  return (
    <div>
      <PageHeader
        title="Vinculación con APU / BOQ"
        description="Cada elemento de acero se conecta con su actividad del presupuesto y su recurso de catálogo. Steel Ops no reemplaza el BOQ: le alimenta cantidades y recursos."
      />

      <InlineCallout tone="warning" title="Vista de demostración — no escribe en el BOQ real" className="mb-4">
        Vincular aquí solo cambia el estado visual. La vinculación real usará el mismo patrón del
        botón &quot;Vincular a BOQ&quot; de la Biblioteca APU: server action con validación, snapshot de
        precio server-side y sin tocar presupuestos emitidos.
      </InlineCallout>

      <SurfaceCard variant="metric">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
              <tr>
                <th scope="col" className="px-3 py-2">Línea de acero</th>
                <th scope="col" className="px-3 py-2">Actividad BOQ sugerida</th>
                <th scope="col" className="px-3 py-2">Recurso de catálogo sugerido</th>
                <th scope="col" className="px-3 py-2">Riesgo</th>
                <th scope="col" className="px-3 py-2">Estado</th>
                <th scope="col" className="px-3 py-2">Acción (demo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {MOCK_STEEL_BOQ_LINKS.map((link) => {
                const action = actions[link.id];
                const status = statusFor(link.id, link.status);
                return (
                  <tr key={link.id} className={action === 'ignore' ? 'opacity-50' : undefined}>
                    <td className="px-3 py-2 font-medium text-iconic-ink">{link.elementLabel}</td>
                    <td className="px-3 py-2 text-iconic-graphite/70">{link.suggestedBoqActivity}</td>
                    <td className="px-3 py-2 text-iconic-graphite/70">{link.suggestedCatalogResource}</td>
                    <td className="px-3 py-2">
                      {link.risks.length === 0 ? (
                        <span className="text-xs text-iconic-graphite/40">—</span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {link.risks.map((risk) => (
                            <span
                              key={risk}
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              {RISK_LABEL[risk]}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <SteelStatusBadge kind="boq_link" status={status} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex gap-1">
                        {(
                          [
                            ['link', 'Vincular', 'border-green-300 bg-green-100 text-green-800'],
                            ['review', 'Revisar', 'border-amber-300 bg-amber-100 text-amber-800'],
                            ['ignore', 'Ignorar', 'border-gray-300 bg-gray-100 text-gray-700'],
                          ] as const
                        ).map(([value, label, activeClass]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setAction(link.id, value)}
                            aria-pressed={action === value}
                            className={cn(
                              'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary',
                              action === value
                                ? activeClass
                                : 'border-iconic-soft-blue/50 text-iconic-graphite/60 hover:bg-brand-50',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <InlineCallout tone="info" className="mt-4">
        Detectar acero sin actividad (y actividades sin acero) evita huecos en el presupuesto: es
        el puente entre el despiece del ingeniero y el BOQ que se cotiza.
      </InlineCallout>
    </div>
  );
}
