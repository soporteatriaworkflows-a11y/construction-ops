/**
 * link-to-boq-button.tsx — Acción "Vincular a BOQ" desde una tarjeta de la
 * Biblioteca APU (APU_LIBRARY_BOQ_LINK_FROM_CARDS_V1). 'use client'.
 *
 * Flujo guiado: proyecto → versión editable → capítulo → (ítem de referencia
 * opcional, read-only) → cantidad → confirmar. La mutación delega en el server
 * action `linkApuToBoqAction` (wrapper sobre el dominio `addApuToBoq`). El
 * navegador NO envía precios: el snapshot lo calcula el RPC server-side.
 */
'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCOP } from '@/lib/utils/format';
import { unitsCompatible } from '@/lib/apu-library/boq-link';
import type { ApuLinkEligibility } from '@/lib/apu-library/boq-link';
import {
  linkApuToBoqAction,
  loadLinkChaptersAction,
  loadLinkProjectsAction,
  loadLinkVersionsAction,
  type LinkApuToBoqActionResult,
  type LinkBoqItemRef,
  type LinkChapterOption,
  type LinkProjectOption,
  type LinkVersionOption,
} from './link-to-boq-actions';

export interface LinkApuCard {
  id: string;
  code: string;
  name: string;
  unit: string;
  unitCost: string;
}

const INITIAL: LinkApuToBoqActionResult | null = null;

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function LinkToBoqButton({
  apu,
  eligibility,
}: {
  apu: LinkApuCard;
  eligibility: ApuLinkEligibility;
}) {
  const [open, setOpen] = useState(false);

  if (!eligibility.canLink) {
    return (
      <span
        className="cursor-not-allowed text-[11px] text-gray-300"
        title={eligibility.message ?? 'No disponible'}
      >
        Vincular a BOQ
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-iconic-primary hover:underline"
      >
        <Link2 className="h-3 w-3" aria-hidden="true" />
        Vincular a BOQ
      </button>
    );
  }

  return <LinkPanel apu={apu} onClose={() => setOpen(false)} />;
}

