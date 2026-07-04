import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { MOCK_STEEL_TAKEOFFS } from '@/lib/steel/mock-data';
import { buildWorkspaceLinesForTakeoff } from '@/lib/steel/domain-bridge';
import { formatDecimal } from '@/lib/steel/format';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

export default async function SteelTakeoffWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const takeoff = MOCK_STEEL_TAKEOFFS.find((t) => t.id === id);
  if (!takeoff) {
    notFound();
  }

  const lines = buildWorkspaceLinesForTakeoff(id);

  return (
    <div>
      <PageHeader
        title={takeoff.name}
        breadcrumb={
          <Link href="/steel/takeoffs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Takeoffs
          </Link>
        }
        description={`${takeoff.projectName} · ${takeoff.scopeLabel}`}
        actions={<SteelStatusBadge kind="takeoff" status={takeoff.status} />}
      />

      <InlineCallout tone="tip" title="Origen del cálculo" className="mb-4">
        Refuerzo: interpretado con <code>parseSteelDescription</code> (F1) a partir del texto original.
        Perfiles/estructura metálica: F1 aún no parsea esa notación, se calculan directo con
        <code> calculateSteelLine</code>.
      </InlineCallout>

      {lines.length === 0 ? (
        <EmptyState title="Sin líneas" description="Este takeoff no tiene líneas de acero todavía." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-iconic-soft-blue/40">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-iconic-graphite/60">
              <tr>
                <th className="px-3 py-2">Elemento</th>
                <th className="px-3 py-2">Familia</th>
                <th className="px-3 py-2">Descripción original</th>
                <th className="px-3 py-2">Interpretación</th>
                <th className="px-3 py-2">№/perfil</th>
                <th className="px-3 py-2 text-right">Long. corte (m)</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2 text-right">Total ml</th>
                <th className="px-3 py-2 text-right">Total kg</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Alertas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {lines.map((line) => (
                <tr key={line.id} className={line.verificationStatus === 'needs_review' ? 'bg-amber-50/50' : undefined}>
                  <td className="px-3 py-2 font-medium text-iconic-ink">{line.elementLabel}</td>
                  <td className="px-3 py-2 text-iconic-graphite/70">
                    {line.family === 'rebar' ? 'Refuerzo' : 'Estructura metálica'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-iconic-graphite/80">{line.originalDescription}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-iconic-graphite/70" title={line.interpretation}>
                    <span className="line-clamp-2">{line.interpretation}</span>
                  </td>
                  <td className="px-3 py-2">{line.barNumberOrProfile}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.cutLengthM)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.totalPieces, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.totalMl)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(line.totalKg)}</td>
                  <td className="px-3 py-2">
                    <SteelStatusBadge kind="verification" status={line.verificationStatus} />
                  </td>
                  <td className="px-3 py-2">
                    {line.alerts.length === 0 ? (
                      <span className="text-xs text-iconic-graphite/40">—</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"
                        title={line.alerts.map((a) => `${a.code}: ${a.message}`).join(' · ')}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        {line.alerts.length}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
