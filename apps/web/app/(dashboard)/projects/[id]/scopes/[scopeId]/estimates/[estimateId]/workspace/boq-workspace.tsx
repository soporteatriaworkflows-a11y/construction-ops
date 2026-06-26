/**
 * boq-workspace.tsx — BOQ Workspace denso y operativo. Client Component.
 * Oleada OPERATIONAL BUDGET UX V1. Contrato §3.
 *
 * - Datos 100% server-derived (subtotales/totales NUNCA se calculan aquí).
 * - Filtro (activos/archivados/todos), búsqueda (código/descripción) y
 *   expandir/colapsar son SOLO visibilidad (helpers puros de workspace-view).
 * - Edición rápida de cantidad y precio unitario reutiliza `updateItemAction`
 *   (4E.2A): subtotal y resumen financiero recalculados server-side; el trigger
 *   DB fuerza el invariant. issued ⇒ inmutable (sin inputs).
 * - Tras guardar: fila/resumen se actualizan con la respuesta del servidor y
 *   `router.refresh()` re-sincroniza subtotales de capítulo y desglose.
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Pencil,
  X,
  Search,
  ListChevronsDownUp,
  ListChevronsUpDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCOP, formatNumber } from '@/lib/utils/format';
import type { FinancialSummary } from '@/lib/estimates/aiu-types';
import type { BoqItemReviewView } from '@/lib/estimates/review-types';
import {
  applyWorkspaceView,
  applyApuFilter,
  countVisibleItems,
  itemApuState,
  WORKSPACE_FILTER_LABELS,
  APU_FILTER_LABELS,
  APU_STATE_LABELS,
  type WorkspaceChapterData,
  type WorkspaceFilter,
  type ApuLinkFilter,
} from '@/lib/estimates/workspace-view';
import { updateItemAction, type ItemActionResult } from '../item-actions';
import { ArchiveControls } from '../archive-controls';
import { InlineCallout } from '@/components/shared/inline-callout';
import { FilterPills } from '@/components/shared/filter-pills';

type RowStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

interface QuickEditState {
  itemId: string;
  quantity: string;
  unitPrice: string;
}

export function BoqWorkspace({
  estimateId,
  basePath,
  data,
  summary: serverSummary,
  canEdit,
  canMutate,
  versionStatusLabel,
  versionLocked,
  initialApuFilter = 'all',
}: {
  estimateId: string;
  /** /projects/[id]/scopes/[scopeId]/estimates/[estimateId] */
  basePath: string;
  data: WorkspaceChapterData[];
  summary: FinancialSummary;
  /** Modo supabase+db (habilita acciones de escritura). */
  canEdit: boolean;
  /** canEdit && versión editable (no emitida). */
  canMutate: boolean;
  versionStatusLabel: string;
  versionLocked: boolean;
  /** Filtro APU inicial (p. ej. desde el asistente con ?apu=missing). */
  initialApuFilter?: ApuLinkFilter;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<WorkspaceFilter>('active');
  const [apuFilter, setApuFilter] = useState<ApuLinkFilter>(initialApuFilter);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [localData, setLocalData] = useState<WorkspaceChapterData[]>(data);
  const [summary, setSummary] = useState<FinancialSummary>(serverSummary);
  const [edit, setEdit] = useState<QuickEditState | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [pending, startTransition] = useTransition();

  // Re-sincroniza con el servidor tras router.refresh(): cuando llegan props
  // nuevas, el estado local se ajusta DURANTE el render (patrón recomendado por
  // React en lugar de setState dentro de un efecto).
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setLocalData(data);
  }
  const [prevSummary, setPrevSummary] = useState(serverSummary);
  if (prevSummary !== serverSummary) {
    setPrevSummary(serverSummary);
    setSummary(serverSummary);
  }

  const view = useMemo(
    () => applyApuFilter(applyWorkspaceView(localData, filter, query), apuFilter),
    [localData, filter, query, apuFilter],
  );
  const visibleItems = countVisibleItems(view);
  const filtered = query.trim() !== '' || filter !== 'active' || apuFilter !== 'all';

  // Conteo "Sin APU" (display, honesto): solo ítems activos cuyo vínculo APU se
  // puede verificar y es null. No cuenta los "No verificable" (undefined).
  const itemsWithoutApu = useMemo(
    () =>
      localData.reduce(
        (acc, ch) =>
          acc + ch.items.filter((it) => !it.archived && itemApuState(it) === 'unlinked').length,
        0,
      ),
    [localData],
  );

  function toggleChapter(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAllCollapsed(value: boolean) {
    setCollapsed(value ? new Set(view.map((v) => v.chapter.id)) : new Set());
  }

  function startEdit(item: BoqItemReviewView) {
    if (!canMutate || item.archived) return;
    setEdit({ itemId: item.id, quantity: item.quantity, unitPrice: item.unitPrice });
    setRowStatus((s) => ({ ...s, [item.id]: { kind: 'idle' } }));
  }

  function cancelEdit() {
    setEdit(null);
  }

  function saveEdit(chapterId: string, item: BoqItemReviewView) {
    if (!edit || edit.itemId !== item.id || pending) return;
    const { quantity, unitPrice } = edit;
    setRowStatus((s) => ({ ...s, [item.id]: { kind: 'saving' } }));
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      fd.set('chapterId', chapterId);
      fd.set('itemId', item.id);
      fd.set('code', item.code);
      fd.set('description', item.description);
      fd.set('unit', item.unit);
      fd.set('quantity', quantity);
      fd.set('unitPrice', unitPrice);
      const res: ItemActionResult = await updateItemAction(fd);
      if (res.ok) {
        // Actualiza fila con valores server-derived (subtotal) y resumen global.
        setLocalData((prev) =>
          prev.map((entry) =>
            entry.chapter.id !== chapterId
              ? entry
              : {
                  ...entry,
                  items: entry.items.map((it) =>
                    it.id === item.id
                      ? { ...it, quantity, unitPrice, subtotal: res.subtotal }
                      : it,
                  ),
                },
          ),
        );
        setSummary(res.financial);
        setRowStatus((s) => ({ ...s, [item.id]: { kind: 'saved' } }));
        setEdit(null);
        // Re-sincroniza subtotales de capítulo, desglose y AIU server-side.
        router.refresh();
      } else {
        const msg =
          res.error ??
          Object.values(res.fieldErrors ?? {}).join(' ') ??
          'No se pudo guardar.';
        setRowStatus((s) => ({ ...s, [item.id]: { kind: 'error', message: msg || 'No se pudo guardar.' } }));
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- */}
      {/* Resumen financiero compacto (C) — server-derived, ICONIC          */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-label="Resumen financiero"
        className="rounded-2xl border border-iconic-soft-blue/70 bg-gradient-to-br from-brand-50/70 via-white to-white p-4 shadow-iconic"
      >
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-iconic-primary/80">Resumen financiero</p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
          {/* Total general — número héroe */}
          <div className="flex flex-col justify-center rounded-xl border border-iconic-primary/30 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Total general</p>
            <p className="mt-1 truncate text-2xl font-bold tabular-nums text-iconic-primary" title={formatCOP(summary.grandTotal)}>
              {formatCOP(summary.grandTotal)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">Costo directo + indirectos (AIU + IVA)</p>
          </div>
          {/* Desglose */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryCard label="Costo directo" value={summary.directTotal} accent="ink" />
            <SummaryCard label="Administración" value={summary.administrationAmount} />
            <SummaryCard label="Imprevistos" value={summary.contingencyAmount} />
            <SummaryCard label="Utilidad" value={summary.utilityAmount} />
            <SummaryCard label="IVA utilidad" value={summary.utilityVatAmount} />
            <SummaryCard label="Indirectos" value={summary.indirectTotal} />
          </div>
        </div>
      </section>

      {apuFilter === 'all' && (
        <InlineCallout tone="tip" title="¿Qué partidas faltan por vincular?">
          Usa el filtro <strong>Sin APU</strong> para encontrar las partidas pendientes; luego asocia un
          APU para validar componentes, precios y rendimientos.
        </InlineCallout>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Toolbar sticky: búsqueda + filtros + total siempre visible        */}
      {/* ---------------------------------------------------------------- */}
      <div className="sticky top-14 z-10 -mx-1 rounded-xl border border-iconic-soft-blue/70 bg-white/95 px-3 py-2.5 shadow-iconic backdrop-blur">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código o descripción…"
              aria-label="Buscar ítems por código o descripción"
              className="h-8 pl-8 text-sm"
            />
          </div>

          <span className="hidden h-5 w-px bg-iconic-soft-blue/60 lg:inline-block" aria-hidden="true" />

          <FilterPills
            label="Estado"
            ariaLabel="Filtro de estado"
            tone="ink"
            value={filter}
            onChange={(v) => setFilter(v as WorkspaceFilter)}
            options={(Object.keys(WORKSPACE_FILTER_LABELS) as WorkspaceFilter[]).map((f) => ({ value: f, label: WORKSPACE_FILTER_LABELS[f] }))}
          />

          <FilterPills
            label="APU"
            ariaLabel="Filtro de vínculo APU"
            tone="primary"
            value={apuFilter}
            onChange={(v) => setApuFilter(v as ApuLinkFilter)}
            options={(Object.keys(APU_FILTER_LABELS) as ApuLinkFilter[]).map((f) => ({ value: f, label: APU_FILTER_LABELS[f] }))}
          />

          <span className="hidden h-5 w-px bg-iconic-soft-blue/60 lg:inline-block" aria-hidden="true" />

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAllCollapsed(false)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              title="Expandir todos los capítulos"
            >
              <ListChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              Expandir
            </button>
            <button
              type="button"
              onClick={() => setAllCollapsed(true)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              title="Colapsar todos los capítulos"
            >
              <ListChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
              Colapsar
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {itemsWithoutApu > 0 && apuFilter !== 'without' && (
              <button
                type="button"
                onClick={() => setApuFilter('without')}
                title="Ver solo las partidas sin APU vinculado"
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                {itemsWithoutApu} sin APU
              </button>
            )}
            <span className="text-xs text-gray-500 tabular-nums">
              {visibleItems} ítem{visibleItems === 1 ? '' : 's'} visibles
            </span>
            <span className="hidden items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-semibold text-iconic-primary sm:inline-flex">
              Total general
              <span className="tabular-nums text-sm">{formatCOP(summary.grandTotal)}</span>
            </span>
          </div>
        </div>
      </div>

      {versionLocked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          Versión <strong>{versionStatusLabel}</strong>: inmutable. La edición rápida está deshabilitada;
          clona la versión para seguir trabajando.
        </div>
      )}

      {apuFilter !== 'all' && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-iconic-soft-blue/60 bg-brand-50/60 px-3 py-2 text-xs text-iconic-ink" role="status">
          <span>
            Mostrando ítems <strong>{apuFilter === 'without' ? 'sin APU vinculado' : 'con APU vinculado'}</strong>.
            Usa <strong>Agregar actividad desde APU</strong> para vincular las partidas pendientes.
          </span>
          <button type="button" onClick={() => setApuFilter('all')} className="shrink-0 font-medium text-iconic-primary hover:underline">
            Ver todos
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Grilla densa con header sticky                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className="max-h-[68vh] overflow-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm" aria-label="BOQ del presupuesto por capítulos">
          <thead className="sticky top-0 z-[5] bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
            <tr>
              <th className="w-28 px-2 py-1.5 font-medium">Código</th>
              <th className="px-2 py-1.5 font-medium">Descripción</th>
              <th className="w-14 px-2 py-1.5 font-medium">Und</th>
              <th className="w-24 px-2 py-1.5 text-right font-medium">Cantidad</th>
              <th className="w-32 px-2 py-1.5 text-right font-medium">V/Unitario</th>
              <th className="w-32 px-2 py-1.5 text-right font-medium">Subtotal</th>
              {canEdit && <th className="w-36 px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {view.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-3 py-8 text-center text-sm text-gray-400">
                  Sin resultados para el filtro o la búsqueda actual.
                </td>
              </tr>
            )}
            {view.map(({ chapter, items }) => {
              const isCollapsed = collapsed.has(chapter.id);
              return (
                <ChapterGroup
                  key={chapter.id}
                  basePath={basePath}
                  estimateId={estimateId}
                  chapterId={chapter.id}
                  chapterCode={chapter.code}
                  chapterName={chapter.name}
                  chapterArchived={chapter.archived}
                  itemCount={chapter.itemCount}
                  subtotal={chapter.subtotal}
                  sourceCode={chapter.sourceCode}
                  collapsed={isCollapsed}
                  onToggle={() => toggleChapter(chapter.id)}
                  canEdit={canEdit}
                  canMutate={canMutate}
                  items={items}
                  edit={edit}
                  rowStatus={rowStatus}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onEditChange={(field, value) =>
                    setEdit((e) => (e ? { ...e, [field]: value } : e))
                  }
                  pending={pending}
                />
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-iconic-ink text-white">
            <tr>
              <td colSpan={5} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                Costo directo {filtered && <span className="font-normal normal-case text-white/60">(total de la versión; la vista está filtrada)</span>}
              </td>
              <td className="px-2 py-2 text-right text-sm font-bold tabular-nums">
                {formatCOP(summary.directTotal)}
              </td>
              {canEdit && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'ink' | 'primary';
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-sm ${
        accent === 'primary'
          ? 'border-iconic-primary/30 bg-brand-50'
          : accent === 'ink'
            ? 'border-iconic-ink/20 bg-white'
            : 'border-gray-200 bg-white'
      }`}
    >
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p
        className={`truncate text-sm font-bold tabular-nums ${
          accent === 'primary' ? 'text-iconic-primary' : 'text-iconic-ink'
        }`}
        title={formatCOP(value)}
      >
        {formatCOP(value)}
      </p>
    </div>
  );
}

function ChapterGroup({
  basePath,
  estimateId,
  chapterId,
  chapterCode,
  chapterName,
  chapterArchived,
  itemCount,
  subtotal,
  sourceCode,
  collapsed,
  onToggle,
  canEdit,
  canMutate,
  items,
  edit,
  rowStatus,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
  pending,
}: {
  basePath: string;
  estimateId: string;
  chapterId: string;
  chapterCode: string;
  chapterName: string;
  chapterArchived: boolean;
  itemCount: number;
  subtotal: string;
  sourceCode: string | null;
  collapsed: boolean;
  onToggle: () => void;
  canEdit: boolean;
  canMutate: boolean;
  items: BoqItemReviewView[];
  edit: QuickEditState | null;
  rowStatus: Record<string, RowStatus>;
  onStartEdit: (item: BoqItemReviewView) => void;
  onCancelEdit: () => void;
  onSaveEdit: (chapterId: string, item: BoqItemReviewView) => void;
  onEditChange: (field: 'quantity' | 'unitPrice', value: string) => void;
  pending: boolean;
}) {
  const colSpan = canEdit ? 7 : 6;
  return (
    <>
      <tr className={`${chapterArchived ? 'bg-gray-100/80' : 'bg-brand-50/60'} border-l-2 ${chapterArchived ? 'border-gray-300' : 'border-iconic-primary/60'}`}>
        <td colSpan={colSpan} className="px-2 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? 'Expandir' : 'Colapsar'} capítulo ${chapterCode}`}
              className="inline-flex items-center gap-1 text-left"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
              )}
              <span className="font-mono text-xs text-gray-500">{chapterCode}</span>
              <span className={`text-sm font-semibold ${chapterArchived ? 'text-gray-500' : 'text-iconic-ink'}`}>
                {chapterName}
              </span>
            </button>
            {chapterArchived && <Badge variant="outline">Archivado</Badge>}
            {!chapterArchived && sourceCode && sourceCode !== chapterCode && (
              <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700" title={`Código original: ${sourceCode}`}>
                normalizado
              </span>
            )}
            <span className="text-xs text-gray-400 tabular-nums">{itemCount} ítems</span>
            <span className="ml-auto inline-flex items-center gap-3">
              {canMutate && (
                <ArchiveControls
                  kind="chapter"
                  estimateId={estimateId}
                  targetId={chapterId}
                  archived={chapterArchived}
                  canWrite={canMutate}
                />
              )}
              <Link
                href={`${basePath}/chapters/${chapterId}`}
                className="text-xs font-medium text-iconic-primary hover:underline"
              >
                Detalle
              </Link>
              <span className="rounded-md bg-white/80 px-2 py-0.5 text-sm font-bold tabular-nums text-iconic-ink ring-1 ring-inset ring-iconic-soft-blue/60">
                {formatCOP(subtotal)}
              </span>
            </span>
          </div>
        </td>
      </tr>
      {!collapsed &&
        items.map((item) => (
          <ItemRow
            key={item.id}
            basePath={basePath}
            estimateId={estimateId}
            chapterId={chapterId}
            item={item}
            canEdit={canEdit}
            canMutate={canMutate && !chapterArchived}
            edit={edit?.itemId === item.id ? edit : null}
            status={rowStatus[item.id] ?? { kind: 'idle' }}
            onStartEdit={() => onStartEdit(item)}
            onCancelEdit={onCancelEdit}
            onSaveEdit={() => onSaveEdit(chapterId, item)}
            onEditChange={onEditChange}
            pending={pending}
          />
        ))}
    </>
  );
}

/** Indicador textual del estado de vínculo APU del ítem (no solo color). */
function ApuStateBadge({ item }: { item: BoqItemReviewView }) {
  const state = itemApuState(item);
  const cls =
    state === 'linked'
      ? 'bg-green-50 text-green-700'
      : state === 'unlinked'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-500';
  return (
    <span className={`ml-2 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-medium ${cls}`}>
      {APU_STATE_LABELS[state]}
    </span>
  );
}

function ItemRow({
  basePath,
  chapterId,
  item,
  canEdit,
  canMutate,
  edit,
  status,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
  pending,
}: {
  basePath: string;
  estimateId: string;
  chapterId: string;
  item: BoqItemReviewView;
  canEdit: boolean;
  canMutate: boolean;
  edit: QuickEditState | null;
  status: RowStatus;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditChange: (field: 'quantity' | 'unitPrice', value: string) => void;
  pending: boolean;
}) {
  const editing = edit !== null;
  const editable = canMutate && !item.archived;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
    }
  }

  return (
    <tr className={`${item.archived ? 'bg-gray-50/60 text-gray-400' : 'hover:bg-brand-50/40'} ${editing ? 'bg-cyan-50/40' : ''}`}>
      <td className="px-2 py-1.5 align-top">
        <span className="font-mono text-xs text-gray-600">{item.code}</span>
        {item.archived && (
          <span className="ml-1 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-medium text-gray-600">Arch.</span>
        )}
        {!item.archived && item.sourceCode && item.sourceCode !== item.code && (
          <span
            className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700"
            title={`Código original: ${item.sourceCode}${item.sourceRow ? ` (fila ${item.sourceRow})` : ''}`}
          >
            norm.
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 align-top text-gray-900">
        <span>{item.description}</span>
        <ApuStateBadge item={item} />
      </td>
      <td className="px-2 py-1.5 align-top text-gray-500">{item.unit}</td>

      {/* Cantidad */}
      <td className="px-2 py-1.5 text-right align-top tabular-nums">
        {editing ? (
          <Input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={edit!.quantity}
            onChange={(e) => onEditChange('quantity', e.target.value)}
            onKeyDown={onKeyDown}
            disabled={pending}
            aria-label={`Cantidad de ${item.code}`}
            className="h-7 w-24 text-right text-xs"
            autoFocus
          />
        ) : (
          <span className="text-gray-700">{formatNumber(item.quantity)}</span>
        )}
      </td>

      {/* V/Unitario */}
      <td className="px-2 py-1.5 text-right align-top tabular-nums">
        {editing ? (
          <Input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={edit!.unitPrice}
            onChange={(e) => onEditChange('unitPrice', e.target.value)}
            onKeyDown={onKeyDown}
            disabled={pending}
            aria-label={`Precio unitario de ${item.code}`}
            className="h-7 w-28 text-right text-xs"
          />
        ) : (
          <span className="text-gray-700">{formatCOP(item.unitPrice)}</span>
        )}
      </td>

      <td className="px-2 py-1.5 text-right align-top font-medium tabular-nums">{formatCOP(item.subtotal)}</td>

      {canEdit && (
        <td className="px-2 py-1.5 text-right align-top">
          <div className="inline-flex items-center gap-2">
            {status.kind === 'saving' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500" role="status">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Guardando…
              </span>
            )}
            {status.kind === 'saved' && !editing && (
              <span className="inline-flex items-center gap-1 text-[11px] text-green-700" role="status">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Guardado
              </span>
            )}
            {status.kind === 'error' && (
              <span className="max-w-[160px] truncate text-[11px] text-red-600" role="alert" title={status.message}>
                {status.message}
              </span>
            )}
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={onSaveEdit}
                  disabled={pending}
                  className="rounded bg-iconic-primary px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-iconic-primary/90 disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  disabled={pending}
                  aria-label="Cancelar edición"
                  className="rounded border border-gray-200 p-0.5 text-gray-500 hover:bg-gray-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                {editable && (
                  <button
                    type="button"
                    onClick={onStartEdit}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-600 hover:underline"
                    title="Editar cantidad y precio"
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    Rápida
                  </button>
                )}
                <Link
                  href={`${basePath}/chapters/${chapterId}/items/${item.id}/edit`}
                  className="text-[11px] font-medium text-gray-500 hover:underline"
                  title="Edición completa (mover de capítulo, código, descripción)"
                >
                  Completa
                </Link>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
