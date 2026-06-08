/**
 * chapter-form.tsx — Formulario de creación/edición de capítulo (4E.2A). Client.
 *
 * Propiedad: agent-frontend-boq. El navegador solo envía code/name; el resto se
 * deriva server-side. Loading + anti doble-submit + errores sanitizados + banner
 * de éxito + navegación coherente. Read-only si la versión está bloqueada o el
 * modo no permite escritura (fixture).
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/form-error';
import { Badge } from '@/components/ui/badge';
import { createChapterAction, updateChapterAction, type ChapterActionResult } from './chapter-actions';

interface ChapterFormProps {
  mode: 'create' | 'edit';
  estimateId: string;
  estimateHref: string;
  canWrite: boolean;
  editable: boolean;
  initial?: { chapterId: string; code: string; name: string };
  origin?: { sourceCode: string | null; sourceRow: number | null; isManual: boolean };
}

export function ChapterForm({ mode, estimateId, estimateHref, canWrite, editable, initial, origin }: ChapterFormProps) {
  const router = useRouter();
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const disabled = !canWrite || !editable;

  function save() {
    if (disabled || pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      if (mode === 'edit' && initial) fd.set('chapterId', initial.chapterId);
      fd.set('code', code);
      fd.set('name', name);
      const res: ChapterActionResult =
        mode === 'create' ? await createChapterAction(fd) : await updateChapterAction(fd);
      if (res.ok) {
        setSaved(true);
        router.push(`${estimateHref}?saved=1`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        setError(res.error ?? null);
      }
    });
  }

  return (
    <div className="max-w-xl rounded-lg border border-gray-200 bg-white p-4">
      {!canWrite && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Modo demostración (solo lectura). La edición del presupuesto requiere el modo de datos reales.
        </p>
      )}
      {canWrite && !editable && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Esta versión no admite cambios (versión emitida). El capítulo es de solo lectura.
        </p>
      )}

      {mode === 'edit' && origin && (
        <p className="mb-3 text-xs text-gray-500">
          {origin.isManual ? (
            <Badge variant="secondary">Capítulo creado manualmente</Badge>
          ) : (
            <Badge variant="warning" title={`Código original: ${origin.sourceCode ?? '—'}${origin.sourceRow ? ` (fila ${origin.sourceRow})` : ''}`}>
              Capítulo importado{origin.sourceCode ? ` · origen ${origin.sourceCode}` : ''}
            </Badge>
          )}
        </p>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            name="code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setSaved(false); }}
            disabled={disabled || pending}
            maxLength={60}
            placeholder="p. ej. 11"
            aria-invalid={!!fieldErrors.code}
          />
          {fieldErrors.code && <FormError id="err-code" message={fieldErrors.code} />}
        </div>

        <div className="space-y-1">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            disabled={disabled || pending}
            maxLength={200}
            placeholder="p. ej. Preliminares"
            aria-invalid={!!fieldErrors.name}
          />
          {fieldErrors.name && <FormError id="err-name" message={fieldErrors.name} />}
        </div>
      </div>

      {error && <div className="mt-3"><FormError id="chapter-error" message={error} /></div>}
      {saved && !pending && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Capítulo guardado.
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button type="button" onClick={save} disabled={disabled || pending} size="sm">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Guardar capítulo
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={estimateHref}>Cancelar</Link>
        </Button>
      </div>
    </div>
  );
}
