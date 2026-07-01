/**
 * db-repository.ts — Repositorio DB de Quick Notes (V5.4.2b).
 *
 * Cliente Supabase SSR ligado a la sesión ⇒ **RLS es la barrera real** (org-scoped,
 * rol-gated, archive-only). El app-layer añade guard por ViewerRole (ver `guard.ts`)
 * que corre ANTES de tocar la DB. Espejo del patrón de `pricing/monitor/db-repository`.
 *
 * Invariantes:
 *  - `listQuickNotes`: solo status='active', org del viewer, `created_at DESC`, límite.
 *  - `createQuickNote`: `organization_id`/`created_by` server-side (del viewer).
 *  - `archiveQuickNote`: **solo** muta status/archived_at/archived_by. NUNCA `body`
 *    (no existe operación de edición de body — archive-only, alineado con el trigger DB).
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  QuickNoteInsufficientRoleError,
  QuickNoteNotFoundError,
  QuickNoteValidationError,
} from './errors';
import { parseQuickNoteBody } from './validation';
import { canAttemptArchiveQuickNote, canCreateQuickNotes, canViewQuickNotes } from './guard';
import { QUICK_NOTES_DASHBOARD_LIMIT } from './types';
import type {
  AuthenticatedViewer,
  CreateQuickNoteInput,
  ListQuickNotesOptions,
  QuickNoteView,
  QuickNotesRepository,
  Uuid,
} from './types';

const NOTE_COLUMNS = 'id, body, status, project_id, estimate_id, created_by, created_at';

interface NoteRow {
  id: string;
  body: string;
  status: string;
  project_id: string | null;
  estimate_id: string | null;
  created_by: string;
  created_at: string;
}

function toView(row: NoteRow): QuickNoteView {
  return {
    id: row.id,
    body: row.body,
    status: row.status === 'archived' ? 'archived' : 'active',
    projectId: row.project_id,
    estimateId: row.estimate_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** RLS niega INSERT/UPDATE con 42501 ("new row violates row-level security policy"). */
const RLS_DENIED = '42501';

export class DbQuickNotesRepository implements QuickNotesRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;
  private readonly now: () => Date;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient, now: () => Date = () => new Date()) {
    this.clientFactory = clientFactory;
    this.now = now;
  }

  async listQuickNotes(viewer: AuthenticatedViewer, options: ListQuickNotesOptions = {}): Promise<QuickNoteView[]> {
    // App guard (2ª defensa): el bucket client-safe no ve notas → sin tocar la DB.
    if (!canViewQuickNotes(viewer.role)) return [];

    const limit = options.limit ?? QUICK_NOTES_DASHBOARD_LIMIT;
    const supabase = await this.clientFactory();
    let query = supabase
      .from('quick_notes')
      .select(NOTE_COLUMNS)
      .eq('organization_id', viewer.organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (options.projectId != null) query = query.eq('project_id', options.projectId);
    if (options.estimateId != null) query = query.eq('estimate_id', options.estimateId);

    const { data, error } = await query;
    if (error) throw new Error(`quick_notes_list_failed: ${error.code ?? 'unknown'}`);
    return ((data ?? []) as unknown as NoteRow[]).map(toView);
  }

  async createQuickNote(viewer: AuthenticatedViewer, input: CreateQuickNoteInput): Promise<QuickNoteView> {
    // Guard de rol ANTES de tocar la DB.
    if (!canCreateQuickNotes(viewer.role)) {
      throw new QuickNoteInsufficientRoleError('create', viewer.role);
    }
    const { value: body } = parseQuickNoteBody(input.body); // lanza QuickNoteValidationError

    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('quick_notes')
      .insert({
        organization_id: viewer.organizationId,
        created_by: viewer.profileId,
        body,
        project_id: input.projectId ?? null,
        estimate_id: input.estimateId ?? null,
      })
      .select(NOTE_COLUMNS)
      .single();

    if (error) {
      // RLS/CHECK denegó (rol no autorizado, cross-org, project/estimate inconsistente…).
      if (error.code === RLS_DENIED) throw new QuickNoteInsufficientRoleError('create', viewer.role);
      if (error.code === '23514') throw new QuickNoteValidationError([{ field: 'body', message: 'La nota no cumple las reglas.' }]);
      throw new Error(`quick_note_create_failed: ${error.code ?? 'unknown'}`);
    }
    return toView(data as unknown as NoteRow);
  }

  async archiveQuickNote(viewer: AuthenticatedViewer, noteId: Uuid): Promise<QuickNoteView> {
    if (!canAttemptArchiveQuickNote(viewer.role)) {
      throw new QuickNoteInsufficientRoleError('archive', viewer.role);
    }

    const supabase = await this.clientFactory();
    // Archive-only: SOLO status/archived_at/archived_by. Nunca body ni identity/scope.
    // RLS (USING creador o admin/gerencia) + trigger archive-only son la barrera real.
    const { data, error } = await supabase
      .from('quick_notes')
      .update({
        status: 'archived',
        archived_at: this.now().toISOString(),
        archived_by: viewer.profileId,
      })
      .eq('id', noteId)
      .eq('organization_id', viewer.organizationId)
      .eq('status', 'active')
      .select(NOTE_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === RLS_DENIED) throw new QuickNoteInsufficientRoleError('archive', viewer.role);
      throw new Error(`quick_note_archive_failed: ${error.code ?? 'unknown'}`);
    }
    // 0 filas = no existe, ya archivada, o RLS negó (nota ajena sin ser management).
    if (!data) throw new QuickNoteNotFoundError(noteId);
    return toView(data as unknown as NoteRow);
  }
}
