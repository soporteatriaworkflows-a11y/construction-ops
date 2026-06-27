/**
 * iconic-icon.tsx — Capa central de iconografía premium
 * (ICONIC_OPS_UIX_PREMIUM_ICONOGRAPHY_GLASS_SYSTEM_V4_2_3).
 *
 * Normaliza presentación de íconos (lucide) con tamaños y ESTADOS consistentes,
 * en paleta ICONIC (navy/azul/cian/grises), theme-aware. El trazo monoline (1.75)
 * y las terminaciones redondeadas se fijan globalmente en `globals.css` (`svg.lucide`).
 *
 * - `IconicIcon`: ícono suelto con tono semántico.
 * - `IconChip`: ícono en "plate" redondeado (nav, action cards, headers).
 */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type IconTone = 'default' | 'active' | 'muted' | 'primary' | 'success' | 'warning' | 'danger';

const ICON_TONE: Record<IconTone, string> = {
  default: 'text-content',
  active: 'text-iconic-primary dark:text-iconic-cyan',
  muted: 'text-content-muted',
  primary: 'text-iconic-primary',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

export function IconicIcon({
  icon: Icon,
  size = 18,
  tone = 'default',
  className,
}: {
  icon: LucideIcon;
  size?: number;
  tone?: IconTone;
  className?: string;
}) {
  return <Icon width={size} height={size} className={cn('shrink-0', ICON_TONE[tone], className)} aria-hidden="true" />;
}

const CHIP_TONE: Record<IconTone, string> = {
  default: 'bg-surface-muted text-content-muted',
  active: 'bg-iconic-primary/10 text-iconic-primary dark:bg-iconic-primary/20 dark:text-iconic-cyan',
  muted: 'bg-surface-muted text-content-muted',
  primary: 'bg-iconic-primary text-white shadow-sm',
  success: 'bg-green-500/12 text-green-600 dark:text-green-300',
  warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
  danger: 'bg-red-500/12 text-red-600 dark:text-red-300',
};

const CHIP_BOX = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-10 w-10' } as const;
const CHIP_ICON = { sm: 15, md: 18, lg: 20 } as const;

export function IconChip({
  icon: Icon,
  tone = 'default',
  size = 'md',
  shape = 'rounded',
  className,
}: {
  icon: LucideIcon;
  tone?: IconTone;
  size?: keyof typeof CHIP_BOX;
  /** `rounded` = esquinas suaves; `capsule` = círculo (ref G, icon-chip). */
  shape?: 'rounded' | 'capsule';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
        shape === 'capsule' ? 'rounded-full' : 'rounded-xl',
        CHIP_BOX[size],
        CHIP_TONE[tone],
        className,
      )}
      aria-hidden="true"
    >
      <Icon width={CHIP_ICON[size]} height={CHIP_ICON[size]} />
    </span>
  );
}
