/**
 * quote-stepper.tsx — Barra de progreso + tarjetas de los 8 pasos del asistente
 * (QUOTING_ASSISTED_MODE_V1). Server-safe / presentacional. Consume los pasos ya
 * derivados por `deriveQuoteProgress` (puro). No recalcula nada.
 */
import { deriveQuoteProgress, summarizeQuoteProgress, type QuoteProgressInput } from '@/lib/quote/quote-progress';
import { QuoteStepCard } from './quote-step-card';

export function QuoteStepper({ input }: { input: QuoteProgressInput }) {
  const steps = deriveQuoteProgress(input);
  const sum = summarizeQuoteProgress(steps);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-iconic-primary transition-all"
            style={{ width: `${sum.pct}%` }}
            aria-hidden="true"
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-500">
          {sum.done}/{sum.total} listos
          {sum.attention > 0 ? ` · ${sum.attention} por revisar` : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <QuoteStepCard key={step.id} index={i + 1} step={step} />
        ))}
      </div>
    </div>
  );
}
