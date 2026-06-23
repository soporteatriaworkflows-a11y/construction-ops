/**
 * command-palette.tsx — Paleta de comandos / búsqueda global ICONIC
 * (ICONIC_COMMAND_SEARCH_V1).
 *
 * Client Component. Compone el disparador del topbar (la barra "Buscar en
 * ICONIC OPS…") y un overlay tipo command palette. SOLO navegación a rutas
 * EXISTENTES vía `next/navigation`; sin consultas, sin server, sin escritura.
 *
 * Se abre por: clic en la barra, Ctrl+K o ⌘K. Navegación con teclado
 * (flechas / Enter / Escape). Respeta `canManageAccess` a través de los datos.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  FolderOpen,
  ClipboardList,
  Calculator,
  BookOpen,
  Hash,
  CalendarRange,
  Settings,
  Users,
  Plus,
  Upload,
  GitCompareArrows,
  Truck,
  PanelsTopLeft,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  buildCommandItems,
  filterCommands,
  groupCommands,
  type CommandIcon,
} from '@/components/shared/command-palette-data';

/** Mapa clave→icono. Mantiene el módulo de datos agnóstico de presentación. */
const ICONS: Record<CommandIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderOpen,
  estimates: ClipboardList,
  apu: Calculator,
  catalog: BookOpen,
  quantities: Hash,
  planning: CalendarRange,
  settings: Settings,
  access: Users,
  create: Plus,
  import: Upload,
  reconcile: GitCompareArrows,
  providers: Truck,
  workspace: PanelsTopLeft,
};

export function CommandPalette({ canManageAccess }: { canManageAccess: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => buildCommandItems(canManageAccess), [canManageAccess]);
  const filtered = useMemo(() => filterCommands(items, query), [items, query]);
  const sections = useMemo(() => groupCommands(filtered), [filtered]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  // Atajo global Ctrl/⌘+K para alternar la paleta.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Enfoca el input al abrir.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Mantiene el ítem activo visible al navegar con teclado.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) go(target.href);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  return (
    <>
      {/* Disparador del topbar: misma afordancia visual, ahora funcional. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir búsqueda global (Ctrl o ⌘ K)"
        aria-haspopup="dialog"
        className="hidden min-w-0 max-w-sm flex-1 items-center gap-2 rounded-lg border border-iconic-soft-blue/70 bg-iconic-gray/60 px-3 py-1.5 text-sm text-iconic-graphite/45 transition-colors hover:border-iconic-primary/40 hover:bg-white lg:flex"
      >
        <Search className="h-4 w-4 shrink-0 text-iconic-graphite/40" aria-hidden="true" />
        <span className="truncate">Buscar en ICONIC OPS…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-iconic-soft-blue bg-white px-1.5 py-0.5 font-mono text-[10px] text-iconic-graphite/50 xl:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-iconic-ink/30 px-4 pt-[12vh] backdrop-blur-sm"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda global de ICONIC OPS"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-iconic-soft-blue bg-white shadow-iconic"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Campo de búsqueda */}
            <div className="flex items-center gap-3 border-b border-iconic-soft-blue/60 px-4">
              <Search className="h-5 w-5 shrink-0 text-iconic-graphite/40" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0); // los resultados cambian: vuelve al primero
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Buscar módulos y acciones…"
                aria-label="Buscar módulos y acciones"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-palette-list"
                aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex]!.id}` : undefined}
                className="w-full bg-transparent py-3.5 text-base text-iconic-ink outline-none placeholder:text-iconic-graphite/40"
              />
              <kbd className="hidden shrink-0 rounded border border-iconic-soft-blue bg-iconic-gray/60 px-1.5 py-0.5 font-mono text-[10px] text-iconic-graphite/50 sm:inline">
                Esc
              </kbd>
            </div>

            {/* Resultados */}
            <div
              id="command-palette-list"
              ref={listRef}
              role="listbox"
              aria-label="Resultados"
              className="max-h-[min(60vh,28rem)] overflow-y-auto py-2"
            >
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-iconic-graphite/55">
                  Sin resultados para “{query.trim()}”.
                </p>
              ) : (
                sections.map((section) => (
                  <div key={section.group} className="px-2 pb-1">
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-iconic-graphite/40">
                      {section.group}
                    </p>
                    <ul role="none" className="space-y-0.5">
                      {section.items.map((item) => {
                        const flatIndex = filtered.indexOf(item);
                        const active = flatIndex === activeIndex;
                        const Icon = ICONS[item.icon];
                        return (
                          <li key={item.id} role="none">
                            <button
                              type="button"
                              id={`cmd-${item.id}`}
                              role="option"
                              aria-selected={active}
                              data-active={active}
                              onMouseMove={() => setActiveIndex(flatIndex)}
                              onClick={() => go(item.href)}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                                active ? 'bg-iconic-soft-blue/30 text-iconic-ink' : 'text-iconic-graphite hover:bg-iconic-gray',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                                  active
                                    ? 'border-iconic-primary/30 bg-iconic-primary text-white'
                                    : 'border-iconic-soft-blue/60 bg-iconic-gray/60 text-iconic-primary',
                                )}
                                aria-hidden="true"
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                              {active && (
                                <CornerDownLeft className="h-4 w-4 shrink-0 text-iconic-graphite/40" aria-hidden="true" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>

            {/* Pie con ayudas de teclado */}
            <div className="flex items-center gap-4 border-t border-iconic-soft-blue/60 bg-iconic-gray/40 px-4 py-2 text-[11px] text-iconic-graphite/55">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-iconic-soft-blue bg-white px-1 font-mono">↑</kbd>
                <kbd className="rounded border border-iconic-soft-blue bg-white px-1 font-mono">↓</kbd>
                navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-iconic-soft-blue bg-white px-1 font-mono">↵</kbd>
                abrir
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-iconic-soft-blue bg-white px-1 font-mono">Esc</kbd>
                cerrar
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
