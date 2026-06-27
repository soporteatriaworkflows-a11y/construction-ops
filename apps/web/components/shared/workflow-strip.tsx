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
      {/* Línea conectora del timeline (pasa por el centro de los nodos). */}
      <div className="pointer-events-none absolute left-6 right-6 top-[26px] hidden h-0.5 bg-gradient-to-r from-iconic-primary/30 via-line to-line sm:block" aria-hidden="true" />
      <ol role="list" className="relative flex min-w-max gap-2 sm:min-w-0 sm:justify-between">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.href + step.label} className="flex flex-1 justify-center">
              <Link
                href={step.href}
                aria-current={step.current ? 'step' : undefined}
                className="group flex w-[7.5rem] flex-col items-center gap-2 px-1 py-1 text-center focus-visible:outline-none"
              >
                {/* Nodo circular sobre la línea */}
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-iconic-primary group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-app',
                    step.current
                      ? 'border-iconic-primary bg-iconic-primary text-white shadow-[0_8px_20px_-8px_rgba(0,93,214,0.65)]'
                      : 'border-line bg-surface text-iconic-primary group-hover:border-iconic-primary/50',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className={cn('text-[11px] font-medium leading-tight', step.current ? 'text-content' : 'text-content-muted group-hover:text-content')}>
                    {step.label}
                  </span>
                  {step.current && (
                    <span className="rounded-full bg-iconic-primary/10 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-iconic-primary dark:bg-iconic-primary/20 dark:text-iconic-cyan">
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
