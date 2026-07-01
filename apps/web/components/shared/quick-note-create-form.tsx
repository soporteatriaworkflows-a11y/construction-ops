/**
 * quick-note-create-form.tsx — Form de creación de nota rápida (cliente, V5.4.2c).
 *
 * 'use client'. Componente interactivo AISLADO (regla P0): el Server Component
 * `NotesCard` no importa hooks de cliente; recibe la server action por prop y este
 * form la ejecuta con `useActionState`. Botón deshabilitado mientras guarda (evita
 * doble submit). Errores CURADOS (nunca tecnicismos de Postgres).
 */
'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Importar desde los módulos PUROS (no el barrel): el barrel arrastra el db-repository
// (createClient → next/headers), server-only, que no debe entrar al bundle cliente.
import { QUICK_NOTE_BODY_MAX } from '@/server/quick-notes/types';
import type { QuickNoteActionResult } from '@/server/quick-notes/action-result';

type QuickNoteAction = (
  prev: QuickNoteActionResult | null,
  formData: FormData,
) => Promise<QuickNoteActionResult>;

export function QuickNoteCreateForm({ action }: { action: QuickNoteAction }) {
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Al crear con éxito, limpia el textarea (la lista se refresca vía revalidatePath).
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  const error = state?.fieldErrors?.body ?? state?.error;

  return (
    <form ref={formRef} action={formAction} className="mt-3 border-t border-line pt-3">
      <label htmlFor="quick-note-body" className="sr-only">
        Nueva nota interna
      </label>
      <textarea
        id="quick-note-body"
        name="body"
        rows={2}
        maxLength={QUICK_NOTE_BODY_MAX}
        required
        disabled={isPending}
        placeholder="Escribe una nota interna…"
        className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted/70 focus:border-iconic-primary focus:outline-none focus:ring-1 focus:ring-iconic-primary/30 disabled:opacity-60"
      />
      {error && (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Agregar nota
        </Button>
      </div>
    </form>
  );
}
