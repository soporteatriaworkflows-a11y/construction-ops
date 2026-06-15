/**
 * breadcrumbs.tsx — Migas de pan del shell (ICONIC_OPS_UIX_SHELL_V1, Fase 1).
 *
 * SOLO presentación. Deriva las migas del `pathname` con labels seguros por
 * segmento (no consulta nombres reales de entidades para no tocar lógica server).
 * Los segmentos dinámicos (ids) se etiquetan como "Detalle" y NO se enlazan;
 * solo se enlazan rutas estáticas conocidas (evita 404 desde una miga).
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** href si la ruta es navegable y conocida; ausente = texto plano. */
  href?: string;
}

/** Labels es-CO por segmento de ruta. */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Proyectos',
  estimates: 'Presupuestos',
  apu: 'APU',
  catalog: 'Catálogo',
  quantities: 'Cantidades',
  planning: 'Cronograma',
  settings: 'Configuración',
  access: 'Accesos',
  new: 'Nuevo',
  import: 'Importar',
  reconciliation: 'Reconciliación',
  providers: 'Proveedores',
  prices: 'Precios',
  review: 'Revisión',
  monitoring: 'Monitoreo',
  workspace: 'Workspace',
  resources: 'Recursos',
  scopes: 'Alcances',
  chapters: 'Capítulos',
  items: 'Ítems',
  compare: 'Comparación',
  edit: 'Editar',
  sync: 'Sincronizar',
  'price-intelligence': 'Inteligencia de precios',
};

/**
 * Rutas estáticas navegables (con page index real). Solo estas se enlazan en las
 * migas; cualquier otra (dinámica o colección sin índice) queda como texto.
 */
const SAFE_LINK_PATHS = new Set<string>([
  '/dashboard',
  '/projects',
  '/projects/new',
  '/estimates',
  '/apu',
  '/apu/import',
  '/apu/new',
  '/apu/reconciliation',
  '/catalog',
  '/catalog/import',
  '/catalog/monitoring',
  '/catalog/providers',
  '/catalog/providers/import',
  '/catalog/providers/new',
  '/catalog/prices/review',
  '/catalog/resources/new',
  '/planning',
  '/planning/new',
  '/quantities',
  '/quantities/import',
  '/quantities/workspace',
  '/quantities/workspace/new',
  '/settings',
  '/settings/access',
]);

/** `true` si el segmento parece un id dinámico (uuid/hex largo/numérico). */
export function isDynamicSegment(seg: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true;
  if (/^\d+$/.test(seg)) return true;
  return false;
}

function labelFor(seg: string): string {
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg];
  if (isDynamicSegment(seg)) return 'Detalle';
  // Title-case de respaldo (segmentos desconocidos no dinámicos).
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
}

/**
 * Construye las migas a partir del `pathname`. Función PURA. El primer crumb es
 * "Inicio" (→ /dashboard). El último nunca se enlaza. Solo enlaza rutas seguras.
 */
export function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: 'Inicio', href: '/dashboard' }];

  const crumbs: Crumb[] = [];
  let cumulative = '';
  segments.forEach((seg, i) => {
    cumulative += `/${seg}`;
    const isLast = i === segments.length - 1;
    const linkable = !isLast && SAFE_LINK_PATHS.has(cumulative);
    crumbs.push({ label: labelFor(seg), href: linkable ? cumulative : undefined });
  });
  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? '/dashboard';
  const crumbs = buildBreadcrumbs(pathname);
  return (
    <nav aria-label="Migas de pan" className="flex min-w-0 items-center gap-1 text-sm">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-iconic-graphite/50 hover:text-iconic-primary"
        aria-label="Inicio"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-iconic-graphite/30" aria-hidden="true" />
          {c.href ? (
            <Link href={c.href} className="truncate text-iconic-graphite/60 hover:text-iconic-primary">
              {c.label}
            </Link>
          ) : (
            <span
              className={
                i === crumbs.length - 1
                  ? 'truncate font-medium text-iconic-ink'
                  : 'truncate text-iconic-graphite/60'
              }
              aria-current={i === crumbs.length - 1 ? 'page' : undefined}
            >
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
