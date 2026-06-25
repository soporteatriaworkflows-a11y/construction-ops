/**
 * quote-location.ts — "Estás aquí": traduce la ruta actual a una ubicación
 * legible dentro del flujo de cotización (UX_QUOTING_COMPANION_FLOATING_GUIDED_
 * WINDOW_V1). PURO, sin DOM, sin IO. Texto explícito (no depende de color).
 */
import type { QuoteStepId, QuoteStepStatus } from './quote-progress';

export type QuoteLocationId =
  | 'dashboard'
  | 'quote-center'
  | 'budget'
  | 'apu'
  | 'quantities'
  | 'pricing'
  | 'other';

export interface QuoteLocation {
  id: QuoteLocationId;
  /** Etiqueta corta para "Estás aquí: …". */
  label: string;
  /** Paso del flujo (1–8) representado por esta ubicación, si aplica. */
  stepId?: QuoteStepId;
  stepIndex?: number;
}

/** Etiqueta textual del estado de un paso (NO solo color). */
export const STEP_STATUS_TEXT: Record<QuoteStepStatus, string> = {
  done: 'Listo',
  attention: 'Revisar',
  pending: 'Pendiente',
  locked: 'Bloqueado',
};

function clean(path: string): string {
  const p = (path.split('#')[0]!.split('?')[0]!) || '/';
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/**
 * Deriva la ubicación actual del usuario dentro del flujo de cotización.
 * `other` cuando no corresponde a ninguna sección conocida.
 */
export function quoteLocationFromPath(pathname: string | null | undefined): QuoteLocation {
  const path = clean(pathname ?? '');

  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return { id: 'dashboard', label: 'Inicio / Dashboard' };
  }
  if (/^\/quote\/[^/]+\/[^/]+\/[^/]+$/.test(path)) {
    return { id: 'quote-center', label: 'Vista asistida' };
  }
  if (/^\/projects\/[^/]+\/scopes\/[^/]+\/estimates\/[^/]+/.test(path)) {
    return { id: 'budget', label: 'Presupuesto / Capítulos', stepId: 'chapters', stepIndex: 3 };
  }
  if (path === '/apu' || path.startsWith('/apu/') || path.startsWith('/apu')) {
    return { id: 'apu', label: 'Asociar APU', stepId: 'apu', stepIndex: 4 };
  }
  if (path === '/quantities' || path.startsWith('/quantities/')) {
    return { id: 'quantities', label: 'Cantidades', stepId: 'quantities', stepIndex: 5 };
  }
  if (path.startsWith('/catalog/prices')) {
    return { id: 'pricing', label: 'Precios', stepId: 'pricing', stepIndex: 6 };
  }
  return { id: 'other', label: 'Sin contexto claro' };
}
