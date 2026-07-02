/**
 * floating-workflow-dock.tsx — "Workflow companion" flotante
 * (ICONIC_OPS_UIX_FLOATING_WORKFLOW_COMPANION_V4_2_13).
 *
 * Versión compacta y flotante del workflow strip del Dashboard, para acompañar al
 * usuario FUERA del dashboard. Client Component. Detecta el paso por la ruta actual,
 * navega a rutas EXISTENTES, se minimiza (persiste en localStorage) y es theme-aware.
 * NO duplica el CTA del Asistente (el primer nodo solo navega a /quote existente).
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Sparkles,
  FolderOpen,
  Package,
  Truck,
  Tags,
  Radar,
  ClipboardCheck,
  ChevronDown,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { canAccessModule, type AccessModule } from '@/server/access/module-access';
import { canUseQuoteAssistant } from '@/lib/access/surface-visibility';

interface DockStep {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  module: AccessModule;
  requiresAssistant?: boolean;
}

const STEPS: DockStep[] = [
  { href: '/quote', label: 'Cotizar con asistente', short: 'Cotizar', icon: Sparkles, module: 'estimates', requiresAssistant: true },
  { href: '/projects', label: 'Proyectos', short: 'Proyectos', icon: FolderOpen, module: 'projects' },
  { href: '/catalog', label: 'Catálogo', short: 'Catálogo', icon: Package, module: 'catalog' },
  { href: '/catalog/providers', label: 'Proveedores', short: 'Proveedores', icon: Truck, module: 'catalog' },
  { href: '/catalog', label: 'Inteligencia de precios', short: 'Inteligencia', icon: Tags, module: 'price-intelligence' },
  { href: '/catalog/monitoring', label: 'Monitoreo de precios', short: 'Monitoreo', icon: Radar, module: 'monitoring' },
  { href: '/catalog/prices/review', label: 'Revisión de precios', short: 'Revisión', icon: ClipboardCheck, module: 'operational-review' },
];

const COLLAPSE_KEY = 'iconic-workflow-dock-collapsed';

/** Índice del paso activo según la ruta (específico → general). -1 = ninguno. */
function activeStepIndex(pathname: string): number {
  if (pathname.startsWith('/catalog/prices/review')) return 6;
  if (pathname.startsWith('/catalog/monitoring')) return 5;
  if (pathname.startsWith('/catalog/providers')) return 3;
  if (pathname.startsWith('/catalog')) return 2;
  if (pathname.startsWith('/quote')) return 0;
  if (pathname.includes('/workspace')) return 0; // presupuesto activo / cotización
  if (pathname.startsWith('/projects') || pathname.startsWith('/estimates')) return 1;
  return -1;
}

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function FloatingWorkflowDock({ profileRole = null }: { profileRole?: string | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  // En el Dashboard ya está la barra grande → no duplicar.
  if (pathname.startsWith('/dashboard')) return null;

  const visibleSteps = STEPS.filter((step) =>
    step.requiresAssistant
      ? canUseQuoteAssistant(profileRole)
      : canAccessModule(profileRole, step.module),
  );
  if (visibleSteps.length === 0) return null;

  const activeHref = STEPS[activeStepIndex(pathname)]?.href ?? null;

  function setCollapsedPersist(next: boolean) {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* noop */
    }
  }

  // Minimizado → pill "Flujo" para reabrir.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsedPersist(false)}
        aria-label="Mostrar barra de flujo"
        className="glass fixed bottom-4 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium text-content shadow-iconic lg:inline-flex"
      >
        <Workflow className="h-4 w-4 text-iconic-primary dark:text-iconic-cyan" aria-hidden="true" />
        Flujo
      </button>
    );
  }

  return (
    <div
      role="navigation"
      aria-label="Flujo de trabajo"
      className="glass fixed bottom-4 left-1/2 z-30 hidden w-[min(56rem,calc(100vw-8rem))] -translate-x-1/2 items-center gap-1 rounded-2xl px-2 py-1.5 shadow-iconic lg:flex"
    >
      <ol role="list" className="flex flex-1 items-center gap-0.5 overflow-x-auto">
        {visibleSteps.map((step) => {
          const Icon = step.icon;
          const isActive = step.href === activeHref;
          return (
            <li key={step.href + step.label} className="min-w-0 flex-1">
              <Link
                href={step.href}
                aria-current={isActive ? 'step' : undefined}
                aria-label={step.label}
                title={step.label}
                className={cn(
                  'group flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface',
                  isActive ? 'bg-iconic-primary/10 dark:bg-iconic-primary/20' : 'hover:bg-surface-muted',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
                    isActive
                      ? 'bg-iconic-primary text-white'
                      : 'text-content-muted group-hover:text-iconic-primary dark:group-hover:text-iconic-cyan',
                  )}
                >
                  <Icon className="h-[16px] w-[16px]" aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    'truncate text-[11px] font-medium',
                    isActive ? 'text-content' : 'hidden text-content-muted xl:inline',
                  )}
                >
                  {step.short}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setCollapsedPersist(true)}
        aria-label="Minimizar barra de flujo"
        title="Minimizar"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
