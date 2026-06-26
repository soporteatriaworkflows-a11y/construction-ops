/**
 * operations-header.tsx — Command bar / header operativo reutilizable
 * (ICONIC_OPS_UIX_APP_WIDE_OPERATIONS_ROLLOUT_V4). Server-safe / presentacional.
 *
 * Generaliza el patrón liberado en el Workspace V3C ("BOQ · Workspace de
 * operación"): barra navy ICONIC con eyebrow cian, título, microcopy de contexto,
 * un stat/héroe opcional a la derecha y acciones. Tokens ICONIC; NO dark mode
 * global (es una banda de cabecera sobre página clara).
 */
import type { ReactNode } from 'react';

export function OperationsHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  stat,
  actions,
  breadcrumb,
}: {
  /** Etiqueta corta de módulo (cian, mayúsculas). Ej: "Presupuesto". */
  eyebrow: string;
  title: string;
  /** Microcopy operativo / contexto bajo el título. */
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Indicador héroe a la derecha (p. ej. total, conteo clave). */
  stat?: { label: string; value: string; tone?: 'default' | 'warn' };
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-iconic-ink via-[#071042] to-[#0a1145] px-4 py-3 text-white shadow-iconic sm:px-5 sm:py-4">
      {breadcrumb && <div className="mb-1.5 text-[11px] text-white/60">{breadcrumb}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-iconic-cyan">
            {icon}
            {eyebrow}
          </p>
          <h1 className="mt-0.5 truncate text-lg font-semibold text-white">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {stat && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-white/50">{stat.label}</p>
              <p className={`text-xl font-bold tabular-nums ${stat.tone === 'warn' ? 'text-amber-300' : 'text-white'}`}>
                {stat.value}
              </p>
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
