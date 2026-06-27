/**
 * quote-companion.tsx — Asistente acompañante: ventana guiada con modos de
 * ubicación (UX_QUOTING_COMPANION_WORKSPACE_FOCUS_AND_DOCKING_V1). 'use client'.
 * Montado una vez en el layout del dashboard.
 *
 * Modos (placement):
 *  - 'floating' (default): ventana arrastrable que recuerda su posición.
 *  - 'corner': anclada en el área inferior izquierda del contenido (compacta).
 *  - 'side': lateral derecho; reserva espacio (padding del body) para no tapar
 *    el contenido (solo en lg).
 * Persistencia localStorage: SOLO ids de cotización, placement y posición x/y.
 * z-30 (debajo de modales z-50/z-[100]); oculto en mobile (< lg).
 */
'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Minus, Loader2, GripVertical, RotateCcw } from 'lucide-react';
import { quoteContextFromPath, type QuoteContext } from '@/lib/quote/quote-context-from-path';
import { quoteLocationFromPath } from '@/lib/quote/quote-location';
import { QuoteCompanionBody } from './quote-companion-body';
import { QuoteCompanionSelector, type SelectedQuote } from './quote-companion-selector';
import {
  getQuoteCompanionState,
  type QuoteCompanionPayload,
} from './quote-companion-actions';

const ACTIVE_KEY = 'quote-companion:active';
const PLACEMENT_KEY = 'quote-companion:placement';
const POS_KEY = 'quote-companion:pos';
const OPEN_EVENT = 'quote-companion:open';

const WIN_W = 390;
const MARGIN = 8;

type PanelState = 'closed' | 'open' | 'minimized';
type Placement = 'floating' | 'corner' | 'side';
interface Pos {
  x: number;
  y: number;
}

const PLACEMENT_LABELS: Record<Placement, string> = {
  floating: 'Flotante',
  corner: 'Esquina',
  side: 'Lateral',
};

function keyOf(c: QuoteContext | null): string {
  return c ? `${c.projectId}/${c.scopeId}/${c.versionId}` : '';
}

function readActiveQuote(): QuoteContext | null {
  try {
    const p = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? 'null') as Partial<QuoteContext> | null;
    return p && p.projectId && p.scopeId && p.versionId
      ? { projectId: p.projectId, scopeId: p.scopeId, versionId: p.versionId }
      : null;
  } catch {
    return null;
  }
}

function readPlacement(): Placement {
  try {
    const v = localStorage.getItem(PLACEMENT_KEY);
    return v === 'corner' || v === 'side' ? v : 'floating';
  } catch {
    return 'floating';
  }
}

function readPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as Partial<Pos> | null;
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

function clampPos(x: number, y: number): Pos {
  const maxX = Math.max(MARGIN, window.innerWidth - WIN_W - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - 80);
  return { x: Math.min(Math.max(MARGIN, x), maxX), y: Math.min(Math.max(MARGIN, y), maxY) };
}

/** Posición flotante por defecto: despegada de los bordes (no anclada). */
function defaultFloatingPos(): Pos {
  return clampPos(window.innerWidth - WIN_W - 24, 88);
}

