'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FilterPills, type FilterPillOption } from '@/components/shared/filter-pills';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import type { ResourcePriceHistoryRow, ObservationStatus, PriceHistoryOrigin } from '@/server/pricing';
import { formatCOP } from '@/lib/utils/format';

type StatusFilter = 'all' | ObservationStatus;
type OriginFilter = 'all' | PriceHistoryOrigin;

const STATUS_OPTIONS: FilterPillOption[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'rejected', label: 'Rechazada' },
  { value: 'expired', label: 'Expirada' },
];

const ORIGIN_OPTIONS: FilterPillOption[] = [
  { value: 'all', label: 'Todos' },
  { value: 'manual', label: 'Manual' },
  { value: 'batch', label: 'Lote' },
  { value: 'monitor', label: 'Monitor' },
];

const STATUS_LABEL: Record<ObservationStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

const ORIGIN_LABEL: Record<PriceHistoryOrigin, string> = {
  manual: 'Manual',
  batch: 'Lote',
  monitor: 'Monitor',
};

const STATUS_VARIANT: Record<ObservationStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  expired: 'outline',
};

function formatDateTime(value: string | null): string {
  if (!value) return 'Sin dato';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function money(value: string | null, currency: string | null): string {
  if (!value) return 'Oculto';
  if (currency === 'COP' || !currency) return formatCOP(value);
  return `${value} ${currency}`;
}

function pct(value: string | null): string {
  if (!value) return 'Oculto';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `${n.toFixed(2)}%`;
}

function delta(row: ResourcePriceHistoryRow): string {
  if (!row.previousApprovedPrice || !row.deltaAbs || !row.deltaPct) return 'Sin precio anterior aprobado para comparar';
  const sign = Number(row.deltaAbs) > 0 ? '+' : '';
  return `${sign}${money(row.deltaAbs, row.currency)} (${sign}${pct(row.deltaPct)})`;
}

function originBadge(row: ResourcePriceHistoryRow) {
  const variant = row.origin === 'monitor' ? 'warning' : row.origin === 'batch' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{ORIGIN_LABEL[row.origin]}</Badge>;
}

function statusBadge(status: ObservationStatus) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

function Detail({ row, showInternalFields }: { row: ResourcePriceHistoryRow; showInternalFields: boolean }) {
  const sourceReference = row.origin === 'batch' ? (row.importBatchSourceReference ?? row.sourceReference) : row.sourceReference;
  return (
    <div className="grid gap-3 rounded-md bg-gray-50 p-3 text-xs text-gray-600 dark:bg-surface-soft dark:text-content-muted sm:grid-cols-2 lg:grid-cols-3">
      <DetailItem label="Precio observado" value={showInternalFields ? money(row.observedPrice, row.currency) : 'Oculto'} />
      <DetailItem label="Descuento" value={showInternalFields ? pct(row.discountPercent) : 'Oculto'} />
      <DetailItem label="Neto sugerido" value={showInternalFields ? money(row.suggestedNetPrice, row.currency) : 'Oculto'} />
      <DetailItem label="source_type" value={showInternalFields ? (row.sourceType ?? 'Sin fuente registrada') : 'Oculto'} />
      <DetailItem label="source_reference" value={showInternalFields ? (sourceReference ?? 'Sin fuente registrada') : 'Oculto'} />
      <DetailItem label="Lote/import batch" value={showInternalFields ? (row.importBatchLabel ?? row.importBatchId ?? 'Sin lote') : 'Oculto'} />
      <DetailItem label="Monitor checked_at" value={row.monitorResultId ? formatDateTime(row.monitorCheckedAt) : 'Sin monitor'} />
      <DetailItem label="Monitor status" value={row.monitorResultStatus ?? 'Sin monitor'} />
      <DetailItem label="approved_at" value={row.approvedAt ? formatDateTime(row.approvedAt) : 'Sin aprobacion'} />
      <DetailItem label="valid_until" value={row.validUntil ? formatDateTime(row.validUntil) : 'Sin vigencia'} />
      <DetailItem
        label="rejection_reason"
        value={row.status === 'rejected' ? (showInternalFields ? (row.rejectionReason ?? 'Rechazada (sin motivo registrado)') : 'Oculto') : 'No aplica'}
      />
      <DetailItem label="notes" value={showInternalFields ? (row.notes ?? 'Sin notas') : 'Oculto'} />
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="font-medium text-gray-700 dark:text-content">Monitor warnings</p>
        <p>{showInternalFields ? (row.monitorWarnings.length > 0 ? row.monitorWarnings.join(', ') : 'Sin alertas del monitor') : 'Oculto'}</p>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="font-medium text-gray-700 dark:text-content">Comparación derivada (referencial no es baseline histórica exacta)</p>
        <p>{showInternalFields ? delta(row) : 'Oculto'}</p>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-gray-700 dark:text-content">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  );
}

export function PriceHistoryTable({ rows, showInternalFields }: { rows: ResourcePriceHistoryRow[]; showInternalFields: boolean }) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [supplier, setSupplier] = useState('all');

  const supplierOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((row) => row.supplierName).filter((name): name is string => Boolean(name)))).sort();
    return names;
  }, [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (origin !== 'all' && row.origin !== origin) return false;
    if (supplier !== 'all' && row.supplierName !== supplier) return false;
    return true;
  }), [origin, rows, status, supplier]);

  const clear = () => {
    setStatus('all');
    setOrigin('all');
    setSupplier('all');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white p-3 dark:border-line dark:bg-surface">
        <FilterPills label="Estado" ariaLabel="Filtrar por estado" options={STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as StatusFilter)} />
        <FilterPills label="Origen" ariaLabel="Filtrar por origen" options={ORIGIN_OPTIONS} value={origin} onChange={(v) => setOrigin(v as OriginFilter)} tone="ink" />
        <label className="flex min-w-[180px] items-center gap-2 text-xs text-gray-500">
          Proveedor
          <Select value={supplier} onChange={(event) => setSupplier(event.target.value)} className="h-8 text-xs">
            <option value="all">Todos</option>
            {supplierOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </label>
        <span className="ml-auto text-xs font-medium text-gray-500">{filtered.length} de {rows.length}</span>
        <Button type="button" size="sm" variant="outline" onClick={clear}>Limpiar filtros</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-500 dark:border-line dark:bg-surface">
          Ningún registro coincide con los filtros
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-md border border-gray-200 bg-white dark:border-line dark:bg-surface lg:block">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-500 dark:bg-surface-soft dark:text-content-muted">
                <tr>
                  <th className="px-3 py-2">Fecha observada</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">Neto sugerido</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Delta derivada</th>
                  <th className="px-3 py-2 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top dark:border-line/60">
                    <td colSpan={7} className="p-0">
                      <details className="group">
                        <summary className="grid cursor-pointer list-none grid-cols-7 items-center gap-2 px-3 py-2 marker:hidden hover:bg-gray-50 dark:hover:bg-surface-soft">
                          <span>{formatDateTime(row.observedAt)}</span>
                          <span className="truncate">{showInternalFields ? (row.supplierName ?? 'Sin proveedor') : 'Oculto'}</span>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-content">{showInternalFields ? money(row.suggestedNetPrice, row.currency) : 'Oculto'}</span>
                          <span>{statusBadge(row.status)}</span>
                          <span>{originBadge(row)}</span>
                          <span className="truncate">{showInternalFields ? delta(row) : 'Oculto'}</span>
                          <span className="flex justify-end text-iconic-primary"><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></span>
                        </summary>
                        <div className="border-t border-gray-100 px-3 py-3 dark:border-line/60"><Detail row={row} showInternalFields={showInternalFields} /></div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 lg:hidden">
            {filtered.map((row) => (
              <details key={row.id} className="group rounded-md border border-gray-200 bg-white p-3 dark:border-line dark:bg-surface">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:hidden">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">{statusBadge(row.status)}{originBadge(row)}</div>
                    <p className="text-sm font-medium text-gray-900 dark:text-content">{formatDateTime(row.observedAt)}</p>
                    <p className="text-xs text-gray-500">{showInternalFields ? (row.supplierName ?? 'Sin proveedor') : 'Oculto'}</p>
                    <p className="text-sm font-semibold tabular-nums">{showInternalFields ? money(row.suggestedNetPrice, row.currency) : 'Oculto'}</p>
                  </div>
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-iconic-primary transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3"><Detail row={row} showInternalFields={showInternalFields} /></div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}