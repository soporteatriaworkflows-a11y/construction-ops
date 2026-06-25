/**
 * quote-context-from-path.ts — Resuelve el contexto de cotización activa a partir
 * del pathname (QUOTING_ASSISTED_COMPANION_PANEL_V1B). PURO, sin DOM, sin IO.
 *
 * Solo deriva contexto de rutas que YA contienen los tres ids (proyecto/alcance/
 * versión); en cualquier otra ruta devuelve null (el panel usará la última
 * cotización guardada o mostrará un CTA). NUNCA adivina.
 */
import type { QuoteProgressContext } from './quote-progress';

/** Contexto completo (los tres ids presentes). */
export type QuoteContext = Required<{
  [K in keyof QuoteProgressContext]: string;
}>;

// /quote/:projectId/:scopeId/:versionId  (sin segmentos extra)
const QUOTE_RE = /^\/quote\/([^/]+)\/([^/]+)\/([^/]+)\/?$/;
// /projects/:projectId/scopes/:scopeId/estimates/:versionId(/...subrutas)
const ESTIMATE_RE = /^\/projects\/([^/]+)\/scopes\/([^/]+)\/estimates\/([^/]+)(?:\/.*)?$/;

/** Reservados que NO son ids reales en la ruta de presupuesto. */
const ESTIMATE_RESERVED = new Set(['new']);

function clean(path: string): string {
  // Quita query/hash y normaliza barra final (preserva la raíz).
  const noHashQuery = path.split('#')[0]!.split('?')[0]!;
  return noHashQuery.length > 1 ? noHashQuery.replace(/\/+$/, '') : noHashQuery;
}

/**
 * Devuelve `{projectId, scopeId, versionId}` si el pathname pertenece al centro
 * de cotización o al detalle/subrutas de un presupuesto; `null` en cualquier otro
 * caso (incluida `/quote`, `/quote/new`, `/apu`, `/quantities`, etc.).
 */
export function quoteContextFromPath(pathname: string | null | undefined): QuoteContext | null {
  if (!pathname) return null;
  const path = clean(pathname);

  const q = QUOTE_RE.exec(path);
  if (q) {
    return { projectId: q[1]!, scopeId: q[2]!, versionId: q[3]! };
  }

  const e = ESTIMATE_RE.exec(path);
  if (e) {
    const versionId = e[3]!;
    // `/projects/:id/scopes/:sid/estimates/new` no es una versión existente.
    if (ESTIMATE_RESERVED.has(versionId)) return null;
    return { projectId: e[1]!, scopeId: e[2]!, versionId };
  }

  return null;
}
