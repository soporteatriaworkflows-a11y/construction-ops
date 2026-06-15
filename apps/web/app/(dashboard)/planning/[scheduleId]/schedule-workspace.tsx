/**
 * schedule-workspace.tsx — Workspace navegable del detalle de cronograma
 * (SCHEDULE_WORKSPACE_UX_V1, Fase 1). SOLO UX/presentación.
 *
 * Componente CLIENTE puro de presentación: recibe las tareas YA computadas por
 * el servidor (view-model + trazabilidad) y aporta toolbar (búsqueda/filtros),
 * capítulos colapsables, chips de advertencias accionables y tabla compacta.
 * NO toca el generador, el preview, la creación, el cálculo de duración ni el
 * read-model: solo reorganiza la presentación de datos ya entregados.
 */
'use client';

import { useMemo, useState } from 'react';
import { Milestone as MilestoneIcon, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScheduleStatusBadge } from '@/components/planning/schedule-status-badge';
import { formatDate, formatNumber } from '@/lib/utils/format';
import {
  groupByChapter,
  computeVisibleGroups,
  warningCounts,
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
}

export function ScheduleWorkspace({ tasks, canSeeCriticalPath }: Props) {
  const groups = useMemo(() => groupByChapter(tasks), [tasks]);

  const [search, setSearch] = useState('');
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [productivityFilter, setProductivityFilter] = useState<ProductivityFilter>('all');
  // Por defecto TODO colapsado: la pantalla abre mostrando solo los capítulos.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groups.map((g) => g.id)));

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

  const clearFilters = () => {
    setSearch('');
    setChapterFilter('all');
    setStatusFilter('all');
    setProductivityFilter('all');
  };

  const toggleChapter = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(groups.map((g) => g.id)));

  const toggleProductivityChip = (value: ProductivityFilter) => {
    setProductivityFilter((prev) => (prev === value ? 'all' : value));
  };

  const colCount = 8 + (canSeeCriticalPath ? 2 : 0);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="rounded-md border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="wsSearch" className="mb-1 block text-xs font-medium text-gray-600">
              Buscar (WBS, código o tarea)
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input
                id="wsSearch"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej. 01.003 o Excavación"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label htmlFor="wsChapter" className="mb-1 block text-xs font-medium text-gray-600">Capítulo</label>
            <select
              id="wsChapter"
              value={chapterFilter}
              onChange={(e) => setChapterFilter(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos los capítulos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.wbsCode === '—' ? g.name : `${g.wbsCode} · ${g.name}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wsStatus" className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
            <select
              id="wsStatus"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="not_started">Sin iniciar</option>
              <option value="in_progress">En progreso</option>
              <option value="completed">Completadas</option>
              <option value="delayed">Atrasadas</option>
            </select>
          </div>
          <div>
            <label htmlFor="wsProd" className="mb-1 block text-xs font-medium text-gray-600">Rendimiento</label>
            <select
              id="wsProd"
              value={productivityFilter}
              onChange={(e) => setProductivityFilter(e.target.value as ProductivityFilter)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="apu">Con rendimiento APU</option>
              <option value="manual">Manual (sin APU)</option>
              <option value="unknown">APU sin rendimiento</option>
            </select>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Limpiar filtros
          </button>
        </div>

        {/* Chips de advertencias accionables + controles de colapso */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {noApuCount > 0 && (
            <button
              type="button"
              onClick={() => toggleProductivityChip('manual')}
              aria-pressed={productivityFilter === 'manual'}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                productivityFilter === 'manual'
                  ? 'border-amber-400 bg-amber-100 text-amber-900'
                  : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              ⚠ {noApuCount} sin APU
            </button>
          )}
          {noYieldCount > 0 && (
            <button
              type="button"
              onClick={() => toggleProductivityChip('unknown')}
              aria-pressed={productivityFilter === 'unknown'}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                productivityFilter === 'unknown'
                  ? 'border-amber-400 bg-amber-100 text-amber-900'
                  : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              ⚠ {noYieldCount} sin rendimiento
            </button>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            <span>{shownLeafCount} de {totalLeafCount} tareas</span>
            <button type="button" onClick={expandAll} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">
              Expandir todo
            </button>
            <button type="button" onClick={collapseAll} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">
              Colapsar todo
            </button>
          </span>
        </div>
      </div>

      {/* Lista de capítulos colapsables con tabla compacta */}
      {visibleGroups.length === 0 ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
          Ninguna tarea coincide con los filtros. <button type="button" onClick={clearFilters} className="underline">Limpiar filtros</button>.
        </p>
      ) : (
        visibleGroups.map(({ group, children }) => {
          // Con filtros activos, mostrar siempre el contenido encontrado.
          const isOpen = filtersActive || !collapsed.has(group.id);
          const done = children.filter((c) => c.status === 'completed').length;
          return (
            <div key={group.id} className="overflow-hidden rounded-md border border-gray-200">
              <button
                type="button"
                onClick={() => toggleChapter(group.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                />
                {group.wbsCode !== '—' && (
                  <span className="font-mono text-xs text-gray-500">{group.wbsCode}</span>
                )}
                <span className="font-semibold text-gray-800">{group.name}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {children.length} tarea(s){children.length > 0 ? ` · ${done} completada(s)` : ''}
                </span>
              </button>
              {isOpen && children.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2">WBS</th>
                        <th className="px-3 py-2">Tarea</th>
                        <th className="px-3 py-2">Inicio</th>
                        <th className="px-3 py-2">Fin</th>
                        <th className="px-3 py-2 text-right">Dur. (d)</th>
                        <th className="px-3 py-2 text-right">Avance</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2">Rendimiento</th>
                        {canSeeCriticalPath && (
                          <>
                            <th className="px-3 py-2 text-right">Holgura</th>
                            <th className="px-3 py-2">Crítica</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {children.map((t) => (
                        <tr key={t.id} className={t.isCritical ? 'bg-red-50/40' : undefined}>
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-gray-500">{t.wbsCode}</td>
                          <td className="px-3 py-1.5">
                            <span className="flex items-center gap-1.5">
                              {t.isMilestone && <MilestoneIcon className="h-3.5 w-3.5 shrink-0 text-purple-600" aria-label="Hito" />}
                              <span className="font-medium text-gray-900">{t.name}</span>
                              {isDelayed(t) && (
                                <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">atrasada</span>
                              )}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{formatDate(t.plannedStart)}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{formatDate(t.plannedEnd)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                            {t.isMilestone ? '—' : formatNumber(t.plannedDurationDays, 0)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">
                            {formatNumber(t.progressPct, 0)}%
                          </td>
                          <td className="px-3 py-1.5"><ScheduleStatusBadge status={t.status} /></td>
                          <td className="px-3 py-1.5"><ProductivityTag source={t.productivitySource} /></td>
                          {canSeeCriticalPath && (
                            <>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                                {t.totalFloatDays !== undefined ? formatNumber(t.totalFloatDays, 0) : '—'}
                              </td>
                              <td className="px-3 py-1.5">
                                {t.isCritical ? (
                                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Crítica</span>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isOpen && children.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Sin tareas en este capítulo.</p>
              )}
              <span className="sr-only">{colCount} columnas</span>
            </div>
          );
        })
      )}
    </div>
  );
}

/** Indicador compacto de rendimiento/APU (no es badge de estado). */
function ProductivityTag({ source }: { source: string | null }) {
  if (source === 'apu') return <Badge variant="success">APU</Badge>;
  if (source === 'unknown') return <Badge variant="warning">Sin rend.</Badge>;
  if (source === 'manual') return <Badge variant="secondary">Manual</Badge>;
  return <span className="text-xs text-gray-400">—</span>;
}
