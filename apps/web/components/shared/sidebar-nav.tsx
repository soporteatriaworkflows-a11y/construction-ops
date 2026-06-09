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

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto py-4">
      <ul role="list" className="space-y-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-cyan',
                  active
                    ? 'bg-iconic-primary text-white'
                    : 'text-iconic-soft-blue hover:bg-white/10 hover:text-white',
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r bg-iconic-cyan" style={{ width: 3 }} aria-hidden="true" />
                )}
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-iconic-soft-blue')} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
