/**
 * notes-card.tsx — "Notas rápidas internas" del dashboard (V5.4.2c).
 *
 * Server Component CONECTADO (dejó de ser shell estático). Recibe las notas reales y
 * las server actions por PROP (así este módulo compartido NO depende de la ruta); los
 * subcomponentes interactivos (crear/archivar) son client AISLADOS (regla P0).
 *
 * Privacidad: el PAGE decide si renderiza este card — un viewer del bucket client-safe
 * NO lo ve (no se le pasan datos ni acciones). Ver `getDashboardQuickNotes` / `guard.ts`.
 * No edita `body` (archive-only). Estado vacío honesto (sin datos fake).
 */
import { StickyNote } from 'lucide-react';
import { SurfaceCard } from './surface-card';
import { formatDate } from '@/lib/utils/format';
import { QuickNoteCreateForm } from './quick-note-create-form';
import { QuickNoteArchiveButton } from './quick-note-archive-button';
import type { QuickNoteView, QuickNoteActionResult } from '@/server/quick-notes';

type QuickNoteAction = (
  prev: QuickNoteActionResult | null,
  formData: FormData,
) => Promise<QuickNoteActionResult>;

export function NotesCard({
  notes,
  canCreate,
  createAction,
  archiveAction,
  className,
}: {
  notes: QuickNoteView[];
  canCreate: boolean;
  createAction: QuickNoteAction;
  archiveAction: QuickNoteAction;
  className?: string;
}) {
  return (
    <SurfaceCard variant="metric" className={className}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
          <StickyNote className="h-4 w-4 text-iconic-primary/70" aria-hidden="true" />
          Notas rápidas internas
        </p>
        {notes.length > 0 && (
          <span className="text-[10px] text-content-muted">{notes.length} activas</span>
        )}
      </div>

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-2.5" role="list">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-iconic-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="break-words text-sm text-content">{note.body}</p>
                  <p className="mt-0.5 text-[10px] text-content-muted">{formatDate(note.createdAt)}</p>
                </div>
              </div>
              {canCreate && <QuickNoteArchiveButton noteId={note.id} action={archiveAction} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-content-muted">Sin notas internas activas</p>
      )}

      {canCreate && <QuickNoteCreateForm action={createAction} />}
    </SurfaceCard>
  );
}
