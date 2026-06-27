/**
 * workflow-strip.tsx — Franja horizontal de flujo / accesos
 * (ICONIC_OPS_UIX_DASHBOARD_INFORMATION_ARCHITECTURE_REDESIGN_V4_2_7).
 *
 * Reemplaza la colección de cards de acceso rápido por una línea horizontal con
 * nodos conectados (icono + label), navegables a rutas EXISTENTES. El primer hito
 * puede marcarse como "Actual". Presentacional; sin lógica.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface WorkflowStep {
  href: string;
  label: string;
  icon: LucideIcon;
  current?: boolean;
}

export function WorkflowStrip({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="relative overflow-x-auto">
      {/* Línea conectora (detrás de los nodos). */}
      <div className="pointer-events-none absolute left-0 right-0 top-[34px] hidden h-px bg-line sm:block" aria-hidden="true" />
      <ol role="list" className="relative flex min-w-max gap-2 sm:min-w-0 sm:justify-between">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.href + step.label} className="flex-1">
              <Link
                href={step.href}
                aria-current={step.current ? 'step' : undefined}
                className="group flex flex-col items-center gap-2 rounded-xl px-2 py-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-app"
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200 group-hover:-translate-y-0.5',
                    step.current
                      ? 'border-iconic-primary/40 bg-iconic-primary text-white shadow-[0_8px_20px_-8px_rgba(0,93,214,0.6)]'
                      : 'border-line bg-surface text-iconic-primary group-hover:border-iconic-primary/40',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col items-center">
                  <span className={cn('max-w-[7.5rem] text-[11px] font-medium leading-tight', step.current ? 'text-content' : 'text-content-muted')}>
                    {step.label}
                  </span>
                  {step.current && (
                    <span className="mt-0.5 rounded-full bg-iconic-primary/10 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-iconic-primary dark:bg-iconic-primary/20 dark:text-iconic-cyan">
                      Actual
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
