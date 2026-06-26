/**
 * kpi-card.tsx — KPI compacto + banda de KPIs reutilizables
 * (ICONIC_OPS_UIX_APP_WIDE_OPERATIONS_ROLLOUT_V4). Server-safe / presentacional.
 *
 * Generaliza el `OpsKpi` del Workspace V3C. Cards densas (no infladas), tono por
 * significado, opcional clicable/link. Solo display; sin cálculos.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export type KpiTone = 'default' | 'ok' | 'warn' | 'danger';

const TONE: Record<KpiTone, { wrap: string; value: string }> = {
  default: { wrap: 'border-gray-200 bg-white', value: 'text-iconic-ink' },
  ok: { wrap: 'border-green-200 bg-green-50/40', value: 'text-green-700' },
  warn: { wrap: 'border-amber-200 bg-amber-50/50', value: 'text-amber-700' },
  danger: { wrap: 'border-red-200 bg-red-50/50', value: 'text-red-700' },
};

export function KpiCard({
  label,
  value,
  tone = 'default',
  hint,
  href,
  onClick,
}: {
  label: string;
  value: string | number;
  tone?: KpiTone;
  hint?: string;
  href?: string;
  onClick?: () => void;
}) {
  const t = TONE[tone];
  const base = `block rounded-lg border px-3 py-2 text-left shadow-sm ${t.wrap}`;
  const inner = (
    <>
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${t.value}`}>{value}</p>
      {hint && <p className="truncate text-[10px] text-gray-400">{hint}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${base} transition-colors hover:border-iconic-primary/50`}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} transition-colors hover:border-iconic-primary/50`}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** Grilla responsiva para una banda de KPIs. */
export function KpiBand({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 ${className}`}>{children}</div>;
}
