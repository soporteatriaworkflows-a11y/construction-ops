/**
 * open-takeoff.ts — Navegación GARANTIZADA al workspace de un takeoff manual.
 *
 * `router.push` puede quedar sin efecto visible en dev (compilación bajo
 * demanda de la ruta sin feedback) o si el router del cliente quedó en mal
 * estado (pestaña con una versión anterior). Este helper hace el push y, si
 * tras un margen la URL no cambió, fuerza `window.location.assign` (carga
 * completa): el destino se abre inequívocamente. El estado ya está escrito en
 * localStorage antes de navegar, así que la carga completa no pierde nada.
 *
 * I/O inyectable para tests puros en Node (sin DOM).
 */

export function manualTakeoffHref(id: string): string {
  return `/steel/takeoffs/${id}`;
}

export interface OpenManualTakeoffIo {
  schedule?: (fn: () => void, ms: number) => void;
  getPathname?: () => string;
  assign?: (href: string) => void;
  fallbackDelayMs?: number;
}

export function openManualTakeoff(
  push: (href: string) => void,
  id: string,
  io: OpenManualTakeoffIo = {},
): string {
  const href = manualTakeoffHref(id);
  const schedule =
    io.schedule ??
    ((fn: () => void, ms: number) => {
      if (typeof window !== 'undefined') window.setTimeout(fn, ms);
    });
  const getPathname =
    io.getPathname ?? (() => (typeof window === 'undefined' ? '' : window.location.pathname));
  const assign =
    io.assign ??
    ((target: string) => {
      if (typeof window !== 'undefined') window.location.assign(target);
    });

  push(href);
  schedule(() => {
    if (getPathname() !== href) assign(href);
  }, io.fallbackDelayMs ?? 2500);
  return href;
}
