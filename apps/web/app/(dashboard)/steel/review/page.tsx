'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { SurfaceCard } from '@/components/shared/surface-card';
import { ClipboardCheck } from 'lucide-react';
import { buildReviewItems } from '@/lib/steel/domain-bridge';
import { formatDecimal } from '@/lib/steel/format';

type MockAction = 'approve' | 'flag' | 'ignore';

export default function SteelReviewPage() {
  const items = buildReviewItems();
  const [actions, setActions] = useState<Record<string, MockAction>>({});

  return (
    <div>
      <PageHeader
        title="Centro de revisión documental"
        description="Original vs interpretación del parser real de F1, con confianza y explicación. Acciones mock: no persisten (sin backend/DB)."
      />

      <InlineCallout tone="warning" title="Human-in-the-loop" className="mb-4">
        Nada se confirma automáticamente por debajo del umbral de confianza. Las acciones de esta
        pantalla son mock (no cambian datos reales).
      </InlineCallout>

      {items.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Sin fuentes pendientes de revisión" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const action = actions[item.id];
            return (
              <SurfaceCard key={item.id} variant="metric">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-iconic-graphite/50">
                      {item.elementLabel}
                    </p>
                    <p className="font-mono text-sm text-iconic-ink">{item.originalDescription}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.needsReview ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    Confianza {formatDecimal(item.confidenceScore, 2)}
                  </span>
                </div>
                <p className="mb-1 text-sm text-iconic-graphite/80">{item.interpretation}</p>
                <p className="mb-3 text-xs text-iconic-graphite/60">{item.explanation}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActions((prev) => ({ ...prev, [item.id]: 'approve' }))}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      action === 'approve'
                        ? 'border-green-300 bg-green-100 text-green-800'
                        : 'border-iconic-soft-blue/50 text-iconic-graphite/70 hover:bg-brand-50'
                    }`}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => setActions((prev) => ({ ...prev, [item.id]: 'flag' }))}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      action === 'flag'
                        ? 'border-amber-300 bg-amber-100 text-amber-800'
                        : 'border-iconic-soft-blue/50 text-iconic-graphite/70 hover:bg-brand-50'
                    }`}
                  >
                    Marcar revisión
                  </button>
                  <button
                    type="button"
                    onClick={() => setActions((prev) => ({ ...prev, [item.id]: 'ignore' }))}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      action === 'ignore'
                        ? 'border-gray-300 bg-gray-100 text-gray-700'
                        : 'border-iconic-soft-blue/50 text-iconic-graphite/70 hover:bg-brand-50'
                    }`}
                  >
                    Ignorar
                  </button>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
