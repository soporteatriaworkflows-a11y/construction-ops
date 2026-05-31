/**
 * Layout autenticado del dashboard.
 * Server Component — sin estado de cliente.
 * Propiedad: agent-frontend-boq.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Building2,
  FolderOpen,
  BookOpen,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Hash,
} from 'lucide-react';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/projects',
    label: 'Proyectos',
    icon: FolderOpen,
  },
  {
    href: '/estimates',
    label: 'Presupuestos',
    icon: ClipboardList,
  },
  {
    href: '/apu',
    label: 'APU',
    icon: Calculator,
  },
  {
    href: '/catalog',
    label: 'Catálogo',
    icon: BookOpen,
  },
  {
    href: '/quantities',
    label: 'Cantidades',
    icon: Hash,
  },
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white"
        aria-label="Navegación principal"
      >
        {/* Logotipo */}
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-700 text-white"
            aria-hidden="true"
          >
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-gray-900">
            Construction Ops
          </span>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul role="list" className="space-y-0.5 px-2">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer del sidebar */}
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400">Oleada 3A — fixture</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-x-hidden" id="main-content" tabIndex={-1}>
        <div className="mx-auto max-w-screen-2xl px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
