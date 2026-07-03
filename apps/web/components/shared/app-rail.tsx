/**
 * app-rail.tsx — Rail de navegación flotante (ICONIC_OPS_UIX_THEME_AND_NAV_REFINEMENT_V4_2_2).
 *
 * Client Component. Rail navy "flotante pero fijo" (rounded, sombra) al costado
 * izquierdo: compacto (solo íconos) y se EXPANDE al hover; opción de PIN para
 * dejarlo abierto (persiste en localStorage). Reserva ancho vía un spacer en flujo;
 * expandido por hover OVERLAYea (no empuja). NO cambia rutas ni lógica de navegación.
 *
 * Pie del rail: CTA del **Asistente** (dispara el evento del companion). El bloque
 * "Grupo ICONIC / Modo demostración" se reemplaza por un indicador de modo MUY sutil.
 */
'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Sparkles, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SidebarNav } from './sidebar-nav';
import { canUseQuoteAssistant } from '@/lib/access/surface-visibility';

const PIN_KEY = 'iconic-rail-pinned';
const OPEN_COMPANION_EVENT = 'quote-companion:open';

function readPinned(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppRail({
  canManageAccess,
  profileRole = null,
  productName,
  workspaceName,
  logoSymbol,
  modeLabel,
  isFixture,
}: {
  canManageAccess: boolean;
  /** `profiles.role` server-side; filtra módulos visibles del sidebar (V5.6.2). */
  profileRole?: string | null;
  productName: string;
  workspaceName: string;
  logoSymbol: string;
  modeLabel: string;
  isFixture: boolean;
}) {
  const [pinned, setPinned] = useState<boolean>(readPinned);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;
  const quoteAssistantAvailable = canUseQuoteAssistant(profileRole);

  function togglePin() {
    setPinned((p) => {
      const next = !p;
      try {
        window.localStorage.setItem(PIN_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }

  function openAssistant() {
    window.dispatchEvent(new CustomEvent(OPEN_COMPANION_EVENT));
  }

  const logo = (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iconic-white ring-1 ring-iconic-soft-blue/60">
      <Image src={logoSymbol} alt="" width={36} height={36} className="object-contain p-1" aria-hidden="true" />
    </span>
  );

  return (
    <>
      {/* Spacer en flujo: reserva ancho. Pin empuja contenido; hover OVERLAYea. */}
      <div aria-hidden="true" className="shrink-0 transition-all duration-200" style={{ width: pinned ? '15rem' : '4.75rem' }} />

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Navegación principal"
        className="glass-navy fixed inset-y-3 left-3 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/10 ring-1 ring-inset ring-white/5 transition-[width] duration-200 ease-out"
        style={{
          // V4.2.6: graphite/dark-gray premium (no navy saturado). Acentos azules vivos
          // viven en item activo / hover / CTA Asistente / indicadores.
          width: expanded ? '14.5rem' : '4rem',
          background: 'linear-gradient(180deg, rgba(32,36,44,0.96) 0%, rgba(28,32,40,0.96) 55%, rgba(24,28,35,0.96) 100%)',
          boxShadow: '0 24px 60px -24px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Cabecera: marca + pin */}
        <div className="flex h-14 items-center gap-2.5 px-3">
          {logo}
          {expanded && (
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-white">{productName}</span>
              <span className="truncate text-[11px] font-medium text-iconic-soft-blue">{workspaceName}</span>
            </span>
          )}
          {expanded && (
            <button
              type="button"
              onClick={togglePin}
              aria-pressed={pinned}
              title={pinned ? 'Soltar barra' : 'Fijar barra abierta'}
              className="rounded-lg p-1.5 text-iconic-soft-blue/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-cyan"
            >
              {pinned ? <PanelLeftClose className="h-4 w-4" aria-hidden="true" /> : <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
        </div>

        <div className="h-px bg-white/10" aria-hidden="true" />

        {/* Navegación (íconos siempre; etiquetas al expandir) */}
        <SidebarNav canManageAccess={canManageAccess} profileRole={profileRole} expanded={expanded} />

        {/* Pie: CTA Asistente + indicador de modo sutil */}
        <div className="mt-auto space-y-2 p-3">
          {quoteAssistantAvailable && (
            <button
              type="button"
              onClick={openAssistant}
              title="Abrir asistente de cotizacion"
              className={`flex w-full items-center gap-2.5 rounded-xl bg-iconic-primary/90 py-2 text-sm font-medium text-white ring-1 ring-inset ring-iconic-cyan/30 transition-all duration-150 hover:bg-iconic-primary hover:shadow-[0_8px_24px_-8px_rgba(0,93,214,0.7)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-cyan ${expanded ? 'px-2.5' : 'justify-center px-0'}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden="true">
                <Sparkles className="h-4 w-4" />
              </span>
              {expanded && <span className="truncate">Asistente</span>}
            </button>
          )}

          {/* Modo de datos — MUY sutil (reemplaza el bloque "Grupo ICONIC / demo"). */}
          <div className={`flex items-center gap-2 ${expanded ? 'px-1.5' : 'justify-center'}`}>
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${isFixture ? 'bg-amber-400' : 'bg-iconic-cyan'}`}
              aria-hidden="true"
            />
            {expanded && <span className="truncate text-[10px] text-iconic-soft-blue/50">{modeLabel}</span>}
          </div>
        </div>
      </aside>
    </>
  );
}
