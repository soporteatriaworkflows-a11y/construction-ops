/**
 * add-apu-panel.tsx — Agregar actividad desde APU al BOQ (cliente).
 *
 * 'use client'. Selección de capítulo + APU activo + cantidad, con subtotal
 * estimado en vivo (display). El navegador no envía precios: la RPC calcula el
 * snapshot server-side. Idempotencia por clave generada por intento.
 */
'use client';

import { useActionState, useMemo, useState } from 'react';
import { Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCOP } from '@/lib/utils/format';
import type { ApuAddOption } from '@/server/apu-builder';
import { addApuToBoqAction, type AddApuToBoqActionResult } from './boq-add-actions';

interface ChapterOption {
  id: string;
  code: string;
  name: string;
}

const INITIAL: AddApuToBoqActionResult | null = null;

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function AddApuPanel({
  versionId,
  projectId,
  scopeId,
  estimateId,
  chapters,
  apus,
}: {
  versionId: string;
  projectId: string;
  scopeId: string;
  estimateId: string;
  chapters: ChapterOption[];
  apus: ApuAddOption[];
}) {
  const [state, formAction, isPending] = useActionState(addApuToBoqAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [chapterId, setChapterId] = useState(chapters[0]?.id ?? '');
  const [apuId, setApuId] = useState(apus[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [idempotencyKey, setIdempotencyKey] = useState(newKey());

  // Una clave de idempotencia por "borrador": cambiar cualquier campo genera una
  // clave nueva (alta distinta); reenviar la misma selección la deduplica
  // (replay server-side ⇒ no crea un segundo ítem). No se usa useEffect.
  function rekey(): void {
    setIdempotencyKey(newKey());
  }

  const apuById = useMemo(() => new Map(apus.map((a) => [a.id, a])), [apus]);
  const selected = apuById.get(apuId);
  const qty = Number.parseFloat(quantity);
  const estSubtotal =
    selected && Number.isFinite(qty) ? qty * Number.parseFloat(selected.unitCost) : 0;

  const canSubmit =
    !isPending && chapterId !== '' && apuId !== '' && Number.isFinite(qty) && qty >= 0;

  if (apus.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        No hay plantillas APU activas para agregar. Crea o importa un APU primero.
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlusCircle className="h-4 w-4" aria-hidden="true" />
        Agregar actividad desde APU
      </Button>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-gray-200 bg-white p-5" aria-label="Agregar actividad desde APU">
      <input type="hidden" name="estimateVersionId" value={versionId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="scopeId" value={scopeId} />
      <input type="hidden" name="estimateId" value={estimateId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <h3 className="mb-3 text-sm font-semibold text-gray-700">Agregar actividad desde APU</h3>

      {state?.ok === false && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </div>
      )}
      {state?.ok === true && (
        <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
          {state.message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="add-chapter" className="text-xs">Capítulo</Label>
          <Select id="add-chapter" name="chapterId" value={chapterId} disabled={isPending} onChange={(e) => { setChapterId(e.target.value); rekey(); }}>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="add-apu" className="text-xs">APU</Label>
          <Select id="add-apu" name="apuTemplateId" value={apuId} disabled={isPending} onChange={(e) => { setApuId(e.target.value); rekey(); }}>
            {apus.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name} ({a.unit})
              </option>
            ))}
          </Select>
        </div>
      </div>

      {selected && (
        <div className="mt-3 grid gap-3 rounded-md bg-gray-50/60 p-3 text-sm sm:grid-cols-[8rem_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="add-qty" className="text-xs">Cantidad ({selected.unit})</Label>
            <Input id="add-qty" name="quantity" type="number" min="0" step="any" value={quantity} disabled={isPending} onChange={(e) => { setQuantity(e.target.value); rekey(); }} />
          </div>
          <div className="text-xs text-gray-500">
            <p>Costo unitario calculado: <span className="font-medium text-gray-800">{formatCOP(selected.unitCost)}</span></p>
            <p>{selected.componentCount} componente{selected.componentCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Subtotal estimado</p>
            <p className="text-lg font-bold tabular-nums text-blue-700">{formatCOP(String(estSubtotal))}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit} aria-busy={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPending ? 'Agregando…' : 'Agregar al presupuesto'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        El subtotal definitivo se calcula server-side al confirmar. El snapshot del
        costo unitario queda fijo en el ítem; cambios futuros del APU no lo alteran.
      </p>
    </form>
  );
}
