/**
 * types.ts — Tipos del módulo Quick Notes (V5.4.2b).
 *
 * Notas rápidas internas del dashboard. La tabla `quick_notes` + RLS ya existen y
 * están verificadas en Cloud (V5.4.2a, harness RLS 31/31). Esta capa consume esa
 * tabla: repository + server actions + guard de privacidad de app.
 *
 * Reglas:
 *  - organization_id / created_by SIEMPRE server-side (del viewer). Nunca del cliente.
 *  - RLS es la barrera REAL (org-scoped, rol-gated, archive-only). El app-layer añade
 *    una segunda defensa (guard por ViewerRole) — ver `guard.ts`.
 */
import type { Uuid, IsoDateTime } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';

export type { Uuid, IsoDateTime, AuthenticatedViewer };

/** Máximo de notas activas mostradas en el dashboard (decisión de producto V5.4.2 #10). */
export const QUICK_NOTES_DASHBOARD_LIMIT = 5;

/** Longitud de `body` (espejo del CHECK `quick_notes_body_len` 1..1000). */
export const QUICK_NOTE_BODY_MIN = 1;
export const QUICK_NOTE_BODY_MAX = 1000;

export type QuickNoteStatus = 'active' | 'archived';

/** Vista de una nota tal como la consume la UI. Sin campos sensibles adicionales. */
export interface QuickNoteView {
  id: Uuid;
  body: string;
  status: QuickNoteStatus;
  projectId: Uuid | null;
  estimateId: Uuid | null;
  createdBy: Uuid;
  createdAt: IsoDateTime;
}

/** Input de creación. `projectId`/`estimateId` opcionales (forward-compat, nullable). */
export interface CreateQuickNoteInput {
  body: string;
  projectId?: Uuid | null;
  estimateId?: Uuid | null;
}

/** Opciones de listado del dashboard. */
export interface ListQuickNotesOptions {
  projectId?: Uuid | null;
  estimateId?: Uuid | null;
  limit?: number;
}

/**
 * Puerto del repositorio de notas. Dos implementaciones: `db` (Supabase SSR,
 * RLS-bound) y `fixture` (demo, solo lectura). El MVP NO expone edición de `body`
 * ni borrado físico: solo listar (activas), crear y archivar.
 */
export interface QuickNotesRepository {
  readonly source: 'db' | 'fixture';
  /** Notas ACTIVAS de la org del viewer, más recientes primero (máx `limit`). */
  listQuickNotes(viewer: AuthenticatedViewer, options?: ListQuickNotesOptions): Promise<QuickNoteView[]>;
  /** Crea una nota (created_by = viewer). Roles autorizados; `consulta`/`client` no. */
  createQuickNote(viewer: AuthenticatedViewer, input: CreateQuickNoteInput): Promise<QuickNoteView>;
  /** Archiva una nota (active → archived). Creador o management (RLS lo exige). */
  archiveQuickNote(viewer: AuthenticatedViewer, noteId: Uuid): Promise<QuickNoteView>;
}
