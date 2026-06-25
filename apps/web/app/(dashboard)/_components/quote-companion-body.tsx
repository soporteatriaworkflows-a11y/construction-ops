/**
 * quote-companion-body.tsx — Contenido del companion panel de cotización
 * (QUOTING_ASSISTED_COMPANION_PANEL_V1B). Presentacional; consume el payload ya
 * derivado por `getQuoteCompanionState`. No recalcula nada.
 */
import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { quoteHrefs, type QuoteStepStatus } from '@/lib/quote/quote-progress';
import type { QuoteCompanionPayload } from './quote-companion-actions';

const DOT: Record<QuoteStepStatus, string> = {
  done: 'bg-green-500',
  attention: 'bg-amber-500',
  pending: 'bg-gray-300',
  locked: 'bg-gray-200',
};

const READINESS_CHIP: Record<string, string> = {
  ready: 'bg-green-100 text-green-700',
  review: 'bg-amber-100 text-amber-700',
  blocked: 'bg-red-100 text-red-700',
};

export function QuoteCompanionBody({ payload }: { payload: QuoteCompanionPayload }) {
  const { context, summary, readiness, next, steps, centerHref } = payload;
  const h = quoteHrefs(context);

  const quickLinks: { label: string; href: string }[] = [
    { label: 'Presupuesto', href: h.estimate },
    { label: 'APU', href: h.workspace },
    { label: 'Cantidades', href: h.quantities },
    { label: 'Precios', href: h.pricing },
    { label: 'Semáforo', href: h.readiness },
    { label: 'Exportar', href: h.export },
  ];

  return (
    <div className="space-y-4">
      {/* Cotización activa */}
      <div>
        <p className="truncate text-sm font-semibold text-iconic-ink">{payload.estimateName}</p>
        <p className="truncate text-[11px] text-gray-400">
          <span className="font-mono">{payload.estimateCode}</span>
        </p>
      </div>

      {/* Progreso */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
          <span>Progreso</span>
          <span>{summary.done}/{summary.total}{summary.attention > 0 ? ` · ${summary.attention} por revisar` : ''}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-iconic-primary transition-all" style={{ width: `${summary.pct}%` }} aria-hidden="true" />
        </div>
      </div>

      {/* Semáforo resumido */}
      {readiness && (
        <div className="flex items-center justify-between rounded-lg border bg-gray-50/60 px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${READINESS_CHIP[readiness.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {readiness.label}
          </span>
          <span className="text-[11px] text-gray-500">
            {readiness.critical} críticos · {readiness.warnings} avisos
          </span>
        </div>
      )}

      {/* Siguiente acción */}
      {next ? (
        <Link
          href={next.primaryHref}
          className="flex items-center justify-between gap-2 rounded-lg bg-iconic-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-iconic-primary/90"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-normal text-white/70">Siguiente acción</span>
            <span className="truncate">{next.primaryActionLabel}: {next.label}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[11px] text-green-700">
          Sin pendientes inmediatos. Revisa el semáforo y exporta.
        </p>
      )}

      {/* Mini-stepper 1–8 */}
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 text-[12px]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">{i + 1}</span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[s.status]}`} aria-hidden="true" />
            <span className={`truncate ${s.status === 'locked' ? 'text-gray-400' : 'text-gray-700'}`}>{s.label}</span>
            {s.summary && <span className="ml-auto shrink-0 text-[10px] text-gray-400">{s.summary}</span>}
          </li>
        ))}
      </ol>

      {/* Enlaces rápidos */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-gray-500">Accesos rápidos</p>
        <div className="grid grid-cols-2 gap-1.5">
          {quickLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="truncate rounded-md border px-2 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Vista completa (acción secundaria) */}
      <Link
        href={centerHref}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-iconic-soft-blue px-3 py-2 text-[12px] font-medium text-iconic-primary hover:bg-brand-50/60"
      >
        Abrir vista completa
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
