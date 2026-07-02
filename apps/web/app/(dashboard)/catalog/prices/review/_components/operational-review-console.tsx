'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Activity, ExternalLink, FilterX, Radar, Search, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OperationalReviewConsole as ConsoleData, OperationalReviewItem, OperationalReviewSeverity } from '@/server/pricing/review';

type SeverityFilter = 'all' | OperationalReviewSeverity;

const SEVERITY_LABEL: Record<OperationalReviewSeverity, string> = {
  action_required: 'Accion requerida',
  warning: 'Advertencia',
  informational: 'Informativo',
};

const ORIGIN_LABEL: Record<string, string> = {
  manual: 'Manual',
  batch: 'Lote',
  monitor: 'Monitor',
  catalog: 'Catalogo',
};

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(d);
}

function formatDelta(item: OperationalReviewItem): string {
  if (!item.previousApprovedPrice || !item.deltaAbs || !item.deltaPct) return 'Sin precio anterior aprobado';
  const sign = Number(item.deltaAbs) > 0 ? '+' : '';
  return `${sign}${item.deltaAbs} (${sign}${Number(item.deltaPct).toFixed(2)}%)`;
}

function severityBadge(severity: OperationalReviewSeverity) {
  const variant = severity === 'action_required' ? 'destructive' : severity === 'warning' ? 'warning' : 'outline';
  return <Badge variant={variant}>{SEVERITY_LABEL[severity]}</Badge>;
}