export function QuoteCompanion() {
  const pathname = usePathname();
  const routeCtx = useMemo(() => quoteContextFromPath(pathname), [pathname]);
  const location = useMemo(() => quoteLocationFromPath(pathname), [pathname]);
  const routeKey = keyOf(routeCtx);

  const [state, setState] = useState<PanelState>('closed');
  const [placement, setPlacement] = useState<Placement>('floating');
  const [pos, setPos] = useState<Pos | null>(null);
  const [activeQuote, setActiveQuote] = useState<QuoteContext | null>(null);
  const [syncedRouteKey, setSyncedRouteKey] = useState('');

  // Sincronizar la cotización activa con la ruta (ajuste de estado en render).
  if (routeCtx && routeKey !== syncedRouteKey) {
    setSyncedRouteKey(routeKey);
    setActiveQuote(routeCtx);
  }

  const effectiveCtx = activeQuote;
  const ctxKey = keyOf(effectiveCtx);

  const [payload, setPayload] = useState<QuoteCompanionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState('');

  // Drag (solo en modo flotante)
  const winRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Persistencia (solo localStorage; sin setState).
  useEffect(() => {
    if (ctxKey) {
      try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(effectiveCtx));
      } catch {
        /* no disponible */
      }
    }
  }, [ctxKey, effectiveCtx]);

  useEffect(() => {
    try {
      localStorage.setItem(PLACEMENT_KEY, placement);
    } catch {
      /* no disponible */
    }
  }, [placement]);

  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, pos ? JSON.stringify(pos) : 'null');
    } catch {
      /* no disponible */
    }
  }, [pos]);

  // Reajustar la ventana flotante si queda fuera del viewport al redimensionar.
  useEffect(() => {
    function onResize(): void {
      setPos((prev) => (prev ? clampPos(prev.x, prev.y) : null));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Modo lateral: reservar espacio (padding del body) para NO tapar el contenido.
  // Solo en lg; se reajusta al redimensionar y se limpia al cerrar/cambiar modo.
  useEffect(() => {
    if (state !== 'open' || placement !== 'side') return;
    function apply(): void {
      document.body.style.paddingRight = window.matchMedia('(min-width: 1024px)').matches ? '20rem' : '';
    }
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      document.body.style.paddingRight = '';
    };
  }, [state, placement]);

  function openPanel(): void {
    if (!activeQuote && !routeCtx) {
      const stored = readActiveQuote();
      if (stored) setActiveQuote(stored);
    }
    // Por defecto FLOTANTE: posición explícita; restauramos el modo elegido.
    setPlacement(readPlacement());
    const storedPos = readPos();
    setPos(storedPos ? clampPos(storedPos.x, storedPos.y) : defaultFloatingPos());
    setState('open');
  }

  // Apertura externa vía CustomEvent.
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
    setSyncedRouteKey(keyOf(q));
  }

  function onHeaderPointerDown(e: ReactPointerEvent): void {
    if (placement !== 'floating' || e.button !== 0) return;
    // NO iniciar drag si el pointerdown nace en un control (botones).
    if ((e.target as HTMLElement).closest('button')) return;
    const el = winRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setDragging(true);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* no soportado */
    }
  }
  function onHeaderPointerMove(e: ReactPointerEvent): void {
    if (!dragging || !dragRef.current) return;
    setPos(clampPos(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy));
  }
  function onHeaderPointerUp(e: ReactPointerEvent): void {
    if (!dragging) return;
    setDragging(false);
    dragRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* no soportado */
    }
  }

  // V4.2.6: sin launcher flotante derecho (era redundante con el CTA del AppRail y
  // el trigger del topbar). El panel se abre por el evento `quote-companion:open`
  // (rail/topbar) → openPanel(); la lógica/eventos del companion no cambian.
  if (state !== 'open') {
    return null;
  }

  const isFloating = placement === 'floating';
  const asideClass =
    placement === 'side'
      ? 'fixed right-0 top-0 z-30 hidden h-screen w-80 flex-col border-l border-iconic-soft-blue bg-white shadow-iconic lg:flex'
      : placement === 'corner'
        ? 'fixed bottom-4 left-[15.5rem] z-30 hidden max-h-[60vh] w-[320px] flex-col rounded-2xl border border-iconic-soft-blue bg-white shadow-iconic lg:flex'
        : `fixed z-30 hidden max-h-[75vh] w-[390px] flex-col rounded-2xl border border-iconic-soft-blue bg-white shadow-iconic lg:flex ${pos ? '' : 'bottom-5 right-5'}`;
  const asideStyle = isFloating && pos ? { left: pos.x, top: pos.y } : undefined;

  return (
    <aside
      ref={winRef}
      role="complementary"
      aria-label="Asistente de cotización"
      className={asideClass}
      style={asideStyle}
    >
      <header
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        className={`flex items-center justify-between border-b border-gray-100 px-3 py-3 ${isFloating ? 'cursor-move select-none rounded-t-2xl' : ''}`}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-iconic-ink">
          {isFloating && <GripVertical className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />}
          <Sparkles className="h-4 w-4 shrink-0 text-iconic-primary" aria-hidden="true" />
          <span className="truncate">Asistente de cotización</span>
        </span>
        <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
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

      {/* Modos de ubicación (texto, no solo iconos) + restaurar posición */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-3 py-1.5">
        <div className="inline-flex rounded-md border border-gray-200" role="group" aria-label="Ubicación del asistente">
          {(Object.keys(PLACEMENT_LABELS) as Placement[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlacement(p)}
              aria-pressed={placement === p}
              className={`px-2 py-0.5 text-[10px] font-medium first:rounded-l-md last:rounded-r-md ${
                placement === p ? 'bg-iconic-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {PLACEMENT_LABELS[p]}
            </button>
          ))}
        </div>
        {isFloating ? (
          <button
            type="button"
            onClick={() => setPos(defaultFloatingPos())}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-iconic-primary hover:underline"
            title="Restaurar posición"
            aria-label="Restaurar posición"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Restaurar posición
          </button>
        ) : (
          <span className="text-[10px] text-gray-400">{placement === 'side' ? 'Fijado al costado' : 'Fijado en la esquina'}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!effectiveCtx ? (
          <div className="space-y-3">
            <p className="text-[12px] text-gray-600">
              Selecciona una cotización activa para que el asistente te acompañe en todo el proceso.
            </p>
            <QuoteCompanionSelector onSelect={onSelectQuote} />
          </div>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando…
          </p>
        ) : error ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{error}</p>
            <button type="button" onClick={() => setActiveQuote(null)} className="text-[12px] font-medium text-iconic-primary hover:underline">
              Elegir otra cotización
            </button>
          </div>
        ) : payload ? (
          <div className="space-y-3">
            <QuoteCompanionBody payload={payload} location={location} />
            <button type="button" onClick={() => setActiveQuote(null)} className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline">
              Cambiar cotización activa
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
