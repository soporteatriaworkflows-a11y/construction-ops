/**
 * steel-sub-nav.tsx — Navegación local del preview de Steel Ops.
 *
 * Deliberadamente separada del sidebar compartido (`components/shared/sidebar-nav.tsx`):
 * este módulo no está enlazado ahí todavía (ver docs/STEEL_OPS_UIX_FLAG_CONTRACT.md §2).
 * Solo sirve para navegar entre las 9 pantallas del preview vía URL directa.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const STEEL_NAV_ITEMS = [
  { href: '/steel', label: 'Hub' },
  { href: '/steel/takeoffs', label: 'Takeoffs' },
  { href: '/steel/review', label: 'Revisión' },
  { href: '/steel/optimization', label: 'Optimización' },
  { href: '/steel/orders', label: 'Pedidos' },
  { href: '/steel/catalog', label: 'Catálogo' },
  { href: '/steel/boq-link', label: 'Vinculación APU/BOQ' },
  { href: '/steel/settings', label: 'Configuración' },
];

export function SteelSubNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/steel' ? pathname === href : pathname.startsWith(href));

  return (
    <nav aria-label="Navegación de Acero y Estructura Metálica" className="mb-6 overflow-x-auto">
      <ul role="list" className="flex gap-1.5 border-b border-iconic-soft-blue/40 pb-2">
        {STEEL_NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                'inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-iconic-primary text-white'
                  : 'text-iconic-graphite/70 hover:bg-brand-50 hover:text-iconic-ink',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