function LinkPanel({ apu, onClose }: { apu: LinkApuCard; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(linkApuToBoqAction, INITIAL);
  const [isLoading, startLoad] = useTransition();

  const [projects, setProjects] = useState<LinkProjectOption[] | null>(null);
  const [versions, setVersions] = useState<LinkVersionOption[]>([]);
  const [chapters, setChapters] = useState<LinkChapterOption[]>([]);
  const [items, setItems] = useState<LinkBoqItemRef[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [refItemId, setRefItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [idempotencyKey, setIdempotencyKey] = useState(newKey());

  // Carga perezosa de proyectos al montar el panel (una sola vez).
  if (projects === null && !isLoading) {
    startLoad(async () => {
      const r = await loadLinkProjectsAction();
      if (r.ok) setProjects(r.projects);
      else {
        setProjects([]);
        setLoadError(r.error);
      }
    });
  }

  function rekey(): void {
    setIdempotencyKey(newKey());
  }

  function onProjectChange(id: string): void {
    setProjectId(id);
    setVersionId('');
    setChapterId('');
    setRefItemId('');
    setVersions([]);
    setChapters([]);
    setItems([]);
    setLoadError(null);
    rekey();
    if (!id) return;
    startLoad(async () => {
      const r = await loadLinkVersionsAction(id);
      if (r.ok) setVersions(r.versions);
      else setLoadError(r.error);
    });
  }

  function onVersionChange(id: string): void {
    setVersionId(id);
    setChapterId('');
    setRefItemId('');
    setChapters([]);
    setItems([]);
    setLoadError(null);
    rekey();
    if (!id) return;
    startLoad(async () => {
      const r = await loadLinkChaptersAction(id);
      if (r.ok) {
        setChapters(r.chapters);
        setItems(r.items);
      } else setLoadError(r.error);
    });
  }

  const chapterItems = useMemo(
    () => items.filter((it) => it.chapterId === chapterId),
    [items, chapterId],
  );
  const refItem = useMemo(
    () => chapterItems.find((it) => it.id === refItemId),
    [chapterItems, refItemId],
  );

  const selectedVersion = versions.find((v) => v.versionId === versionId);
  const versionEditable = selectedVersion?.editable ?? false;

  const qtyNum = Number.parseFloat(quantity);
  const estSubtotal =
    Number.isFinite(qtyNum) && qtyNum >= 0
      ? qtyNum * Number.parseFloat(apu.unitCost)
      : 0;

  // Advertencia (no bloqueante): la nueva partida usará la unidad del APU; si el
  // ítem de referencia tiene otra unidad, lo señalamos.
  const unitWarning =
    refItem != null && !unitsCompatible(apu.unit, refItem.unit)
      ? `La unidad del ítem de referencia (${refItem.unit}) no coincide con la del APU (${apu.unit}). La nueva partida usará "${apu.unit}".`
      : null;

  const canSubmit =
    !isPending &&
    !isLoading &&
    projectId !== '' &&
    versionId !== '' &&
    versionEditable &&
    chapterId !== '' &&
    Number.isFinite(qtyNum) &&
    qtyNum >= 0;

  if (state?.ok === true) {
    return (
      <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-3 text-xs" role="status">
        <p className="font-medium text-green-700">{state.message}</p>
        <p className="mt-1 text-green-700">Subtotal: {formatCOP(state.subtotal)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {state.projectId && (
            <Link href={`/projects/${state.projectId}`} className="font-medium text-blue-700 hover:underline">
              Abrir presupuesto
            </Link>
          )}
          <Link href={`/apu/${state.apuTemplateId}`} className="font-medium text-blue-700 hover:underline">
            Abrir APU
          </Link>
          <button type="button" onClick={onClose} className="text-gray-500 hover:underline">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2 w-full rounded-md border border-gray-200 bg-gray-50/60 p-3" aria-label={`Vincular ${apu.code} a BOQ`}>
      <input type="hidden" name="apuTemplateId" value={apu.id} />
      <input type="hidden" name="estimateVersionId" value={versionId} />
      <input type="hidden" name="chapterId" value={chapterId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <p className="mb-2 text-xs font-semibold text-gray-700">
        Vincular <span className="font-mono">{apu.code}</span> · {apu.unit} · {formatCOP(apu.unitCost)}
      </p>

      {state?.ok === false && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700" role="alert">
          {state.error}
        </div>
      )}
      {loadError && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700" role="alert">
          {loadError}
        </div>
      )}

      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor={`lk-proj-${apu.id}`} className="text-[11px]">Proyecto</Label>
          <Select
            id={`lk-proj-${apu.id}`}
            value={projectId}
            disabled={isPending || projects === null}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            <option value="">Selecciona un proyecto…</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>

        {projectId !== '' && (
          <div className="space-y-1">
            <Label htmlFor={`lk-ver-${apu.id}`} className="text-[11px]">Presupuesto / versión</Label>
            <Select
              id={`lk-ver-${apu.id}`}
              value={versionId}
              disabled={isPending || versions.length === 0}
              onChange={(e) => onVersionChange(e.target.value)}
            >
              <option value="">Selecciona una versión…</option>
              {versions.map((v) => (
                <option key={v.versionId} value={v.versionId} disabled={!v.editable}>
                  {v.label}
                </option>
              ))}
            </Select>
            {versionId !== '' && !versionEditable && (
              <p className="text-[11px] text-red-600">Esta versión está bloqueada; elige una versión editable (borrador/revisión).</p>
            )}
          </div>
        )}

        {versionId !== '' && versionEditable && (
          <div className="space-y-1">
            <Label htmlFor={`lk-chap-${apu.id}`} className="text-[11px]">Capítulo destino</Label>
            <Select
              id={`lk-chap-${apu.id}`}
              value={chapterId}
              disabled={isPending || chapters.length === 0}
              onChange={(e) => { setChapterId(e.target.value); setRefItemId(''); rekey(); }}
            >
              <option value="">Selecciona un capítulo…</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.itemCount})</option>
              ))}
            </Select>
          </div>
        )}

        {chapterId !== '' && chapterItems.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor={`lk-ref-${apu.id}`} className="text-[11px]">Ítem de referencia (opcional)</Label>
            <Select
              id={`lk-ref-${apu.id}`}
              value={refItemId}
              disabled={isPending}
              onChange={(e) => {
                const id = e.target.value;
                setRefItemId(id);
                const it = chapterItems.find((x) => x.id === id);
                if (it) setQuantity(it.quantity);
                rekey();
              }}
            >
              <option value="">— Ninguno (solo agregar) —</option>
              {chapterItems.map((it) => (
                <option key={it.id} value={it.id}>{it.code} · {it.description} ({it.quantity} {it.unit})</option>
              ))}
            </Select>
          </div>
        )}

        {chapterId !== '' && (
          <div className="space-y-1">
            <Label htmlFor={`lk-qty-${apu.id}`} className="text-[11px]">Cantidad ({apu.unit})</Label>
            <Input
              id={`lk-qty-${apu.id}`}
              name="quantity"
              type="number"
              min="0"
              step="any"
              value={quantity}
              disabled={isPending}
              onChange={(e) => { setQuantity(e.target.value); rekey(); }}
            />
          </div>
        )}
      </div>

      {unitWarning && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800" role="alert">
          ▲ {unitWarning}
        </div>
      )}

      {chapterId !== '' && (
        <div className="mt-2 rounded bg-white/70 p-2 text-[11px] text-gray-600">
          <p>Resumen: <span className="font-medium text-gray-800">{apu.name}</span> ({apu.unit})</p>
          <p>Precio unitario APU: <span className="font-medium text-gray-800">{formatCOP(apu.unitCost)}</span></p>
          {refItem && <p>Ítem de referencia: {refItem.code} · cantidad actual {refItem.quantity} {refItem.unit}</p>}
          <p>Subtotal estimado: <span className="font-bold tabular-nums text-blue-700">{formatCOP(String(estSubtotal))}</span></p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit} aria-busy={isPending}>
          {(isPending || isLoading) && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {isPending ? 'Vinculando…' : 'Confirmar vínculo'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onClose}>
          Cancelar
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Se agregará una partida nueva con este APU al capítulo elegido. El costo
        unitario se fija como snapshot server-side; cambios futuros del APU no lo alteran.
      </p>
    </form>
  );
}
