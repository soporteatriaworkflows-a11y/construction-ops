/**
 * quote-companion-trigger.tsx — Botón "Asistente" que abre el companion panel
 * (QUOTING_ASSISTED_COMPANION_PANEL_V1B). 'use client'. Canal de apertura por
 * CustomEvent en `window` (el panel, montado en el layout, lo escucha). No
 * mantiene estado propio.
 */
'use client';

import { Sparkles } from 'lucide-react';

const OPEN_EVENT = 'quote-companion:open';

function openCompanion(): void {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  } catch {
    /* sin window (SSR): no-op */
  }
}

/** Variante compacta para la topbar (icono + label corto, oculta < lg). */
export function QuoteCompanionTopbarTrigger() {
  return (
    <button
      type="button"
      onClick={openCompanion}
      aria-label="Abrir asistente de cotización"
      className="hidden items-center gap-1.5 rounded-md border border-iconic-soft-blue/70 px-2.5 py-1.5 text-xs font-medium text-iconic-primary transition-colors hover:bg-brand-50/60 lg:inline-flex"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      Asistente
    </button>
  );
}

/** Variante destacada para la home /quote. */
export function QuoteCompanionOpenButton() {
  return (
    <button
      type="button"
      onClick={openCompanion}
      className="inline-flex items-center gap-1.5 rounded-lg border border-iconic-soft-blue px-3 py-2 text-sm font-medium text-iconic-primary transition-colors hover:bg-brand-50/60"
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      Abrir asistente acompañante
    </button>
  );
}
