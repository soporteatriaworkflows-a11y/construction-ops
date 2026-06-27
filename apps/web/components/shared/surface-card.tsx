/**
 * surface-card.tsx — Sistema de cards con jerarquía
 * (ICONIC_OPS_UIX_REFERENCE_DRIVEN_DASHBOARD_REDESIGN_V4_2_6).
 *
 * Variantes con peso visual propio (inspirado en refs B/D/F): no todas las cards
 * se ven iguales. Soft-UI: hairline + sombra muy suave en claro; en dark, borde fino
 * (sin sombra pesada). Presentacional; sin lógica.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type SurfaceVariant = 'primary' | 'metric' | 'action' | 'chart' | 'status';

const BASE = 'rounded-2xl border transition-all duration-200';

const VARIANT: Record<SurfaceVariant, string> = {
  // Hero/resumen: superficie destacada con leve realce de marca.
  primary:
    'border-iconic-primary/15 bg-surface p-5 shadow-[0_2px_12px_-4px_rgba(16,24,40,0.14)] dark:border-line dark:shadow-none',
  // Métrica compacta.
  metric: 'border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:shadow-none',
  // Tarjeta de acción (interactiva): lift + realce de marca al hover.
  action:
    'border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-0.5 hover:border-iconic-primary/40 hover:shadow-[0_10px_28px_-10px_rgba(0,93,214,0.25)] dark:shadow-none dark:hover:border-white/15',
  // Card de gráfico/visualización compacta.
  chart: 'border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:shadow-none',
  // Card de estado.
  status: 'border-line bg-surface-soft p-4 dark:bg-surface',
};

export function SurfaceCard({
  variant = 'metric',
  className,
  children,
  ...rest
}: {
  variant?: SurfaceVariant;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(BASE, VARIANT[variant], className)} {...rest}>
      {children}
    </div>
  );
}

/** Variante action como enlace (lift al hover, navegable). */
export function ActionCard({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        BASE,
        VARIANT.action,
        'block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface',
        className,
      )}
    >
      {children}
    </Link>
  );
}
