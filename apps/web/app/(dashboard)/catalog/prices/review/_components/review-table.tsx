/**
 * review-table.tsx — Tabla interactiva del Centro de Revisión de Precios.
 * Client Component. Propiedad: agent-frontend-boq / agent-pricing.
 *
 * La selección es EXPLÍCITA (checkbox por fila); la aprobación exige modal de
 * confirmación con clave de idempotencia generada al abrirlo. Los cálculos y
 * la autorización reales viven server-side (actions + RLS).
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Download, Radar, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildSanitizedCsv } from '@/lib/catalog-import/csv';
import { formatCOP } from '@/lib/utils/format';
import type {
  BulkReviewResult,
  PendingReviewObservationView,
  ReviewBatchView,
} from '@/server/pricing/review/types';
import { bulkApproveAction, bulkRejectAction } from '../actions';

const SOURCE_LABELS: Record<string, string> = {
  official_api: 'API oficial',
  official_feed: 'Feed oficial',
  supplier_csv: 'Lista de proveedor',
  manual: 'Manual / Excel revisado',
  public_web: 'Web pública',
  invoice: 'Factura',
  quotation: 'Cotización',
};

type WarningFilter = 'all' | 'with' | 'without';

interface Props {
  observations: PendingReviewObservationView[];
  batches: ReviewBatchView[];
  canReview: boolean;
  maxBulkRows: number;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso));
}

function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReviewTable({ observations, batches, canReview, maxBulkRows }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [warningFilter, setWarningFilter] = useState<WarningFilter>('all');
  const [onlySelected, setOnlySelected] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [modal, setModal] = useState<{ action: 'approve' | 'reject'; key: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [result, setResult] = useState<BulkReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const suppliers = useMemo(() => {
    const set = new Map<string, string>();
    for (const o of observations) {
      if (o.supplierName) set.set(o.supplierName, o.supplierName);
    }
    return [...set.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [observations]);

  const filtered = useMemo(() => {
    return observations.filter((o) => {
      if (batchFilter === 'none' && o.importBatchId !== null) return false;
      if (batchFilter === 'monitor' && !o.fromMonitor) return false;
      if (
        batchFilter !== 'all' &&
        batchFilter !== 'none' &&
        batchFilter !== 'monitor' &&
        o.importBatchId !== batchFilter
      ) {
        return false;
      }
      if (supplierFilter !== 'all' && (o.supplierName ?? '—') !== supplierFilter) return false;
      if (sourceFilter !== 'all' && o.sourceType !== sourceFilter) return false;
      if (warningFilter === 'with' && o.warnings.length === 0) return false;
      if (warningFilter === 'without' && o.warnings.length > 0) return false;
      if (onlySelected && !selected.has(o.id)) return false;
      if (dateFrom && o.observedAt.slice(0, 10) < dateFrom) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !o.resourceCode.toLowerCase().includes(q) &&
          !o.resourceName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    observations,
    batchFilter,
    supplierFilter,
    sourceFilter,
    warningFilter,
    onlySelected,
    selected,
    search,
    dateFrom,
  ]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllValid = () => {
    // "Válidas" = pendientes visibles con el filtro actual (las advertencias
    // no críticas no excluyen; la usuaria decide conscientemente).
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of filtered) {
        if (next.size >= maxBulkRows && !next.has(o.id)) break;
        next.add(o.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const openModal = (action: 'approve' | 'reject') => {
    setError(null);
    setResult(null);
    setRejectionReason('');
    setModal({ action, key: crypto.randomUUID() });
  };

  const confirmModal = () => {
    if (!modal) return;
    const ids = [...selected];
    const formData = new FormData();
    formData.set('observationIds', JSON.stringify(ids));
    formData.set('idempotencyKey', modal.key);
    if (modal.action === 'reject') formData.set('rejectionReason', rejectionReason);
    startTransition(async () => {
      const action = modal.action === 'approve' ? bulkApproveAction : bulkRejectAction;
      const res = await action(formData);
      setModal(null);
      if (res.ok) {
        setResult(res.result);
        setSelected(new Set());
      } else {
        setError(res.error);
      }
    });
  };

  const downloadPendingCsv = () => {
    const csv = buildSanitizedCsv(
      ['Código', 'Recurso', 'Proveedor', 'Precio observado', 'Descuento %', 'Precio neto sugerido', 'Unidad', 'Unidad recurso', 'Moneda', 'Fuente', 'Lote', 'Fecha', 'Advertencias'],
      filtered.map((o) => [
        o.resourceCode,
        o.resourceName,
        o.supplierName ?? '',
        o.observedPrice,
        o.discountPercent,
        o.suggestedNetPrice,
        o.unit,
        o.resourceUnit,
        o.currency,
        SOURCE_LABELS[o.sourceType] ?? o.sourceType,
        o.batchLabel ?? (o.fromMonitor ? 'Monitor automático' : ''),
        o.observedAt.slice(0, 10),
        o.warnings.map((w) => w.message).join(' / '),
      ]),
    );
    downloadCsv('revision-precios-pendientes.csv', csv);
  };

  const selectedCount = selected.size;
  const overLimit = selectedCount > maxBulkRows;

  return (
    <div>
      {/* Filtros */}
      <section
        aria-label="Filtros"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Lote / procedencia
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="all">Todos</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label ?? b.id.slice(0, 8)} ({b.pendingCount} pend.)
              </option>
            ))}
            <option value="monitor">Detectadas por el monitor</option>
            <option value="none">Sin lote (manuales / históricas)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Proveedor
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="all">Todos</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Fuente
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="all">Todas</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Advertencias
          <select
            value={warningFilter}
            onChange={(e) => setWarningFilter(e.target.value as WarningFilter)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="all">Todas</option>
            <option value="with">Con advertencias</option>
            <option value="without">Sin advertencias</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Desde (fecha observación)
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Recurso
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Código o nombre…"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
          />
          Solo seleccionadas
        </label>
      </section>

      {/* Barra de acciones */}
      <section
        aria-label="Acciones masivas"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
      >
        <span className="text-sm text-gray-600">
          <strong className="tabular-nums">{selectedCount}</strong> seleccionada(s) de{' '}
          <strong className="tabular-nums">{filtered.length}</strong> visibles
        </span>
        {overLimit && (
          <span className="text-xs text-red-600">
            Máximo {maxBulkRows} filas por acción. Reduce la selección.
          </span>
        )}
        <span className="grow" />
        <Button size="sm" variant="outline" onClick={selectAllValid} disabled={!canReview}>
          Seleccionar todas las válidas
        </Button>
        <Button size="sm" variant="outline" onClick={clearSelection} disabled={selectedCount === 0}>
          Desmarcar todas
        </Button>
        <Button size="sm" variant="outline" onClick={downloadPendingCsv} disabled={filtered.length === 0}>
          <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Reporte CSV
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openModal('reject')}
          disabled={!canReview || selectedCount === 0 || overLimit || isPending}
        >
          <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Rechazar seleccionadas
        </Button>
        <Button
          size="sm"
          onClick={() => openModal('approve')}
          disabled={!canReview || selectedCount === 0 || overLimit || isPending}
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Aprobar seleccionadas
        </Button>
      </section>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Resultado de la última acción */}
      {result && (
        <div
          className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          <p className="font-medium">
            {result.actionType === 'approve' ? 'Aprobación' : 'Rechazo'} masivo completado
            {result.alreadyExecuted ? ' (acción ya ejecutada previamente — sin cambios nuevos)' : ''}.
          </p>
          <p className="mt-1">
            {result.actionType === 'approve' ? 'Aprobadas' : 'Rechazadas'}:{' '}
            <strong className="tabular-nums">{result.succeededCount}</strong> · Omitidas:{' '}
            <strong className="tabular-nums">{result.skippedCount}</strong> · Seleccionadas:{' '}
            <strong className="tabular-nums">{result.selectedCount}</strong>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => downloadCsv('resultado-revision-precios.csv', result.reportCsv)}
          >
            <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Descargar reporte de la acción
          </Button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm" aria-label="Observaciones pendientes de revisión">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-3 py-2">
                <span className="sr-only">Seleccionar</span>
              </th>
              <th className="px-3 py-2">Recurso</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2 text-right">Precio observado</th>
              <th className="px-3 py-2 text-right">Desc. %</th>
              <th className="px-3 py-2 text-right">Neto sugerido</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Fuente</th>
              <th className="px-3 py-2">Lote</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Advertencias</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-sm text-gray-500">
                  No hay observaciones pendientes con el filtro actual.
                </td>
              </tr>
            )}
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar ${o.resourceCode}`}
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                    disabled={!canReview}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/catalog/resources/${o.resourceId}/price-intelligence`}
                    className="font-medium text-iconic-primary hover:underline"
                  >
                    {o.resourceCode}
                  </Link>
                  <p className="max-w-[220px] truncate text-xs text-gray-500" title={o.resourceName}>
                    {o.resourceName}
                  </p>
                </td>
                <td className="px-3 py-2 text-gray-600">{o.supplierName ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(o.observedPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{o.discountPercent}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCOP(o.suggestedNetPrice)}</td>
                <td className="px-3 py-2 text-gray-600">
                  {o.unit}
                  {o.unit !== o.resourceUnit && (
                    <span className="block text-xs text-gray-400">recurso: {o.resourceUnit}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="text-xs text-gray-600">{SOURCE_LABELS[o.sourceType] ?? o.sourceType}</span>
                  {o.fromMonitor && (
                    <Badge variant="warning" className="ml-1">
                      <Radar className="mr-0.5 h-3 w-3" aria-hidden="true" />
                      Monitor
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="block max-w-[180px] truncate text-xs text-gray-500" title={o.batchLabel ?? ''}>
                    {o.batchLabel ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{formatDate(o.observedAt)}</td>
                <td className="px-3 py-2">
                  {o.warnings.length === 0 ? (
                    <span className="text-xs text-gray-400">—</span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-amber-700"
                      title={o.warnings.map((w) => w.message).join(' · ')}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      {o.warnings.length}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/catalog/resources/${o.resourceId}/price-intelligence`}
                    className="text-xs text-iconic-primary hover:underline"
                  >
                    Revisar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmación obligatorio */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-confirm-title"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="bulk-confirm-title" className="text-lg font-semibold text-iconic-ink">
              {modal.action === 'approve' ? 'Confirmar aprobación masiva' : 'Confirmar rechazo masivo'}
            </h2>
            {modal.action === 'approve' ? (
              <p className="mt-2 text-sm text-gray-600">
                Vas a aprobar <strong className="tabular-nums">{selectedCount}</strong> observaciones
                pendientes. Estas observaciones pasarán a ser el baseline aprobado para futuras
                comparaciones. La acción quedará registrada.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-gray-600">
                  Vas a rechazar <strong className="tabular-nums">{selectedCount}</strong> observaciones
                  pendientes. La acción quedará registrada.
                </p>
                <label className="mt-3 block text-xs font-medium text-gray-600">
                  Motivo de rechazo (obligatorio)
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModal(null)} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                onClick={confirmModal}
                disabled={isPending || (modal.action === 'reject' && rejectionReason.trim() === '')}
              >
                {isPending
                  ? 'Procesando…'
                  : modal.action === 'approve'
                    ? 'Confirmar aprobación'
                    : 'Confirmar rechazo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
