/**
 * account-menu.tsx — Menú de cuenta del topbar (ICONIC_OPS_UIX_SHELL_V1, Fase 1).
 *
 * SOLO presentación. Recibe datos del actor YA resueltos server-side (email/rol/
 * organización); no hace consultas. "Cerrar sesión" enlaza el route handler
 * `/logout` existente (no se modifica). No crea página de perfil (Fase 4).
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Settings, Users, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ThemeToggle } from './theme-toggle';

/** Etiquetas es-CO de los roles de perfil. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerencia: 'Gerencia',
  presupuestos: 'Presupuestos',
  obra: 'Obra',
  compras: 'Compras',
  consulta: 'Consulta',
};

export interface AccountMenuLink {
  label: string;
  href: string;
  icon: 'settings' | 'users' | 'logout';
  external?: boolean;
}

/** Enlaces del menú según permisos. PURA y testeable. */
export function accountMenuLinks(canManageAccess: boolean): AccountMenuLink[] {
  const links: AccountMenuLink[] = [{ label: 'Configuración', href: '/settings', icon: 'settings' }];
  if (canManageAccess) links.push({ label: 'Accesos / Usuarios', href: '/settings/access', icon: 'users' });
  links.push({ label: 'Cerrar sesión', href: '/logout', icon: 'logout', external: true });
  return links;
}

/** Iniciales (máx 2) a partir del email; respaldo "U". PURA. */
export function initialsFromEmail(email: string | null | undefined): string {
  if (!email) return 'U';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : local.slice(0, 2)) || 'U';
  return letters.toUpperCase();
}

const ICONS = { settings: Settings, users: Users, logout: LogOut } as const;

interface Props {
  email: string | null;
  role: string | null;
  workspaceName: string;
  canManageAccess: boolean;
}

export function AccountMenu({ email, role, workspaceName, canManageAccess }: Props) {
  const [open, setOpen] = useState(false);
  const links = accountMenuLinks(canManageAccess);
  const roleLabel = role ? ROLE_LABELS[role] ?? role : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-iconic-soft-blue bg-white py-1 pl-1 pr-2 text-sm hover:bg-iconic-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary dark:border-line dark:bg-surface dark:hover:bg-surface-muted"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-iconic-primary text-xs font-semibold text-white">
          {initialsFromEmail(email)}
        </span>
        <span className="hidden max-w-[140px] truncate text-iconic-ink sm:inline dark:text-content">{email ?? 'Usuario'}</span>
        <ChevronDown className="h-4 w-4 text-iconic-graphite/50" aria-hidden="true" />
      </button>

      {open && (
        <>
          {/* Cierre por clic fuera. */}
          <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-iconic-soft-blue bg-white shadow-iconic dark:border-line dark:bg-surface">
            <div className="border-b border-iconic-soft-blue/60 bg-iconic-gray/40 px-4 py-3 dark:border-line dark:bg-surface-soft">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-iconic-primary text-sm font-semibold text-white">
                  {initialsFromEmail(email)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-iconic-ink dark:text-content">{email ?? 'Usuario'}</p>
                  <p className="truncate text-xs text-iconic-graphite/60 dark:text-content-muted">{workspaceName}</p>
                </div>
              </div>
              {roleLabel && (
                <span className="mt-2 inline-flex items-center rounded-full bg-iconic-soft-blue/40 px-2 py-0.5 text-[11px] font-medium text-iconic-ink">
                  {roleLabel}
                </span>
              )}
            </div>
            {/* Tema de la interfaz */}
            <div className="border-b border-iconic-soft-blue/60 px-4 py-3 dark:border-line">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-content-muted">Tema</p>
              <ThemeToggle />
            </div>
            <ul role="none" className="py-1">
              {links.map((l) => {
                const Icon = ICONS[l.icon];
                const className = cn(
                  'flex items-center gap-2.5 px-4 py-2 text-sm text-iconic-graphite hover:bg-iconic-gray dark:text-content dark:hover:bg-surface-muted',
                  l.icon === 'logout' && 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10',
                );
                return (
                  <li key={l.href} role="none">
                    {l.external ? (
                      <a href={l.href} role="menuitem" className={className}>
                        <Icon className="h-4 w-4" aria-hidden="true" /> {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} role="menuitem" className={className} onClick={() => setOpen(false)}>
                        <Icon className="h-4 w-4" aria-hidden="true" /> {l.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
