/**
 * command-center.tsx — Lenguaje visual "centro de mando" ICONIC
 * (DASHBOARD_VISUAL_DEEP_V1, addendum). SOLO presentación: placas de íconos,
 * sparkbars, fondo blueprint y tiles para el bloque oscuro. Sin datos nuevos,
 * sin cálculos: recibe valores ya derivados. Paleta ICONIC (navy/azul/cian).
 */
import { cn } from '@/lib/utils/cn';

/** Placa de ícono con anillo cian (no ícono suelto). Variantes claro/oscuro. */
export function IconPlate({
  children,
  variant = 'light',
  className,
}: {
  children: React.ReactNode;
  variant?: 'light' | 'glow';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        variant === 'glow'
          ? 'bg-white/5 text-iconic-cyan ring-1 ring-iconic-cyan/40'
          : 'bg-brand-50 text-iconic-primary ring-1 ring-iconic-soft-blue',
        className,
      )}
    >
      {children}
      {variant === 'glow' && (
        <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: '0 0 12px -2px rgba(0,184,255,0.5)' }} />
      )}
    </span>
  );
}

/**
 * Sparkbars CSS (sin dependencias): barras proporcionales a `values` (ya
 * numéricos). Degradado azul→cian. Decorativo (aria-hidden); el dato textual
 * acompaña aparte.
 */
export function Sparkbars({
  values,
  className,
  barClassName,
}: {
  values: number[];
  className?: string;
  barClassName?: string;
}) {
  const max = Math.max(...values, 0.0001);
  return (
    <div className={cn('flex h-full items-end gap-0.5', className)} aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn('flex-1 rounded-sm bg-gradient-to-t from-iconic-primary/70 to-iconic-cyan', barClassName)}
          style={{ height: `${Math.max(6, (Math.max(0, v) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Fondo blueprint técnico (grid + arco) para bloques oscuros. Muy sutil. */
export function BlueprintBg({ className }: { className?: string }) {
  return (
    <svg
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="iconic-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0 L0 0 0 28" fill="none" stroke="rgba(199,220,237,0.08)" strokeWidth="1" />
        </pattern>
        <radialGradient id="iconic-glow" cx="78%" cy="18%" r="55%">
          <stop offset="0%" stopColor="rgba(0,184,255,0.22)" />
          <stop offset="100%" stopColor="rgba(0,184,255,0)" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#iconic-grid)" />
      <rect width="100%" height="100%" fill="url(#iconic-glow)" />
    </svg>
  );
}

/** Tile de dato dentro del bloque oscuro (texto claro sobre navy). */
export function CommandStat({
  label,
  value,
  sub,
  accentBar,
}: {
  label: string;
  value: string;
  sub?: string;
  accentBar?: 'cyan' | 'soft';
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-iconic-soft-blue/70">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/55">{sub}</p>}
      {accentBar && (
        <span
          className={cn('mt-2 block h-0.5 w-8 rounded', accentBar === 'cyan' ? 'bg-iconic-cyan' : 'bg-iconic-soft-blue/50')}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
