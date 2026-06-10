/**
 * workspace-brand.tsx — Identidad visual del workspace (UI/Branding ICONIC V1).
 *
 * Server Component (sin estado). Lee el workspace activo desde
 * `@/lib/branding/workspace`. Muestra avatar/logo y naming visible
 * ("Presupuestos" / "Grupo ICONIC"). Logo reemplazable por tenant.
 */
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import { getActiveWorkspace } from '@/lib/branding/workspace';

/** Avatar/símbolo del workspace (tile blanco con el monograma ICONIC). */
export function WorkspaceLogo({ size = 28, className }: { size?: number; className?: string }) {
  const ws = getActiveWorkspace();
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-iconic-soft-blue',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute text-[10px] font-bold text-iconic-ink">{ws.initials}</span>
      <Image src={ws.logoSymbol} alt="" width={size} height={size} className="relative object-contain p-0.5" />
    </span>
  );
}

/** Logo completo (login / cabeceras amplias). */
export function WorkspaceLogoFull({ className }: { className?: string }) {
  const ws = getActiveWorkspace();
  return (
    <span className={cn('inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-iconic-soft-blue', className)}>
      <Image src={ws.logoFull} alt={ws.workspaceName} width={200} height={64} className="h-12 w-auto object-contain" priority />
    </span>
  );
}

type Variant = 'sidebar' | 'login' | 'chip';

/** Bloque de marca: logo + producto + workspace, según contexto. */
export function WorkspaceBrand({ variant = 'sidebar', className }: { variant?: Variant; className?: string }) {
  const ws = getActiveWorkspace();

  if (variant === 'login') {
    return (
      <div className={cn('flex flex-col items-center gap-3 sm:gap-4', className)}>
        <WorkspaceLogoFull className="max-w-[210px] sm:max-w-none" />
        <div className="text-center">
          <p className="text-xl font-bold tracking-tight text-iconic-ink sm:text-2xl">
            {ws.productName}
          </p>
          <p className="mt-0.5 text-sm font-medium text-iconic-primary">{ws.workspaceName}</p>
          <p className="mt-1 text-xs text-iconic-graphite/70">{ws.descriptor}</p>
        </div>
      </div>
    );
  }

  if (variant === 'chip') {
    return (
      <span className={cn('inline-flex items-center gap-2 rounded-full border border-iconic-soft-blue bg-white px-2.5 py-1', className)}>
        <WorkspaceLogo size={20} />
        <span className="text-xs font-medium text-iconic-ink">{ws.workspaceName}</span>
      </span>
    );
  }

  // sidebar
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <WorkspaceLogo size={34} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-white">{ws.productName}</span>
        <span className="truncate text-[11px] font-medium text-iconic-soft-blue">{ws.workspaceName}</span>
      </span>
    </div>
  );
}
