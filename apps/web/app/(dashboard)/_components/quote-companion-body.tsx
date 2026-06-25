/**
 * quote-companion-body.tsx — Contenido del companion panel de cotización
 * (UX_QUOTING_COMPANION_ACTIONABLE_GUIDANCE_V1). Presentacional. Convierte el
 * progreso en una GUÍA ACCIONABLE: qué significa, por qué aparece así, qué hacer,
 * qué botón y qué resultado esperar. Textos explícitos, no solo color.
 */
import Link from 'next/link';
import { ArrowRight, ExternalLink, MapPin, HelpCircle } from 'lucide-react';
import { quoteHrefs, type QuoteStepStatus } from '@/lib/quote/quote-progress';
import { STEP_STATUS_TEXT, type QuoteLocation } from '@/lib/quote/quote-location';
import {
  buildStepGuidance,
  pickGuidanceStep,
  stepReasonText,
  type GuidanceSeverity,
} from '@/lib/quote/quote-guidance';
import type { QuoteCompanionPayload } from './quote-companion-actions';

const DOT: Record<QuoteStepStatus, string> = {
  done: 'bg-green-500',
  attention: 'bg-amber-500',
  pending: 'bg-gray-300',
  locked: 'bg-gray-200',
};

const STATUS_TEXT_CLS: Record<QuoteStepStatus, string> = {
  done: 'text-green-700',
  attention: 'text-amber-700',
  pending: 'text-gray-500',
  locked: 'text-gray-400',
};

const SEVERITY_CARD: Record<GuidanceSeverity, string> = {
  done: 'border-green-200 bg-green-50/60',
  attention: 'border-amber-200 bg-amber-50/60',
  info: 'border-iconic-soft-blue/60 bg-brand-50/50',
  blocked: 'border-red-200 bg-red-50/60',
};

const READINESS_CHIP: Record<string, string> = {
  ready: 'bg-green-100 text-green-700',
  review: 'bg-amber-100 text-amber-700',
  blocked: 'bg-red-100 text-red-700',
};

export function QuoteCompanionBody({
  payload,
  location,
}: {
  payload: QuoteCompanionPayload;
  location: QuoteLocation;
}) {
  const { context, summary, readiness, next, steps } = payload;
  const h = quoteHrefs(context);

  const currentIndex = location.stepIndex ?? null;
  const currentStep = currentIndex ? steps[currentIndex - 1] : null;

  // Paso a guiar: siguiente accionable → lugar actual → primer no resuelto.
  const guideStep = pickGuidanceStep(steps, next?.id ?? null, location.stepId ?? null);
  const guidance = guideStep ? buildStepGuidance(guideStep) : null;

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
        <p className="text-[11px] text-gray-400">Cotización activa</p>
        <p className="truncate text-sm font-semibold text-iconic-ink">{payload.estimateName}</p>
        <p className="truncate text-[11px] text-gray-400"><span className="font-mono">{payload.estimateCode}</span></p>
      </div>

      {/* Estás aquí + paso actual */}
      <div className="rounded-lg border border-iconic-soft-blue/60 bg-brand-50/50 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-iconic-primary">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Estás aquí: {location.label}
        </p>
        {currentStep ? (
          <p className="mt-1 text-[12px] text-gray-700">
            Paso actual: <span className="font-semibold">{currentIndex} de {steps.length}</span> · {currentStep.label} ·{' '}
            <span className={STATUS_TEXT_CLS[currentStep.status]}>{STEP_STATUS_TEXT[currentStep.status]}</span>
          </p>
        ) : location.id === 'quote-center' ? (
          <p className="mt-1 text-[12px] text-gray-700">Paso actual: centro de cotización (vista general)</p>
        ) : (
          <p className="mt-1 text-[12px] text-gray-700">Paso actual: sin detectar</p>
        )}
      </div>

      {/* QUÉ SIGUE — guía accionable */}
      {guidance ? (
        <div className={`rounded-xl border px-3 py-3 ${SEVERITY_CARD[guidance.severity]}`}>
          <p className="text-[11px] font-medium text-gray-500">Qué sigue</p>
          <p className="text-sm font-semibold text-iconic-ink">{guidance.title} <span className="text-[11px] font-normal text-gray-400">· {guidance.statusText}</span></p>

          <p className="mt-2 text-[11px] font-medium text-gray-500">Qué significa</p>
          <p className="text-[12px] text-gray-700">{guidance.whatItMeans}</p>

          <p className="mt-2 text-[11px] font-medium text-gray-500">Por qué aparece así</p>
          <p className="text-[12px] text-gray-700">{guidance.whyThisState}</p>

          <p className="mt-2 text-[11px] font-medium text-gray-500">Haz esto ahora</p>
          <p className="text-[12px] text-gray-700">{guidance.whatToDoNow}</p>

          <Link
            href={guidance.primaryHref}
            className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-iconic-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-iconic-primary/90"
          >
            <span className="truncate">{guidance.primaryActionLabel}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
          <p className="mt-1 text-[10px] text-gray-400">{guidance.secondaryHelpText}</p>

          <p className="mt-2 text-[11px] font-medium text-gray-500">Resultado esperado</p>
          <p className="text-[12px] text-gray-700">{guidance.expectedResult}</p>
        </div>
      ) : (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[11px] text-green-700">
          Sin pendientes inmediatos. Revisa el semáforo y exporta cuando quieras.
        </p>
      )}

      {/* Progreso */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
          <span>Progreso</span>
          <span>{summary.done}/{summary.total} listos{summary.attention > 0 ? ` · ${summary.attention} por revisar` : ''}</span>
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
          <span className="text-[11px] text-gray-500">{readiness.critical} críticos · {readiness.warnings} avisos</span>
        </div>
      )}

      {/* Mini-stepper 1–8 con razón corta y "Estás aquí" */}
      <ol className="space-y-1">
        {steps.map((s, i) => {
          const isHere = currentIndex === i + 1;
          return (
            <li key={s.id} className={`flex items-center gap-2 rounded px-1 py-0.5 text-[12px] ${isHere ? 'bg-brand-50/70' : ''}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">{i + 1}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[s.status]}`} aria-hidden="true" />
              <span className={`truncate ${s.status === 'locked' ? 'text-gray-400' : 'text-gray-700'}`}>{s.label}</span>
              <span className={`ml-auto shrink-0 text-[10px] font-medium ${isHere ? 'text-iconic-primary' : STATUS_TEXT_CLS[s.status]}`}>
                {isHere ? 'Estás aquí' : stepReasonText(s)}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Manual inline corto */}
      <details className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 text-[11px] text-gray-600">
        <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-gray-700">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ¿Por qué veo esto?
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>El asistente no reemplaza tu criterio técnico: te orienta.</li>
          <li>El progreso se calcula con datos del presupuesto, cantidades, APU, precios y semáforo.</li>
          <li>Si algo aparece pendiente, significa que el sistema aún no lo puede validar como completo desde esta vista; abre la pantalla del paso para confirmarlo.</li>
        </ul>
      </details>

      {/* Accesos rápidos */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-gray-500">Accesos rápidos</p>
        <div className="grid grid-cols-2 gap-1.5">
          {quickLinks.map((l) => (
            <Link key={l.label} href={l.href} className="truncate rounded-md border px-2 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50">
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Vista completa (acción secundaria) */}
      <Link
        href={payload.centerHref}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-iconic-soft-blue px-3 py-2 text-[12px] font-medium text-iconic-primary hover:bg-brand-50/60"
      >
        Abrir vista completa
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
