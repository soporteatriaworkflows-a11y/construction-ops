/**
 * schedule-workspace.tsx — Vista maestro-detalle de tareas del cronograma
 * (SCHEDULE_WORKSPACE_UX_V2). SOLO presentación.
 *
 * Componente CLIENTE: lista izquierda (toolbar + chips + capítulos colapsables +
 * filas compactas seleccionables, con scroll interno) y panel derecho de detalle
 * de la tarea seleccionada. NO toca el motor (generator/preview/create/duración/
 * read-model/BOQ/APU): reorganiza datos ya entregados por el servidor.
 */
'use client';

import { useMemo, useState } from 'react';
import { Milestone as MilestoneIcon, ChevronRight, Search, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScheduleStatusBadge } from '@/components/planning/schedule-status-badge';
import { formatDate, formatNumber } from '@/lib/utils/format';
import {
  groupByChapter,
  computeVisibleGroups,
  warningCounts,
  chapterAggregate,
  filtersActive as anyFilterActive,
  isDelayed,
  type WorkspaceTask,
  type StatusFilter,
  type ProductivityFilter,
} from './schedule-workspace-filter';

export type { WorkspaceTask } from './schedule-workspace-filter';

interface Props {
  tasks: WorkspaceTask[];
  canSeeCriticalPath: boolean;
  clientSafe?: boolean;
  /** Solicita editar la tarea (la shell cambia a la pestaña de edición). */
  onRequestEdit?: (taskId: string) => void;
}

