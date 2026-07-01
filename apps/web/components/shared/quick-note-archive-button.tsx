/**
 * quick-note-archive-button.tsx — Botón de archivar nota (cliente, V5.4.2c).
 *
 * 'use client'. Componente interactivo AISLADO. Ejecuta la server action de archivar
 * (recibida por prop) con `useActionState`. Botón deshabilitado mientras archiva
 * (evita doble submit). Error CURADO (la regla fina creador|admin/gerencia la impone
 * RLS; un intento no autorizado devuelve un mensaje controlado, sin tecnicismos).
 */
'use client';

import { useActionState } from 'react';
import { Archive, Loader2 } from 'lucide-react';
// Módulo PURO (no el barrel, que arrastra server-only vía db-repository).
import type { QuickNoteActionResult } from '@/server/quick-notes/action-result';

type QuickNoteAction = (
  prev: QuickNoteActionResult | null,
  formData: FormData,
) => Promise<QuickNoteActionResult>;

export function QuickNoteArchiveButton({
  noteId,
  action,
}: {
  noteId: string;
  action: QuickNoteAction;
}) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end">
      <input type="hidden" name="noteId" value={noteId} />
      <button
        type="submit"
        disabled={isPending}
        title="Archivar nota"
        aria-label="Archivar nota"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-content-muted/60 transition-colors hover:bg-surface-muted hover:text-content disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      {state?.error && (
        <span className="mt-1 max-w-[9rem] text-right text-[10px] text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