function itemMatches(item: OperationalReviewItem, severity: SeverityFilter, supplier: string, query: string): boolean {
  if (severity !== 'all' && item.severity !== severity) return false;
  if (supplier !== 'all' && (item.supplierName ?? 'Sin proveedor') !== supplier) return false;
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return `${item.resourceCode} ${item.resourceName} ${item.reason} ${item.statusLabel}`.toLowerCase().includes(q);
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' }) {
  const valueClass = tone === 'danger' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-iconic-ink';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function ReviewList({ title, icon, items, hasMore }: { title: string; icon: React.ReactNode; items: OperationalReviewItem[]; hasMore: boolean }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="text-iconic-primary">{icon}</span>
          {title}
        </h3>
        {hasMore && <span className="text-xs text-amber-700">Mostrando las primeras señales críticas</span>}
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">Sin señales para este filtro</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <details key={item.id} className="group rounded-md border border-gray-100 bg-gray-50 p-3">
              <summary className="grid cursor-pointer list-none gap-2 marker:hidden md:grid-cols-[minmax(0,1.3fr)_0.8fr_0.8fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {severityBadge(item.severity)}
                    <Badge variant={item.origin === 'monitor' ? 'warning' : item.origin === 'batch' ? 'secondary' : 'outline'}>{ORIGIN_LABEL[item.origin]}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-gray-900">{item.resourceCode ? `${item.resourceCode} - ` : ''}{item.resourceName || 'Recurso sin nombre'}</p>
                  <p className="text-xs text-gray-500">{item.supplierName ?? 'Sin proveedor'}</p>
                </div>
                <div className="text-xs">
                  <p className="font-medium text-gray-700">{item.statusLabel}</p>
                  <p className="text-gray-500">{formatDate(item.date)}</p>
                </div>
                <div className="text-xs">
                  <p className="font-medium text-gray-700">{item.priceLabel ?? 'Sin precio'}</p>
                  <p className="text-gray-500">Comparacion derivada</p>
                </div>
                <span className="text-xs font-medium text-iconic-primary">Ver detalle</span>
              </summary>
              <div className="mt-3 grid gap-2 border-t border-gray-200 pt-3 text-xs text-gray-600 md:grid-cols-2">
                <div>
                  <p className="font-medium text-gray-800">Motivo</p>
                  <p>{item.reason}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-800">Comparacion derivada</p>
                  <p>{formatDelta(item)}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-800">Accion sugerida</p>
                  <p>{item.suggestedAction}</p>
                </div>
                <div className="flex items-end justify-start md:justify-end">
                  <Button asChild size="sm" variant="outline">
                    <Link href={item.href} className="inline-flex items-center gap-1">
                      {item.suggestedAction}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export function OperationalReviewConsole({ consoleData }: { consoleData: ConsoleData }) {
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [supplier, setSupplier] = useState('all');
  const [query, setQuery] = useState('');
  const allItems = useMemo(() => [...consoleData.urgent, ...consoleData.coverage, ...consoleData.sourceHealth, ...consoleData.recentActivity], [consoleData]);
  const suppliers = useMemo(() => Array.from(new Set(allItems.map((item) => item.supplierName ?? 'Sin proveedor'))).sort((a, b) => a.localeCompare(b, 'es')), [allItems]);
  const filterItems = (items: OperationalReviewItem[]) => items.filter((item) => itemMatches(item, severity, supplier, query));
  const clear = () => {
    setSeverity('all');
    setSupplier('all');
    setQuery('');
  };

  const urgent = filterItems(consoleData.urgent);
  const coverage = filterItems(consoleData.coverage);
  const sourceHealth = filterItems(consoleData.sourceHealth);
  const recentActivity = filterItems(consoleData.recentActivity);
  const shown = urgent.length + coverage.length + sourceHealth.length + recentActivity.length;

  return (
    <section aria-label="Consola operativa" className="mb-6 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Consola operativa</h2>
          <p className="text-sm text-gray-500">Prioriza precios por revisar, cobertura de catalogo y salud de fuentes sin cambiar el flujo de aprobacion.</p>
        </div>
        <span className="text-xs font-medium text-gray-500">{shown} señales visibles</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Pendientes" value={consoleData.kpis.pendingCount} tone={consoleData.kpis.pendingCount > 0 ? 'warn' : undefined} />
        <Kpi label="Con warnings" value={consoleData.kpis.pendingWithWarningsCount} tone={consoleData.kpis.pendingWithWarningsCount > 0 ? 'danger' : undefined} />
        <Kpi label="Del monitor" value={consoleData.kpis.monitorPendingCount} tone={consoleData.kpis.monitorPendingCount > 0 ? 'warn' : undefined} />
        <Kpi label="Sin approved" value={consoleData.kpis.resourcesWithoutApprovedCount} tone={consoleData.kpis.resourcesWithoutApprovedCount > 0 ? 'danger' : undefined} />
        <Kpi label="Stale" value={consoleData.kpis.staleApprovedCount} tone={consoleData.kpis.staleApprovedCount > 0 ? 'warn' : undefined} />
        <Kpi label="Fuentes con alerta" value={consoleData.kpis.failingOrOverdueTargetsCount} tone={consoleData.kpis.failingOrOverdueTargetsCount > 0 ? 'danger' : undefined} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Severidad
          <select value={severity} onChange={(event) => setSeverity(event.target.value as SeverityFilter)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="all">Todas</option>
            <option value="action_required">Accion requerida</option>
            <option value="warning">Advertencia</option>
            <option value="informational">Informativo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Proveedor
          <select value={supplier} onChange={(event) => setSupplier(event.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="all">Todos</option>
            {suppliers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-gray-600">
          Recurso
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Codigo, nombre o motivo" className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm" />
          </span>
        </label>
        <Button type="button" variant="outline" size="sm" onClick={clear} className="inline-flex items-center gap-1">
          <FilterX className="h-4 w-4" aria-hidden="true" />
          Limpiar filtros
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ReviewList title="Revision urgente" icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />} items={urgent} hasMore={consoleData.hasMore.urgent} />
        <ReviewList title="Cobertura de catalogo" icon={<Activity className="h-4 w-4" aria-hidden="true" />} items={coverage} hasMore={consoleData.hasMore.coverage} />
        <ReviewList title="Salud de fuentes" icon={<Radar className="h-4 w-4" aria-hidden="true" />} items={sourceHealth} hasMore={consoleData.hasMore.sourceHealth} />
      </div>

      {recentActivity.length > 0 && (
        <ReviewList title="Actividad reciente" icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} items={recentActivity} hasMore={consoleData.hasMore.recentActivity} />
      )}

      {consoleData.notes.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          {consoleData.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}
    </section>
  );
}