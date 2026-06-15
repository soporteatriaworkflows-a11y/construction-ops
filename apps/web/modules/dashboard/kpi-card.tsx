/**
 * KpiCard — tarjeta de indicador clave (DASHBOARD_VISUAL_DEEP_V1).
 * Propiedad: agent-dashboard. SOLO presentación (no calcula nada financiero).
 *
 * Diseño "centro de control" ICONIC: barra de acento lateral, jerarquía clara y
 * micro-barra opcional. Aditivo y retrocompatible (props previas intactas).
 */

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export type KpiAccent = 'primary' | 'cyan' | 'navy' | 'green' | 'amber' | 'red' | 'neutral';

const ACCENT_BAR: Record<KpiAccent, string> = {
  primary: 'bg-iconic-primary',
  cyan: 'bg-iconic-cyan',
  navy: 'bg-iconic-ink',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  neutral: 'bg-iconic-soft-blue',
};

export interface KpiCardProps {
  title: string;
  value: string;
  description?: string;
  /** Si true, muestra skeleton en lugar del valor. */
  loading?: boolean;
  /** Color del valor (clase Tailwind, p.ej. 'text-iconic-ink'). */
  valueColor?: string;
  /** Ícono React node (p.ej. lucide-react). */
  icon?: React.ReactNode;
  /** Fondo del contenedor del ícono (clase Tailwind). */
  iconBg?: string;
  /** Acento lateral ICONIC (default 'neutral'). */
  accent?: KpiAccent;
  /** Micro-barra de proporción (0..100), solo presentación. */
  bar?: { pct: number };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function KpiCard({
  title,
  value,
  description,
  loading = false,
  valueColor = 'text-iconic-ink',
  icon,
  iconBg = 'bg-gray-100',
  accent = 'neutral',
  bar,
}: KpiCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-iconic">
      <span className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`} aria-hidden="true" />
      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          {icon && (
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`} aria-hidden="true">
              {icon}
            </div>
          )}
        </div>
        {loading ? (
          <>
            <Skeleton className="mb-1 mt-2 h-7 w-32" />
            {description && <Skeleton className="mt-1 h-3 w-24" />}
          </>
        ) : (
          <>
            <div className={`mt-1.5 text-2xl font-bold leading-tight tabular-nums ${valueColor}`}>{value}</div>
            {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
          </>
        )}
        {bar && !loading && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <span className={`block h-full rounded-full ${ACCENT_BAR[accent]}`} style={{ width: `${clampPct(bar.pct)}%` }} />
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Versión compacta para valores financieros grandes.
 */
export function FinancialKpiCard({
  title,
  value,
  description,
  loading = false,
  valueColor = 'text-iconic-ink',
}: Omit<KpiCardProps, 'icon' | 'iconBg' | 'accent' | 'bar'>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-40" />
        ) : (
          <>
            <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
            {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
