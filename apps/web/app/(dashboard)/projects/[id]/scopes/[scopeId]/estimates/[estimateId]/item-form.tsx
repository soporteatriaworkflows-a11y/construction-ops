/**
 * item-form.tsx — Formulario de creación/edición de ítem BOQ (4E.2A). Client.
 *
 * El navegador solo envía code/description/unit/quantity/unitPrice (+ targetChapter
 * al mover). El subtotal mostrado es una PREVIEW visual; el definitivo lo recalcula
 * el servidor y lo fuerza el trigger DB. Loading + anti doble-submit + errores
 * sanitizados + banner de éxito. Read-only si bloqueada o modo sin escritura.
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/auth/form-error';
import { formatCOP } from '@/lib/utils/format';
import type { ChapterRef } from '@/lib/estimates/boq-edit-types';
import { createItemAction, updateItemAction, type ItemActionResult } from './item-actions';

interface ItemFormProps {
  mode: 'create' | 'edit';
  estimateId: string;
  chapterId: string;
  chapterCode: string;
  chapterHref: string;
  canWrite: boolean;
  editable: boolean;
  initial?: {
    itemId: string;
    code: string;
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
  };
  origin?: { sourceCode: string | null; sourceRow: number | null; isManual: boolean };
  availableChapters?: ChapterRef[];
}

/** Preview client-side del subtotal (no es la fuente de verdad). */
function previewSubtotal(quantity: string, unitPrice: string): number {
  const q = Number(quantity);
  const p = Number(unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p) || q < 0 || p < 0) return 0;
  return q * p;
}

export function ItemForm({
  mode, estimateId, chapterId, chapterCode, chapterHref, canWrite, editable, initial, origin, availableChapters,
}: ItemFormProps) {
  const router = useRouter();
  const [code, setCode] = useState(initial?.code ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? '');
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ?? '');
  const [targetChapterId, setTargetChapterId] = useState(chapterId);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const disabled = !canWrite || !editable;
  const preview = useMemo(() => previewSubtotal(quantity, unitPrice), [quantity, unitPrice]);

  // Advertencia si el prefijo de code no coincide con el capítulo destino.
  const targetChapter = availableChapters?.find((c) => c.id === targetChapterId);
  const prefixMismatch =
    mode === 'edit' &&
    targetChapterId !== chapterId &&
    !!targetChapter &&
    !!code &&
    !code.startsWith(targetChapter.code);

  function bump<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setSaved(false); };
  }

  function save() {
    if (disabled || pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      fd.set('chapterId', chapterId);
      fd.set('code', code);
      fd.set('description', description);
      fd.set('unit', unit);
      fd.set('quantity', quantity);
      fd.set('unitPrice', unitPrice);
      let res: ItemActionResult;
      if (mode === 'create') {
        res = await createItemAction(fd);
      } else {
        if (initial) fd.set('itemId', initial.itemId);
        if (targetChapterId && targetChapterId !== chapterId) fd.set('targetChapterId', targetChapterId);
        res = await updateItemAction(fd);
      }
      if (res.ok) {
        setSaved(true);
        // Volver al capítulo de destino (si se movió, al nuevo).
        const dest = mode === 'edit' && res.chapterId !== chapterId
          ? chapterHref.replace(/chapters\/[^/]+$/, `chapters/${res.chapterId}`)
          : chapterHref;
        router.push(`${dest}?saved=1`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        setError(res.error ?? null);
      }
    });
  }

  return (
    <div className="grid max-w-3xl gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {!canWrite && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Modo demostración (solo lectura). La edición requiere el modo de datos reales.
          </p>
        )}
        {canWrite && !editable && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta versión no admite cambios (versión emitida). El ítem es de solo lectura.
          </p>
        )}

        {mode === 'edit' && origin && (
          <p className="mb-3">
            {origin.isManual ? (
              <Badge variant="secondary">Ítem creado manualmente</Badge>
            ) : (
              <Badge variant="warning" title={`Código original: ${origin.sourceCode ?? '—'}${origin.sourceRow ? ` (fila ${origin.sourceRow})` : ''}`}>
                Ítem importado{origin.sourceCode ? ` · origen ${origin.sourceCode}${origin.sourceRow ? ` (fila ${origin.sourceRow})` : ''}` : ''}
              </Badge>
            )}
          </p>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="code">Código</Label>
            <Input id="code" value={code} onChange={(e) => bump(setCode)(e.target.value)} disabled={disabled || pending} maxLength={60} placeholder={`${chapterCode}.01`} aria-invalid={!!fieldErrors.code} />
            {fieldErrors.code && <FormError id="err-code" message={fieldErrors.code} />}
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => bump(setDescription)(e.target.value)}
              disabled={disabled || pending}
              maxLength={1000}
              rows={2}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Descripción del ítem"
              aria-invalid={!!fieldErrors.description}
            />
            {fieldErrors.description && <FormError id="err-description" message={fieldErrors.description} />}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="unit">Unidad</Label>
              <Input id="unit" value={unit} onChange={(e) => bump(setUnit)(e.target.value)} disabled={disabled || pending} maxLength={30} placeholder="m3, un…" aria-invalid={!!fieldErrors.unit} />
              {fieldErrors.unit && <FormError id="err-unit" message={fieldErrors.unit} />}
            </div>
            <div className="space-y-1">
              <Label htmlFor="quantity">Cantidad</Label>
              <Input id="quantity" type="number" step="any" min={0} inputMode="decimal" value={quantity} onChange={(e) => bump(setQuantity)(e.target.value)} disabled={disabled || pending} placeholder="0" aria-invalid={!!fieldErrors.quantity} />
              {fieldErrors.quantity && <FormError id="err-quantity" message={fieldErrors.quantity} />}
            </div>
            <div className="space-y-1">
              <Label htmlFor="unitPrice">Valor unitario</Label>
              <Input id="unitPrice" type="number" step="any" min={0} inputMode="decimal" value={unitPrice} onChange={(e) => bump(setUnitPrice)(e.target.value)} disabled={disabled || pending} placeholder="0" aria-invalid={!!fieldErrors.unitPrice} />
              {fieldErrors.unitPrice && <FormError id="err-unitPrice" message={fieldErrors.unitPrice} />}
            </div>
          </div>

          {mode === 'edit' && availableChapters && availableChapters.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="targetChapterId">Capítulo</Label>
              <Select id="targetChapterId" value={targetChapterId} onChange={(e) => bump(setTargetChapterId)(e.target.value)} disabled={disabled || pending}>
                {availableChapters.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </Select>
              {prefixMismatch && (
                <p className="text-xs text-amber-700">
                  El código <span className="font-mono">{code}</span> no coincide con el prefijo del capítulo destino
                  (<span className="font-mono">{targetChapter?.code}</span>). El código no se renumera automáticamente.
                </p>
              )}
              {fieldErrors.targetChapterId && <FormError id="err-targetChapterId" message={fieldErrors.targetChapterId} />}
            </div>
          )}
        </div>

        {error && <div className="mt-3"><FormError id="item-error" message={error} /></div>}
        {saved && !pending && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Ítem guardado.
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={save} disabled={disabled || pending} size="sm">
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Guardar ítem
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={chapterHref}>Cancelar</Link>
          </Button>
        </div>
      </div>

      {/* Preview del subtotal */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Subtotal (preview)</h3>
        <p className="text-2xl font-bold tabular-nums text-blue-700">{formatCOP(String(preview))}</p>
        <p className="mt-2 text-xs text-gray-500">El subtotal definitivo se recalcula al guardar.</p>
      </div>
    </div>
  );
}