export function ScheduleWorkspace({ tasks, canSeeCriticalPath, clientSafe = false, onRequestEdit }: Props) {
  const groups = useMemo(() => groupByChapter(tasks), [tasks]);

  const [search, setSearch] = useState('');
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [productivityFilter, setProductivityFilter] = useState<ProductivityFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groups.map((g) => g.id)));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { noApu: noApuCount, noYield: noYieldCount } = useMemo(() => warningCounts(tasks), [tasks]);

  const filters = useMemo(
    () => ({ search, status: statusFilter, productivity: productivityFilter }),
    [search, statusFilter, productivityFilter],
  );
  const filtersActive = anyFilterActive(filters, chapterFilter);

  const visibleGroups = useMemo(
    () => computeVisibleGroups(groups, chapterFilter, filters),
    [groups, chapterFilter, filters],
  );

  const shownLeafCount = visibleGroups.reduce((acc, { children }) => acc + children.length, 0);
  const totalLeafCount = tasks.filter((t) => t.taskType !== 'chapter').length;
  const selected = useMemo(() => tasks.find((t) => t.id === selectedId) ?? null, [tasks, selectedId]);

  const clearFilters = () => {
    setSearch('');
    setChapterFilter('all');
    setStatusFilter('all');
    setProductivityFilter('all');
  };
  const toggleChapter = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(groups.map((g) => g.id)));
  const toggleProductivityChip = (value: ProductivityFilter) =>
    setProductivityFilter((prev) => (prev === value ? 'all' : value));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── Zona maestra: filtros + lista con scroll interno ───────────────── */}
      <div className="min-w-0 space-y-3">
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label htmlFor="wsSearch" className="mb-1 block text-xs font-medium text-gray-600">
                Buscar (WBS, código o tarea)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <Input id="wsSearch" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej. 01.003 o Excavación" className="pl-8" />
              </div>
            </div>
            <div>
              <label htmlFor="wsChapter" className="mb-1 block text-xs font-medium text-gray-600">Capítulo</label>
              <select id="wsChapter" value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="all">Todos los capítulos</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.wbsCode === '—' ? g.name : `${g.wbsCode} · ${g.name}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wsStatus" className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
              <select id="wsStatus" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="all">Todos</option>
                <option value="not_started">Sin iniciar</option>
                <option value="in_progress">En progreso</option>
                <option value="completed">Completadas</option>
                <option value="delayed">Atrasadas</option>
              </select>
            </div>
            {!clientSafe && (
              <div>
                <label htmlFor="wsProd" className="mb-1 block text-xs font-medium text-gray-600">Rendimiento</label>
                <select id="wsProd" value={productivityFilter} onChange={(e) => setProductivityFilter(e.target.value as ProductivityFilter)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="all">Todos</option>
                  <option value="apu">Con rendimiento APU</option>
                  <option value="manual">Manual (sin APU)</option>
                  <option value="unknown">APU sin rendimiento</option>
                </select>
              </div>
            )}
            <button type="button" onClick={clearFilters} disabled={!filtersActive} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
              Limpiar filtros
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!clientSafe && noApuCount > 0 && (
              <button type="button" onClick={() => toggleProductivityChip('manual')} aria-pressed={productivityFilter === 'manual'} className={chipClass(productivityFilter === 'manual')}>
                ⚠ {noApuCount} sin APU
              </button>
            )}
            {!clientSafe && noYieldCount > 0 && (
              <button type="button" onClick={() => toggleProductivityChip('unknown')} aria-pressed={productivityFilter === 'unknown'} className={chipClass(productivityFilter === 'unknown')}>
                ⚠ {noYieldCount} sin rendimiento
              </button>
            )}
            <span className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <span>{shownLeafCount} de {totalLeafCount} tareas</span>
              <button type="button" onClick={expandAll} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">Expandir todo</button>
              <button type="button" onClick={collapseAll} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">Colapsar todo</button>
            </span>
          </div>
        </div>

        {/* Lista con scroll interno (no estira la página). */}
        <div className="max-h-[62vh] space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-gray-50/40 p-2">
          {visibleGroups.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500">
              Ninguna tarea coincide con los filtros. <button type="button" onClick={clearFilters} className="underline">Limpiar filtros</button>.
            </p>
          ) : (
            visibleGroups.map(({ group, children }) => {
              const isOpen = filtersActive || !collapsed.has(group.id);
              const agg = chapterAggregate(group.children);
              return (
                <div key={group.id} className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  <button type="button" onClick={() => toggleChapter(group.id)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
                    <ChevronRight className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                    {group.wbsCode !== '—' && <span className="font-mono text-xs text-gray-500">{group.wbsCode}</span>}
                    <span className="truncate font-semibold text-gray-800">{group.name}</span>
                    {!clientSafe && agg.withWarnings > 0 && <span title={`${agg.withWarnings} con advertencia`} className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-label="con advertencias" />}
                    <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-gray-500">
                      <span className="tabular-nums">{agg.completed}/{agg.total}</span>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, agg.progressPct))}%` }} />
                      </span>
                      <span className="w-9 text-right tabular-nums">{agg.progressPct}%</span>
                    </span>
                  </button>
                  {isOpen && children.length > 0 && (
                    <ul className="divide-y divide-gray-100">
                      {children.map((t) => {
                        const isSel = t.id === selectedId;
                        return (
                          <li key={t.id}>
                            <button type="button" onClick={() => setSelectedId(t.id)} aria-pressed={isSel}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${isSel ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}>
                              <span className="w-16 shrink-0 font-mono text-xs text-gray-500">{t.wbsCode}</span>
                              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                {t.isMilestone && <MilestoneIcon className="h-3.5 w-3.5 shrink-0 text-purple-600" aria-label="Hito" />}
                                <span className="truncate font-medium text-gray-900">{t.name}</span>
                                {isDelayed(t) && <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">atrasada</span>}
                                {t.isCritical && <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">crítica</span>}
                              </span>
                              {!clientSafe && <ProductivityDot source={t.productivitySource} />}
                              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600">{formatNumber(t.progressPct, 0)}%</span>
                              <span className="hidden shrink-0 sm:block"><ScheduleStatusBadge status={t.status} /></span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {isOpen && children.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Sin tareas.</p>}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Zona detalle: panel de la tarea seleccionada ───────────────────── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <TaskDetailPanel task={selected} canSeeCriticalPath={canSeeCriticalPath} clientSafe={clientSafe} onRequestEdit={onRequestEdit} />
      </aside>
    </div>
  );
}

function chipClass(active: boolean): string {
  return `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
    active ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
  }`;
}

function ProductivityDot({ source }: { source: string | null | undefined }) {
  const map: Record<string, { color: string; label: string }> = {
    apu: { color: 'bg-emerald-500', label: 'Rendimiento APU' },
    unknown: { color: 'bg-amber-400', label: 'APU sin rendimiento' },
    manual: { color: 'bg-gray-400', label: 'Manual (sin APU)' },
  };
  const m = source ? map[source] : undefined;
  if (!m) return <span className="h-2 w-2 shrink-0" />;
  return <span className={`h-2 w-2 shrink-0 rounded-full ${m.color}`} title={m.label} aria-label={m.label} />;
}

function TaskDetailPanel({
  task,
  canSeeCriticalPath,
  clientSafe,
  onRequestEdit,
}: {
  task: WorkspaceTask | null;
  canSeeCriticalPath: boolean;
  clientSafe: boolean;
  onRequestEdit?: (taskId: string) => void;
}) {
  if (!task) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <p className="text-sm font-medium text-gray-700">Selecciona una tarea</p>
        <p className="mt-1 text-xs text-gray-500">
          {clientSafe ? 'para ver detalle, avance, fechas y responsable.' : 'para ver detalle, avance, duracion, responsable, rendimiento y vinculos BOQ/APU.'}
        </p>
      </div>
    );
  }
  const isActivity = task.taskType === 'activity';
  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{task.wbsCode}</span>
          {task.isMilestone && <Badge variant="secondary">Hito</Badge>}
          {task.isCritical && <Badge variant="warning">Crítica</Badge>}
        </div>
        <h3 className="mt-1 text-base font-semibold text-gray-900">{task.name}</h3>
        {task.chapterName && <p className="text-xs text-gray-500">Capítulo: {task.chapterName}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Field label="Inicio" value={formatDate(task.plannedStart)} />
        <Field label="Fin" value={formatDate(task.plannedEnd)} />
        <Field label="Duración" value={task.isMilestone ? '—' : `${formatNumber(task.plannedDurationDays, 0)} d`} />
        <Field label="Avance" value={`${formatNumber(task.progressPct, 0)}%`} />
        <div>
          <dt className="text-xs text-gray-500">Estado</dt>
          <dd className="mt-0.5"><ScheduleStatusBadge status={task.status} /></dd>
        </div>
        <Field label="Responsable" value={task.responsible ?? '—'} />
        {!clientSafe && (task.crewLabel || task.crewSize) && (
          <Field label="Cuadrilla" value={`${task.crewLabel ?? ''}${task.crewSize ? ` (${formatNumber(task.crewSize, 1)})` : ''}`.trim() || '—'} />
        )}
        {canSeeCriticalPath && task.totalFloatDays !== undefined && (
          <Field label="Holgura" value={`${formatNumber(task.totalFloatDays, 0)} d`} />
        )}
        {!clientSafe && isActivity && (task.quantitySnapshot || task.unitSnapshot) && (
          <Field label="Cantidad" value={`${task.quantitySnapshot ? Number(task.quantitySnapshot).toLocaleString('es-CO') : '—'} ${task.unitSnapshot ?? ''}`.trim()} />
        )}
      </dl>

      {!clientSafe && isActivity && (
        <div>
          <p className="text-xs text-gray-500">Rendimiento y vinculos</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ProductivityTag source={task.productivitySource} />
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${task.boqItemId ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>BOQ {task.boqItemId ? '✓' : '—'}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${task.apuTemplateId ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>APU {task.apuTemplateId ? '✓' : '—'}</span>
          </div>
        </div>
      )}

      {/* Advertencias específicas de la tarea. */}
      {!clientSafe && task.productivitySource === 'manual' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ Sin APU vinculado: duración manual (mínima).</p>
      )}
      {!clientSafe && task.productivitySource === 'unknown' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ APU sin rendimiento laboral usable: duración manual (mínima).</p>
      )}
      {isDelayed(task) && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ Avance por detrás de lo esperado a la fecha.</p>
      )}

      {onRequestEdit && task.taskType !== 'chapter' && (
        <button type="button" onClick={() => onRequestEdit(task.id)} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar esta tarea
        </button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function ProductivityTag({ source }: { source: string | null | undefined }) {
  if (source === 'apu') return <Badge variant="success">Rendimiento APU</Badge>;
  if (source === 'unknown') return <Badge variant="warning">Sin rendimiento</Badge>;
  if (source === 'manual') return <Badge variant="secondary">Manual (sin APU)</Badge>;
  return <span className="text-xs text-gray-400">—</span>;
}
