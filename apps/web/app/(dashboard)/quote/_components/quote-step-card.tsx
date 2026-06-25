/**
 * quote-step-card.tsx — Tarjeta de un paso del asistente de cotización
 * (QUOTING_ASSISTED_MODE_V1). Server-safe / presentacional. No recalcula nada;
 * solo muestra el `QuoteStep` derivado y sus deep-links a rutas existentes.
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { QuoteStep, QuoteStepStatus } from '@/lib/quote/quote-progress';

const STATUS_STYLE: Record<QuoteStepStatus, { dot: string; chip: string; label: string }> = {
  done: { dot: 'bg-green-500', chip: 'bg-green-100 text-green-700', label: 'Listo' },
  attention: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', label: 'Requiere acción' },
  pending: { dot: 'bg-gray-300', chip: 'bg-gray-100 text-gray-600', label: 'Pendiente' },
  locked: { dot: 'bg-gray-200', chip: 'bg-gray-100 text-gray-400', label: 'Bloqueado' },
};

export function QuoteStepCard({ index, step }: { index: number; step: QuoteStep }) {
  const s = STATUS_STYLE[step.status];
  const locked = step.status === 'locked';
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-iconic-gray text-[11px] font-semibold text-iconic-ink">
            {index}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
            <span className="text-sm font-semibold text-gray-900">{step.label}</span>
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.chip}`}>{s.label}</span>
      </div>

      <p className="mt-2 text-xs text-gray-600">{step.description}</p>
      {step.summary && <p className="mt-1 text-[11px] text-gray-400">{step.summary}</p>}

      {!locked && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant={step.status === 'attention' ? 'default' : 'outline'}>
            <Link href={step.primaryHref}>{step.primaryActionLabel}</Link>
          </Button>
          {step.secondaryHref && (
            <Button asChild size="sm" variant="ghost">
              <Link href={step.secondaryHref}>Ver biblioteca</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
