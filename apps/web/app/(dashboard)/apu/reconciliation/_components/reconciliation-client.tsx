'use client';
/**
 * reconciliation-client.tsx — Tabla interactiva del centro de reconciliación
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1 §7). Cliente.
 *
 * - Selección explícita por checkbox (solo filas con sugerencia/exacta).
 * - Acciones individuales: confirmar, buscar, rechazar, dejar pendiente, limpiar.
 * - Asociación masiva con modal OBLIGATORIO (texto congelado del contrato).
 * - Política de precio (conservar Excel / usar aprobado) aplicada server-side.
 * - CSV sanitizado (string pre-construido server-side).
 * - Las asociaciones existentes nunca se sobrescriben silenciosamente; org y
 *   actor son server-side; el estado se revalida en la RPC.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCOP } from '@/lib/utils/format';
import type {
  ReconciliationFilter,
  ReconciliationRow,
  ReconciliationState,
  ResourceSearchResult,
} from '@/lib/apu-reconciliation/types';
import {
  reconcileBulkAction,
  reconcileComponentAction,
  searchResourcesAction,
  updateReconciliationAction,
} from '../actions';

const STATE_BADGE: Record<ReconciliationState, { label: string; cls: string }> = {
  exact_match: { label: 'Exacta', cls: 'bg-green-100 text-green-700' },
  suggested: { label: 'Sugerido', cls: 'bg-amber-100 text-amber-700' },
  ambiguous: { label: 'Ambiguo', cls: 'bg-orange-100 text-orange-700' },
  unresolved: { label: 'Sin resolver', cls: 'bg-red-100 text-red-700' },
  associated: { label: 'Asociado', cls: 'bg-green-100 text-green-700' },
  intentionally_unresolved: { label: 'Sin asociar', cls: 'bg-gray-100 text-gray-600' },
};

const FILTERS: { value: ReconciliationFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'exact', label: 'Exactos' },
  { value: 'suggested', label: 'Sugerencias' },
  { value: 'ambiguous', label: 'Ambiguos' },
  { value: 'unresolved', label: 'Sin resolver' },
  { value: 'associated', label: 'Asociados' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'intentionally_unresolved', label: 'Sin asociar (consciente)' },
];

function matchesFilter(row: ReconciliationRow, f: ReconciliationFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'exact':
      return row.state === 'exact_match';
    case 'suggested':
      return row.state === 'suggested';
    case 'ambiguous':
      return row.state === 'ambiguous';
    case 'unresolved':
      return row.state === 'unresolved';
    case 'associated':
      return row.state === 'associated';
    case 'intentionally_unresolved':
      return row.state === 'intentionally_unresolved';
    case 'pending':
      return row.state === 'exact_match' || row.state === 'suggested';
    default:
      return true;
  }
}

const BULK_MAX = 50;

export function ReconciliationClient({
  initialRows,
  csv,
  canMutate,
  apuFilter,
}: {
  initialRows: ReconciliationRow[];
  csv: string;
  canMutate: boolean;
  apuFilter: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<ReconciliationFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keepSnapshot, setKeepSnapshot] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searchRow, setSearchRow] = useState<string | null>(null);

  const summary = useMemo(() => {
    const s = { total: 0, associated: 0, exact: 0, suggested: 0, unresolved: 0, ambiguous: 0 };
    for (const r of initialRows) {
      s.total += 1;
      if (r.state === 'associated') s.associated += 1;
      else if (r.state === 'exact_match') s.exact += 1;
      else if (r.state === 'suggested') s.suggested += 1;
      else if (r.state === 'unresolved') s.unresolved += 1;
      else if (r.state === 'ambiguous') s.ambiguous += 1;
    }
    return s;
  }, [initialRows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRows.filter(
      (r) =>
        matchesFilter(r, filter) &&
        (q === '' ||
          r.description.toLowerCase().includes(q) ||
          r.apuCode.toLowerCase().includes(q) ||
          (r.rawCode ?? '').toLowerCase().includes(q)),
    );
  }, [initialRows, filter, query]);

  // Solo filas con sugerencia/exacta son seleccionables para bulk.
  const selectableIds = useMemo(
    () => visible.filter((r) => r.primaryCandidate !== null && (r.state === 'exact_match' || r.state === 'suggested')).map((r) => r.componentId),
    [visible],
  );
  const selectedRows = initialRows.filter((r) => selected.has(r.componentId) && r.primaryCandidate);

  function refresh() {
    setSelected(new Set());
    router.refresh();
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setMessage(okMsg);
        refresh();
      } else {
        setMessage(res.error ?? 'Error');
      }
    });
  }

  function confirmRow(row: ReconciliationRow, resourceId: string) {
    const fd = new FormData();
    fd.set('componentId', row.componentId);
    fd.set('resourceId', resourceId);
    fd.set('keepSnapshot', String(keepSnapshot));
    run(() => reconcileComponentAction(fd), 'Componente asociado.');
  }

  function updateRow(row: ReconciliationRow, action: 'reject' | 'leave_pending' | 'clear') {
    const fd = new FormData();
    fd.set('componentId', row.componentId);
    fd.set('action', action);
    const label = action === 'clear' ? 'Asociación eliminada.' : action === 'reject' ? 'Sugerencia rechazada.' : 'Dejado pendiente.';
    run(() => updateReconciliationAction(fd), label);
  }

  function runBulk() {
    const pairs = selectedRows.map((r) => ({ componentId: r.componentId, resourceId: r.primaryCandidate!.resourceId }));
    const fd = new FormData();
    fd.set('pairs', JSON.stringify(pairs));
    fd.set('keepSnapshot', String(keepSnapshot));
    setBulkOpen(false);
    run(() => reconcileBulkAction(fd), `Asociación masiva ejecutada (${pairs.length}).`);
  }

  function downloadCsv() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reconciliacion-apu.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Resumen */}
      <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Componentes" value={summary.total} />
        <Stat label="Asociados" value={summary.associated} tone="green" />
        <Stat label="Exactos" value={summary.exact} tone="green" />
        <Stat label="Sugerencias" value={summary.suggested} tone="amber" />
        <Stat label="Sin resolver" value={summary.unresolved} tone="red" />
        <Stat label="Ambiguos" value={summary.ambiguous} tone="amber" />
      </div>

      {apuFilter && (
        <p className="mb-3 text-sm text-gray-500">
          Filtrado por un APU. <Link href="/apu/reconciliation" className="text-blue-700 hover:underline">Ver todos</Link>
        </p>
      )}

      {/* Controles */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar componente, APU o código…"
            className="h-9 w-72 rounded-md border border-gray-300 pl-8 pr-3 text-sm"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ReconciliationFilter)}
          className="h-9 rounded-md border border-gray-300 px-2 text-sm"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        {canMutate && (
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={keepSnapshot} onChange={(e) => setKeepSnapshot(e.target.checked)} />
            Conservar precio del Excel
          </label>
        )}
        <Button size="sm" variant="outline" onClick={downloadCsv}>
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
        {canMutate && (
          <Button
            size="sm"
            disabled={selectedRows.length === 0 || isPending}
            onClick={() => setBulkOpen(true)}
          >
            Asociar seleccionadas ({selectedRows.length})
          </Button>
        )}
      </div>

      {message && (
        <p className="mb-3 rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">{message}</p>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
              {canMutate && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los seleccionables"
                    checked={selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) selectableIds.slice(0, BULK_MAX).forEach((id) => next.add(id));
                      else selectableIds.forEach((id) => next.delete(id));
                      setSelected(next);
                    }}
                  />
                </th>
              )}
              <th className="px-3 py-2 font-medium">APU</th>
              <th className="px-3 py-2 font-medium">Componente</th>
              <th className="px-3 py-2 font-medium">Unidad</th>
              <th className="px-3 py-2 font-medium">Sugerencia / recurso</th>
              <th className="px-3 py-2 font-medium">Razón</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              {canMutate && <th className="px-3 py-2 font-medium text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const selectable = row.primaryCandidate !== null && (row.state === 'exact_match' || row.state === 'suggested');
              const badge = STATE_BADGE[row.state];
              return (
                <RowView
                  key={row.componentId}
                  row={row}
                  badge={badge}
                  canMutate={canMutate}
                  selectable={selectable}
                  checked={selected.has(row.componentId)}
                  onToggle={(checked) => {
                    const next = new Set(selected);
                    if (checked) {
                      if (next.size >= BULK_MAX) {
                        setMessage(`Máximo ${BULK_MAX} por operación.`);
                        return;
                      }
                      next.add(row.componentId);
                    } else next.delete(row.componentId);
                    setSelected(next);
                  }}
                  isPending={isPending}
                  searchOpen={searchRow === row.componentId}
                  onToggleSearch={() => setSearchRow(searchRow === row.componentId ? null : row.componentId)}
                  onConfirm={(rid) => confirmRow(row, rid)}
                  onUpdate={(a) => updateRow(row, a)}
                />
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">
                  Sin componentes para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal bulk (texto congelado) */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">Confirmar asociaciones</h2>
            <p className="text-sm text-gray-600">
              Vas a asociar <strong>{selectedRows.length}</strong> componentes APU con recursos del catálogo.
            </p>
            <p className="mt-2 text-sm text-gray-600">La operación quedará registrada.</p>
            <p className="mt-2 text-sm text-gray-600">
              Las asociaciones existentes no se sobrescribirán silenciosamente.
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Política de precio: {keepSnapshot ? 'conservar precio del Excel' : 'usar precio aprobado del catálogo'}.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={runBulk} disabled={isPending}>Confirmar asociaciones</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowView({
  row,
  badge,
  canMutate,
  selectable,
  checked,
  onToggle,
  isPending,
  searchOpen,
  onToggleSearch,
  onConfirm,
  onUpdate,
}: {
  row: ReconciliationRow;
  badge: { label: string; cls: string };
  canMutate: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  isPending: boolean;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onConfirm: (resourceId: string) => void;
  onUpdate: (action: 'reject' | 'leave_pending' | 'clear') => void;
}) {
  const candidate = row.primaryCandidate;
  return (
    <>
      <tr className="border-b last:border-b-0 align-top">
        {canMutate && (
          <td className="px-3 py-2">
            {selectable ? (
              <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} aria-label={`Seleccionar ${row.description}`} />
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </td>
        )}
        <td className="px-3 py-2">
          <span className="font-mono text-xs text-gray-500">{row.apuCode}</span>
          <span className="block text-xs text-gray-400">{row.apuName}</span>
        </td>
        <td className="px-3 py-2">
          {row.description || row.rawCode || '—'}
          <span className="ml-1 text-xs text-gray-400">{row.componentType}</span>
        </td>
        <td className="px-3 py-2 text-gray-600">{row.rawUnit ?? '—'}</td>
        <td className="px-3 py-2">
          {row.associatedResourceCode ? (
            <span>
              <span className="font-mono text-xs text-gray-500">{row.associatedResourceCode}</span> {row.associatedResourceName}
            </span>
          ) : candidate ? (
            <span>
              <span className="font-mono text-xs text-gray-500">{candidate.code}</span> {candidate.name}
              {candidate.unitMismatch && <span className="ml-1 text-xs text-orange-600">(unidad difiere)</span>}
            </span>
          ) : row.candidates.length > 0 ? (
            <span className="text-xs text-orange-600">{row.candidates.length} candidatos</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500">{row.matchReason}</td>
        <td className="px-3 py-2">
          <Badge variant="secondary" className={badge.cls}>{badge.label}</Badge>
        </td>
        {canMutate && (
          <td className="px-3 py-2">
            <div className="flex flex-wrap justify-end gap-1">
              {candidate && (row.state === 'exact_match' || row.state === 'suggested') && (
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => onConfirm(candidate.resourceId)}>
                  Confirmar
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={isPending} onClick={onToggleSearch}>
                Buscar
              </Button>
              {(row.state === 'exact_match' || row.state === 'suggested') && (
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onUpdate('reject')}>
                  Rechazar
                </Button>
              )}
              {row.state !== 'associated' && row.state !== 'intentionally_unresolved' && (
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onUpdate('leave_pending')}>
                  Dejar pendiente
                </Button>
              )}
              {row.state === 'associated' && (
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onUpdate('clear')}>
                  Limpiar
                </Button>
              )}
            </div>
          </td>
        )}
      </tr>
      {searchOpen && canMutate && (
        <tr className="border-b bg-gray-50/60">
          <td colSpan={canMutate ? 8 : 7} className="px-3 py-3">
            <ResourceSearchPanel
              rawUnit={row.rawUnit}
              onPick={(rid) => onConfirm(rid)}
              onClose={onToggleSearch}
            />
            <p className="mt-2 text-xs text-gray-400">
              ¿No existe el recurso?{' '}
              <Link href="/catalog/resources/new" target="_blank" className="text-blue-700 hover:underline">
                Crear recurso nuevo
              </Link>{' '}
              y recargar.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function ResourceSearchPanel({
  rawUnit,
  onPick,
  onClose,
}: {
  rawUnit: string | null;
  onPick: (resourceId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ResourceSearchResult[]>([]);
  const [pending, startTransition] = useTransition();

  function search() {
    const fd = new FormData();
    fd.set('query', q);
    if (rawUnit) fd.set('rawUnit', rawUnit);
    startTransition(async () => {
      const res = await searchResourcesAction(fd);
      setResults(res.ok ? res.results : []);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Nombre o código del recurso…"
          className="h-8 w-64 rounded-md border border-gray-300 px-2 text-sm"
        />
        <Button size="sm" variant="outline" disabled={pending} onClick={search}>Buscar</Button>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 divide-y rounded-md border bg-white">
          {results.map((r) => (
            <li key={r.resourceId} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <span>
                <span className="font-mono text-xs text-gray-500">{r.code}</span> {r.name}
                <span className="ml-1 text-xs text-gray-400">({r.unit})</span>
                {r.approvedBaselinePrice && (
                  <span className="ml-2 text-xs text-gray-400">{formatCOP(r.approvedBaselinePrice)}</span>
                )}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onPick(r.resourceId)}>Asociar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' }) {
  const cls =
    tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-gray-900';
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
