/**
 * workspace-brand.tsx — Identidad visual del workspace (UI/Branding V1).
 *
 * Server Component (sin estado). Lee el workspace activo desde
 * `@/lib/branding/workspace` (multi-tenant ready). Muestra el avatar/logo y el
 * naming visible ("Presupuestos" / "Grupo ICONIC"). El logo es reemplazable por
 * tenant; si el asset no existiera, el contenedor con iniciales queda visible.
 */
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import { getActiveWorkspace } from '@/lib/branding/workspace';

/** Avatar/logo cuadrado del workspace (tile blanco con el símbolo ICONIC). */
export function WorkspaceLogo({ size = 28, className }: { size?: number; className?: string }) {
  const ws = getActiveWorkspace();
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-iconic-soft',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute text-[10px] font-bold text-iconic-navy">{ws.initials}</span>
      <Image
        src={ws.logoSymbol}
        alt=""
        width={size}
        height={size}
        className="relative object-contain p-0.5"
      />
    </span>
  );
}

type Variant = 'sidebar' | 'login' | 'chip';

/** Bloque de marca: logo + nombre de producto + workspace. */
export function WorkspaceBrand({ variant = 'sidebar', className }: { variant?: Variant; className?: string }) {
  const ws = getActiveWorkspace();

  if (variant === 'login') {
    return (
      <div className={cn('flex flex-col items-center gap-3', className)}>
        <WorkspaceLogo size={56} className="rounded-2xl shadow-sm" />
        <div className="text-center">
          <p className="text-2xl font-bold tracking-tight text-iconic-navy">{ws.productName}</p>
          <p className="mt-0.5 text-sm font-medium text-iconic-primary">{ws.workspaceName}</p>
        </div>
      </div>
    );
  }

  if (variant === 'chip') {
    return (
      <span className={cn('inline-flex items-center gap-2 rounded-full border border-iconic-soft bg-white px-2.5 py-1', className)}>
        <WorkspaceLogo size={20} />
        <span className="text-xs font-medium text-iconic-navy">{ws.workspaceName}</span>
      </span>
    );
  }

  // sidebar
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <WorkspaceLogo size={32} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-white">{ws.productName}</span>
        <span className="truncate text-[11px] font-medium text-iconic-soft">{ws.workspaceName}</span>
      </span>
    </div>
  );
}
