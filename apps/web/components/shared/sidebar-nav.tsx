/**
 * sidebar-nav.tsx — Navegación lateral con estado activo (UI/Branding ICONIC V1).
 *
 * Client Component: `usePathname` para resaltar la ruta actual (acento cian
 * discreto). Solo presentación; no altera navegación ni lógica.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderOpen,
  BookOpen,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Hash,
  CalendarRange,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: FolderOpen },
  { href: '/estimates', label: 'Presupuestos', icon: ClipboardList },
  { href: '/apu', label: 'APU', icon: Calculator },
  { href: '/catalog', label: 'Catálogo', icon: BookOpen },
  { href: '/quantities', label: 'Cantidades', icon: Hash },
  { href: '/planning', label: 'Cronograma', icon: CalendarRange },
];

/** Entrada de gestión de accesos: solo visible para roles de gestión. */
const ACCESS_ITEM = { href: '/settings/access', label: 'Accesos', icon: Users };

/**
 * @param canManageAccess - resuelto server-side (admin/gerencia). Ocultar el
 *   botón NO es la única barrera: las acciones server-side revalidan permisos.
 */
function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-cyan',
          active
            ? 'bg-gradient-to-r from-iconic-primary to-iconic-primary/70 text-white ring-1 ring-inset ring-iconic-cyan/30'
            : 'text-iconic-soft-blue/90 hover:bg-white/[0.07] hover:text-white',
        )}
        style={active ? { boxShadow: '0 8px 20px -10px rgba(0,93,214,0.8)' } : undefined}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-iconic-cyan"
            style={{ boxShadow: '0 0 8px 1px rgba(0,184,255,0.7)' }}
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            active ? 'bg-white/15' : 'bg-white/[0.04] group-hover:bg-white/10',
          )}
          aria-hidden="true"
        >
          <Icon className={cn('h-4 w-4', active ? 'text-white' : 'text-iconic-soft-blue')} />
        </span>
        {label}
      </Link>
    </li>
  );
}

export function SidebarNav({ canManageAccess = false }: { canManageAccess?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav className="flex-1 overflow-y-auto py-4">
      <p className="px-5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-iconic-soft-blue/40">
        Módulos
      </p>
      <ul role="list" className="space-y-0.5 px-3">
        {NAV_ITEMS.map((it) => (
          <NavLink key={it.href} {...it} active={isActive(it.href)} />
        ))}
      </ul>
      {canManageAccess && (
        <>
          <p className="mt-5 px-5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-iconic-soft-blue/40">
            Administración
          </p>
          <ul role="list" className="space-y-0.5 px-3">
            <NavLink {...ACCESS_ITEM} active={isActive(ACCESS_ITEM.href)} />
          </ul>
        </>
      )}
    </nav>
  );
}
