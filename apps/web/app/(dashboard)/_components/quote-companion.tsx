/**
 * quote-companion.tsx — Asistente acompañante IN-PLACE de cotización
 * (HOTFIX_QUOTING_COMPANION_TRUE_IN_PLACE_GUIDE_V1). 'use client'. Montado UNA
 * vez en el layout del dashboard; acompaña al usuario por todo el shell sin
 * obligar a ir a /quote.
 *
 * - Cotización activa: de la ruta (`quoteContextFromPath`) si la hay; si no, la
 *   última guardada en localStorage; si tampoco, **selector embebido** (no navega).
 * - Persistencia localStorage: SOLO ids de la cotización activa + preferencia
 *   `pinned`. NUNCA datos financieros/derivados.
 * - z-30 (debajo de modales z-50/z-[100]); oculto en mobile (< lg).
 * - Datos vía server action READ-ONLY `getQuoteCompanionState`.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Minus, Pin, PinOff, Loader2 } from 'lucide-react';
import { quoteContextFromPath, type QuoteContext } from '@/lib/quote/quote-context-from-path';
import { QuoteCompanionBody } from './quote-companion-body';
import { QuoteCompanionSelector, type SelectedQuote } from './quote-companion-selector';
import {
  getQuoteCompanionState,
  type QuoteCompanionPayload,
} from './quote-companion-actions';

const ACTIVE_KEY = 'quote-companion:active';
const PINNED_KEY = 'quote-companion:pinned';
const OPEN_EVENT = 'quote-companion:open';

type PanelState = 'closed' | 'open' | 'minimized';

function keyOf(c: QuoteContext | null): string {
  return c ? `${c.projectId}/${c.scopeId}/${c.versionId}` : '';
}

function readActiveQuote(): QuoteContext | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<QuoteContext>;
    return p.projectId && p.scopeId && p.versionId
      ? { projectId: p.projectId, scopeId: p.scopeId, versionId: p.versionId }
      : null;
  } catch {
    return null;
  }
}

export function QuoteCompanion() {
  const pathname = usePathname();
  const routeCtx = useMemo(() => quoteContextFromPath(pathname), [pathname]);
  const routeKey = keyOf(routeCtx);

  const [state, setState] = useState<PanelState>('closed');
  const [pinned, setPinned] = useState(false);
  const [activeQuote, setActiveQuote] = useState<QuoteContext | null>(null);
  const [syncedRouteKey, setSyncedRouteKey] = useState('');

  // Sincronizar la cotización activa con la ruta (patrón React de ajuste de
  // estado cuando cambia una entrada — durante el render, no en un effect).
  if (routeCtx && routeKey !== syncedRouteKey) {
    setSyncedRouteKey(routeKey);
    setActiveQuote(routeCtx);
  }

  const effectiveCtx = activeQuote;
  const ctxKey = keyOf(effectiveCtx);

  const [payload, setPayload] = useState<QuoteCompanionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState('');

  // Persistir cotización activa (solo localStorage; sin setState).
  useEffect(() => {
    if (!ctxKey) return;
    try {
      localStorage.setItem(ACTIVE_KEY, ctxKey ? JSON.stringify(effectiveCtx) : '');
    } catch {
      /* almacenamiento no disponible */
    }
  }, [ctxKey, effectiveCtx]);

  // Persistir preferencia "fijar".
  useEffect(() => {
    try {
      localStorage.setItem(PINNED_KEY, pinned ? '1' : '0');
    } catch {
      /* no disponible */
    }
  }, [pinned]);

  function openPanel(): void {
    // Restaurar última cotización activa si no hay ninguna en memoria ni en ruta.
    if (!activeQuote && !routeCtx) {
      const stored = readActiveQuote();
      if (stored) setActiveQuote(stored);
    }
    setState('open');
  }

  // Apertura externa (botón topbar / /quote home) vía CustomEvent.
  useEffect(() => {
    function onOpen(): void {
      openPanel();
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar payload (setState solo dentro del callback async).
  useEffect(() => {
    if (state !== 'open' || !ctxKey || !effectiveCtx) return;
    let cancelled = false;
    getQuoteCompanionState(effectiveCtx.projectId, effectiveCtx.scopeId, effectiveCtx.versionId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setPayload(r.payload);
          setError(null);
        } else {
          setPayload(null);
          setError(r.error);
        }
        setLoadedKey(ctxKey);
      })
      .catch(() => {
        if (cancelled) return;
        setPayload(null);
        setError('No se pudo cargar el asistente.');
        setLoadedKey(ctxKey);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ctxKey]);

  const loading = state === 'open' && !!ctxKey && loadedKey !== ctxKey;

  function onSelectQuote(q: SelectedQuote): void {
    setActiveQuote(q);
    setSyncedRouteKey(keyOf(q)); // evita que un render posterior lo pise
  }

  // Launcher flotante (cerrado o minimizado).
  if (state !== 'open') {
    return (
      <button
        type="button"
        onClick={openPanel}
        aria-label="Abrir asistente de cotización"
        className="fixed bottom-5 right-5 z-40 hidden items-center gap-2 rounded-full bg-iconic-primary px-4 py-3 text-sm font-medium text-white shadow-iconic transition-transform hover:scale-[1.03] lg:flex"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Asistente
      </button>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label="Asistente de cotización"
      className="fixed right-0 top-0 z-30 hidden h-screen w-80 flex-col border-l border-iconic-soft-blue bg-white shadow-iconic lg:flex"
    >
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-iconic-ink">
          <Sparkles className="h-4 w-4 text-iconic-primary" aria-hidden="true" />
          Asistente de cotización
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            aria-label={pinned ? 'Dejar de fijar' : 'Fijar asistente'}
            aria-pressed={pinned}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            {pinned ? <Pin className="h-4 w-4" aria-hidden="true" /> : <PinOff className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => setState('minimized')}
            aria-label="Minimizar asistente"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setState('closed')}
            aria-label="Cerrar asistente"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!effectiveCtx ? (
          <QuoteCompanionSelector onSelect={onSelectQuote} />
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando…
          </p>
        ) : error ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{error}</p>
            <button
              type="button"
              onClick={() => setActiveQuote(null)}
              className="text-[12px] font-medium text-iconic-primary hover:underline"
            >
              Elegir otra cotización
            </button>
          </div>
        ) : payload ? (
          <div className="space-y-3">
            <QuoteCompanionBody payload={payload} />
            <button
              type="button"
              onClick={() => setActiveQuote(null)}
              className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline"
            >
              Cambiar cotización activa
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
