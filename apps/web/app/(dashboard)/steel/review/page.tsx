'use client';

/**
 * /steel/review — Centro de revisión documental (preview).
 * "Lo leído" (interpretación del parser F1) se muestra separado de "lo
 * calculado" (ml/kg vía calculadora F1). Acciones mock: estado local, no
 * persisten (sin backend/DB en esta fase).
 */
import { useState } from 'react';
import { ClipboardCheck, FileText } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { SurfaceCard } from '@/components/shared/surface-card';
import { buildReviewItems } from '@/lib/steel/domain-bridge';
import { formatDecimal } from '@/lib/steel/format';
import { cn } from '@/lib/utils/cn';
import type { SteelReviewVerdictView } from '@/lib/steel/types';

type MockAction = 'approve' | 'flag' | 'ignore';

const VERDICT_CHIP: Record<SteelReviewVerdictView, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-green-100 text-green-700' },
  revisar: { label: 'Revisar', className: 'bg-amber-100 text-amber-700' },
  critico: { label: 'Crítico', className: 'bg-red-100 text-red-700' },
};

const ACTION_LABEL: Record<MockAction, string> = {
  approve: 'Interpretación aprobada',
  flag: 'Enviada a revisión',
  ignore: 'Ignorada',
};

function ActionButton({
  label,
  active,
  activeClassName,
  onClick,
}: {
  label: string;
  active: boolean;
  activeClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary',
        active ? activeClassName : 'border-iconic-soft-blue/50 text-iconic-graphite/70 hover:bg-brand-50',
      )}
    >
      {label}
    </button>
  );
}

export default function SteelReviewPage() {
  const items = buildReviewItems();
  const [actions, setActions] = useState<Record<string, MockAction>>({});
  const setAction = (id: string, action: MockAction) => setActions((prev) => ({ ...prev, [id]: action }));

  return (
    <div>
      <PageHeader
        title="Centro de revisión documental"
        description="Compara lo que dice el documento con lo que el sistema leyó y calculó, antes de que una cantidad llegue al pedido."
      />

      <InlineCallout tone="warning" title="El sistema propone, el humano decide" className="mb-4">
        Ninguna interpretación se confirma automáticamente por debajo del umbral de confianza. Este
        centro no reemplaza al ingeniero estructural: ayuda a revisar, presupuestar y pedir con
        trazabilidad. Las acciones de esta vista son de demostración y no persisten.
      </InlineCallout>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Sin interpretaciones pendientes"
          description="Cuando se cargue un despiece (plantilla, Excel o texto), las interpretaciones del parser aparecerán aquí para su revisión."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const action = actions[item.id];
            const verdict = VERDICT_CHIP[item.verdict];
            return (
              <SurfaceCard key={item.id} variant="metric">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-iconic-graphite/50">
                      {item.elementLabel}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-iconic-graphite/50">
                      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {item.sourceLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', verdict.className)}>
                      {verdict.label}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600">
                      Confianza {formatDecimal(item.confidenceScore, 2)}
                    </span>
                  </div>
                </div>

                <div className="mb-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Documento original
                    </p>
                    <p className="font-mono text-sm text-iconic-ink">{item.originalDescription}</p>
                  </div>
                  <div className="rounded-lg bg-brand-50/50 p-2.5">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-iconic-primary/70">
                      Lo leído (interpretación)
                    </p>
                    <p className="text-sm text-iconic-ink">{item.interpretation}</p>
                  </div>
                  <div className="rounded-lg bg-brand-50/50 p-2.5">
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-iconic-primary/70">
                      Lo calculado
                    </p>
                    <p className="text-sm tabular-nums text-iconic-ink">
                      {formatDecimal(item.computedTotalMl)} ml · {formatDecimal(item.computedTotalKg)} kg
                    </p>
                  </div>
                </div>

                <p className="mb-3 text-xs leading-relaxed text-iconic-graphite/60">{item.explanation}</p>

                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    label="Aprobar interpretación"
                    active={action === 'approve'}
                    activeClassName="border-green-300 bg-green-100 text-green-800"
                    onClick={() => setAction(item.id, 'approve')}
                  />
                  <ActionButton
                    label="Solicitar revisión"
                    active={action === 'flag'}
                    activeClassName="border-amber-300 bg-amber-100 text-amber-800"
                    onClick={() => setAction(item.id, 'flag')}
                  />
                  <ActionButton
                    label="Ignorar"
                    active={action === 'ignore'}
                    activeClassName="border-gray-300 bg-gray-100 text-gray-700"
                    onClick={() => setAction(item.id, 'ignore')}
                  />
                  {action && (
                    <span className="text-xs italic text-iconic-graphite/50" role="status">
                      {ACTION_LABEL[action]} (demo — no persiste)
                    </span>
                  )}
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
