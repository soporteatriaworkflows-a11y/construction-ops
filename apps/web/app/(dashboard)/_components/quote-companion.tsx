/**
 * quote-companion.tsx — Asistente acompañante de cotización (companion panel)
 * (QUOTING_ASSISTED_COMPANION_PANEL_V1B). 'use client'. Montado UNA vez en el
 * layout del dashboard, persiste al navegar.
 *
 * - Detecta la cotización activa desde la ruta (`quoteContextFromPath`); si no
 *   hay, usa la última cotización guardada en localStorage; si tampoco, ofrece un
 *   CTA a /quote.
 * - Estados closed/open/minimized + pinned, persistidos en localStorage (solo
 *   estado del panel + última cotización; NUNCA datos derivados).
 * - z-30 (debajo de los modales z-50/z-[100]); oculto en mobile (< lg).
 * - Datos vía server action READ-ONLY `getQuoteCompanionState`.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Minus, Pin, PinOff, Loader2 } from 'lucide-react';
import { quoteContextFromPath } from '@/lib/quote/quote-context-from-path';
import { QuoteCompanionBody } from './quote-companion-body';
import {
  getQuoteCompanionState,
  type QuoteCompanionPayload,
} from './quote-companion-actions';

const PINNED_KEY = 'quote-companion:pinned';
const OPEN_EVENT = 'quote-companion:open';

type PanelState = 'closed' | 'open' | 'minimized';

export function QuoteCompanion() {
  const pathname = usePathname();
  const routeCtx = useMemo(() => quoteContextFromPath(pathname), [pathname]);

  const [state, setState] = useState<PanelState>('closed');
  const [pinned, setPinned] = useState(false);

  // Contexto activo SOLO desde la ruta (Phase 1). La "última cotización"
  // persistente queda para Phase 2; off-route se muestra un CTA.
  const activeCtx = routeCtx;
  const ctxKey = activeCtx
    ? `${activeCtx.projectId}/${activeCtx.scopeId}/${activeCtx.versionId}`
    : '';

  const [payload, setPayload] = useState<QuoteCompanionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState('');

  // Persistir SOLO la preferencia "fijar" (localStorage; sin setState).
  useEffect(() => {
    try {
      localStorage.setItem(PINNED_KEY, pinned ? '1' : '0');
    } catch {
      /* almacenamiento no disponible */
    }
  }, [pinned]);

  // Apertura externa (botón topbar / /quote home) vía CustomEvent.
  useEffect(() => {
    function onOpen(): void {
      setState('open');
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Cargar payload cuando el panel está abierto y hay contexto (setState solo
  // dentro del callback async → no es setState síncrono en el effect).
  useEffect(() => {
    if (state !== 'open' || !ctxKey || !activeCtx) return;
    let cancelled = false;
    getQuoteCompanionState(activeCtx.projectId, activeCtx.scopeId, activeCtx.versionId)
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

  // Launcher flotante (cerrado o minimizado).
  if (state !== 'open') {
    return (
      <button
        type="button"
        onClick={() => setState('open')}
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
        {!activeCtx ? (
          <div className="space-y-3 text-sm text-gray-600">
            <p>Selecciona una cotización para empezar.</p>
            <Link
              href="/quote"
              className="inline-flex items-center gap-1.5 rounded-lg bg-iconic-primary px-3 py-2 text-[13px] font-medium text-white hover:bg-iconic-primary/90"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ir al asistente
            </Link>
          </div>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando…
          </p>
        ) : error ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{error}</p>
            <Link href="/quote" className="text-[12px] font-medium text-iconic-primary hover:underline">Ir al asistente</Link>
          </div>
        ) : payload ? (
          <QuoteCompanionBody payload={payload} />
        ) : null}
      </div>
    </aside>
  );
}
