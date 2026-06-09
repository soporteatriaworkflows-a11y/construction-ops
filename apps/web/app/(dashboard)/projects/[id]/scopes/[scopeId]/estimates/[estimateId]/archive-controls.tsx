/**
 * archive-controls.tsx — Botón Archivar/Restaurar para un nodo BOQ (4E.2B). Client.
 *
 * Confirma antes de archivar; restaurar no requiere confirmación. Llama a la
 * server action y refresca la vista. Errores sanitizados inline. Si la versión no
 * es editable (emitida) o el modo no permite escritura, no se renderiza.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Archive, ArchiveRestore } from 'lucide-react';
import {
  archiveChapterAction,
  restoreChapterAction,
  archiveItemAction,
  restoreItemAction,
  type ArchiveActionResult,
} from './archive-actions';

interface ArchiveControlsProps {
  kind: 'chapter' | 'item';
  estimateId: string;
  targetId: string;
  archived: boolean;
  canWrite: boolean;
}

export function ArchiveControls({ kind, estimateId, targetId, archived, canWrite }: ArchiveControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) return null;

  function act(restore: boolean) {
    if (pending) return;
    if (!restore) {
      const label = kind === 'chapter' ? 'este capítulo (y todos sus ítems)' : 'este ítem';
      if (!window.confirm(`¿Archivar ${label}? No se elimina; podrás restaurarlo desde "Mostrar archivados".`)) return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      fd.set('targetId', targetId);
      let res: ArchiveActionResult;
      if (kind === 'chapter') {
        res = restore ? await restoreChapterAction(fd) : await archiveChapterAction(fd);
      } else {
        res = restore ? await restoreItemAction(fd) : await archiveItemAction(fd);
      }
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => act(archived)}
        disabled={pending}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-600 hover:underline disabled:opacity-50"
        title={archived ? 'Restaurar' : 'Archivar'}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : archived ? (
          <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {archived ? 'Restaurar' : 'Archivar'}
      </button>
      {error && <span className="text-[10px] text-red-600" role="alert">{error}</span>}
    </span>
  );
}
