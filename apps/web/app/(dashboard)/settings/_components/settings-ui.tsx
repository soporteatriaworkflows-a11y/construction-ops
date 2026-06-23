/**
 * settings-ui.tsx — Primitivas presentacionales del módulo Configuración
 * (SETTINGS_PROFILE_ACCOUNT_V1). Server Components SIN estado ni interactividad;
 * solo composición visual alineada al ICONIC Command UI System. No escriben nada.
 */
import Link from 'next/link';
import {
  User,
  Building2,
  Users,
  SlidersHorizontal,
  Palette,
  ShieldCheck,
  Activity,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  SETTINGS_STATUS_LABELS,
  type SettingsIcon,
  type SettingsStatus,
} from '@/app/(dashboard)/settings/_lib/settings-sections';

/** Mapa clave→icono lucide para las secciones. */
export const SETTINGS_ICONS: Record<SettingsIcon, LucideIcon> = {
  account: User,
  organization: Building2,
  access: Users,
  preferences: SlidersHorizontal,
  branding: Palette,
  security: ShieldCheck,
  system: Activity,
};

/** Chip de estado con color por significado (no todos iguales). */
export function StatusChip({ status }: { status: SettingsStatus }) {
  const styles: Record<SettingsStatus, string> = {
    ready: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    readonly: 'bg-iconic-soft-blue/40 text-iconic-ink ring-iconic-primary/20',
    soon: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    locked: 'bg-gray-100 text-gray-500 ring-gray-400/20',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        styles[status],
      )}
    >
      {SETTINGS_STATUS_LABELS[status]}
    </span>
  );
}

/** Placa de icono ICONIC. `tone` da variedad: navy/cian destacados, plain neutro. */
export function IconPlate({
  icon: Icon,
  tone = 'plain',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: 'navy' | 'cyan' | 'plain';
  size?: 'md' | 'lg';
}) {
  const toneCls = {
    navy: 'bg-iconic-ink text-white ring-1 ring-iconic-primary/40',
    cyan: 'bg-iconic-primary text-white ring-1 ring-iconic-cyan/40',
    plain: 'bg-brand-50 text-iconic-primary ring-1 ring-iconic-soft-blue/60',
  }[tone];
  const dim = size === 'lg' ? 'h-12 w-12 rounded-xl' : 'h-10 w-10 rounded-lg';
  return (
    <span className={cn('flex shrink-0 items-center justify-center', dim, toneCls)} aria-hidden="true">
      <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
    </span>
  );
}

/** Fila etiqueta/valor para vistas read-only. `value` puede ser texto o nodo. */
export function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-iconic-soft-blue/40 py-3 last:border-0">
      <span className="text-sm text-iconic-graphite/60">{label}</span>
      <span className={cn('min-w-0 truncate text-right text-sm font-medium text-iconic-ink', mono && 'font-mono text-xs')}>
        {value ?? '—'}
      </span>
    </div>
  );
}

/** Tarjeta-panel blanca con título opcional. Contenedor base de las sub-páginas. */
export function Panel({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-iconic-soft-blue/60 bg-white p-5 shadow-iconic', className)}>
      {title && (
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-iconic-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-iconic-graphite/55">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Encabezado de sub-página de Configuración: enlace de regreso al hub + eyebrow
 * de contexto + título + chip de estado. Consistente en todas las secciones.
 */
export function SubSettingsHeader({
  title,
  description,
  status,
}: {
  title: string;
  description?: string;
  status?: SettingsStatus;
}) {
  return (
    <div className="mb-6">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-iconic-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary rounded"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Configuración
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-iconic-ink">
          <span className="hidden h-6 w-1 rounded-full bg-iconic-primary sm:inline-block" aria-hidden="true" />
          {title}
        </h1>
        {status && <StatusChip status={status} />}
      </div>
      {description && <p className="mt-1 text-sm text-iconic-graphite/60">{description}</p>}
    </div>
  );
}
