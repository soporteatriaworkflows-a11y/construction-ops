/**
 * contextual-nav.tsx — Navegación contextual por módulo (ICONIC_OPS_UIX_SHELL_V1).
 *
 * SOLO presentación. Data-driven por `pathname`; enlaza ÚNICAMENTE a rutas que ya
 * existen (verificadas). No cambia rutas ni crea features. Presupuestos profundo
 * se difiere (Fase 3): solo se muestra contexto cuando hay ≥2 sub-secciones reales.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export interface ContextItem {
  label: string;
  href: string;
}
export interface ContextNavModel {
  module: string;
  items: ContextItem[];
}

/** Mapa módulo → sub-secciones (todas rutas existentes). Orden = presentación. */
const MODULES: { prefix: string; module: string; items: ContextItem[] }[] = [
  {
    prefix: '/planning',
    module: 'Cronograma',
    items: [
      { label: 'Lista', href: '/planning' },
      { label: 'Nuevo cronograma', href: '/planning/new' },
    ],
  },
  {
    prefix: '/apu',
    module: 'APU',
    items: [
      { label: 'Biblioteca', href: '/apu' },
      { label: 'Importar', href: '/apu/import' },
      { label: 'Reconciliación', href: '/apu/reconciliation' },
      { label: 'Nuevo', href: '/apu/new' },
    ],
  },
  {
    prefix: '/catalog',
    module: 'Catálogo',
    items: [
      { label: 'Recursos', href: '/catalog' },
      { label: 'Proveedores', href: '/catalog/providers' },
      { label: 'Precios', href: '/catalog/prices/review' },
      { label: 'Importación', href: '/catalog/import' },
      { label: 'Monitoreo', href: '/catalog/monitoring' },
    ],
  },
  {
    prefix: '/quantities',
    module: 'Cantidades',
    items: [
      { label: 'Resumen', href: '/quantities' },
      { label: 'Workspace', href: '/quantities/workspace' },
      { label: 'Importar', href: '/quantities/import' },
    ],
  },
  {
    prefix: '/projects',
    module: 'Proyectos',
    items: [
      { label: 'Lista', href: '/projects' },
      { label: 'Nuevo', href: '/projects/new' },
    ],
  },
];

/** Resuelve el contexto del módulo activo, o `null` si no aplica. PURA. */
export function resolveContextNav(pathname: string): ContextNavModel | null {
  const hit = MODULES.find((m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`));
  if (!hit) return null;
  if (hit.items.length < 2) return null;
  return { module: hit.module, items: hit.items };
}

/**
 * Item activo = el de href con prefijo coincidente MÁS LARGO (evita que la raíz y
 * una sub-ruta queden ambas activas). PURA.
 */
export function activeContextHref(pathname: string, items: ContextItem[]): string | null {
  let best: string | null = null;
  for (const it of items) {
    if (pathname === it.href || pathname.startsWith(`${it.href}/`)) {
      if (best === null || it.href.length > best.length) best = it.href;
    }
  }
  return best;
}

export function ContextualNav() {
  const pathname = usePathname() ?? '';
  const ctx = resolveContextNav(pathname);
  if (!ctx) return null;
  const active = activeContextHref(pathname, ctx.items);
  return (
    <div className="border-b border-iconic-soft-blue/50 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-1 overflow-x-auto px-6">
        <span className="mr-2 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-iconic-graphite/40">
          {ctx.module}
        </span>
        {ctx.items.map((it) => {
          const isActive = it.href === active;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-iconic-primary text-iconic-primary'
                  : 'border-transparent text-iconic-graphite/60 hover:text-iconic-ink',
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
