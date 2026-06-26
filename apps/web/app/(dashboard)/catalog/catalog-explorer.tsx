/**
 * catalog-explorer.tsx — Búsqueda y filtros del catálogo (ICONIC_OPS_UX_BLOCKERS_V1).
 *
 * Cliente puro de presentación: recibe los recursos YA cargados por el servidor
 * (read-model) y filtra en memoria por texto/tipo/estado/proveedor. NO hace
 * consultas, no toca DB ni precios; respeta la privacidad (mismos campos que ya
 * mostraba la página). Sobrio y legible (módulo operativo).
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { FilterPills } from '@/components/shared/filter-pills';
import { Badge } from '@/components/ui/badge';
import { formatCOP, RESOURCE_TYPE_LABELS } from '@/lib/utils/format';
import type { CatalogResourceView } from '@/lib/contracts/read-model';

type PriceStatus = 'approved' | 'pending' | 'rejected' | 'none';

const RESOURCE_TYPE_ORDER = ['material', 'labor', 'equipment', 'tool', 'subcontract', 'other'] as const;

const PRICE_STATUS_LABELS: Record<PriceStatus, string> = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  none: 'Sin precio',
};
const PRICE_STATUS_VARIANT: Record<PriceStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
  none: 'outline',
};
const RESOURCE_TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  material: 'default',
  labor: 'success',
  equipment: 'warning',
  tool: 'secondary',
  subcontract: 'outline',
  other: 'outline',
};

export interface CatalogFilters {
  search: string;
  type: string; // 'all' | resourceType
  status: string; // 'all' | PriceStatus
  provider: string; // 'all' | supplierName
}

/** Filtro PURO de recursos (testeable). */
export function filterResources(resources: CatalogResourceView[], f: CatalogFilters): CatalogResourceView[] {
  const q = f.search.trim().toLowerCase();
  return resources.filter((r) => {
    if (q !== '' && !r.code.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q) && !(r.unit ?? '').toLowerCase().includes(q)) {
      return false;
    }
    if (f.type !== 'all' && r.resourceType !== f.type) return false;
    if (f.status !== 'all' && (r.priceStatus ?? 'none') !== f.status) return false;
    if (f.provider !== 'all' && (r.supplierName ?? '') !== f.provider) return false;
    return true;
  });
}

export function CatalogExplorer({ resources }: { resources: CatalogResourceView[] }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');

  const providers = useMemo(
    () => Array.from(new Set(resources.map((r) => r.supplierName).filter((s): s is string => !!s))).sort(),
    [resources],
  );
  const active = search.trim() !== '' || type !== 'all' || status !== 'all' || provider !== 'all';
  const filtered = useMemo(
    () => filterResources(resources, { search, type, status, provider }),
    [resources, search, type, status, provider],
  );

  const byType = useMemo(() => {
    const acc: Record<string, CatalogResourceView[]> = {};
    for (const r of filtered) (acc[r.resourceType] ??= []).push(r);
    return acc;
  }, [filtered]);

  const clear = () => {
    setSearch('');
    setType('all');
    setStatus('all');
    setProvider('all');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="catSearch" className="mb-1 block text-xs font-medium text-gray-600">Buscar (código, nombre, unidad)</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="catSearch"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej. cemento, ML-01, m3…"
                className="w-full rounded-md border border-gray-300 py-2 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
              />
            </div>
          </div>
          <Select id="catType" label="Tipo" value={type} onChange={setType}
            options={[['all', 'Todos los tipos'], ...RESOURCE_TYPE_ORDER.map((t) => [t, RESOURCE_TYPE_LABELS[t] ?? t] as [string, string])]} />
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">Estado de precio</span>
            <FilterPills
              ariaLabel="Estado de precio"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'approved', label: 'Aprobado' },
                { value: 'pending', label: 'Pendiente' },
                { value: 'rejected', label: 'Rechazado' },
                { value: 'none', label: 'Sin precio' },
              ]}
            />
          </div>
          {providers.length > 0 && (
            <Select id="catProvider" label="Proveedor" value={provider} onChange={setProvider}
              options={[['all', 'Todos'], ...providers.map((p) => [p, p] as [string, string])]} />
          )}
          <button type="button" onClick={clear} disabled={!active}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            Limpiar filtros
          </button>
          <span className="ml-auto self-center text-xs text-gray-500">
            <strong className="tabular-nums text-gray-700">{filtered.length}</strong> de {resources.length} recursos
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          Ningún recurso coincide con los filtros. <button type="button" onClick={clear} className="underline">Limpiar filtros</button>.
        </p>
      ) : (
        <div className="space-y-6">
          {RESOURCE_TYPE_ORDER.map((t) => {
            const group = byType[t];
            if (!group || group.length === 0) return null;
            return (
              <section key={t} aria-label={`Recursos de tipo ${RESOURCE_TYPE_LABELS[t] ?? t}`}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
                  <Badge variant={RESOURCE_TYPE_VARIANT[t] ?? 'outline'}>{RESOURCE_TYPE_LABELS[t] ?? t}</Badge>
                  <span className="font-normal normal-case tracking-normal text-gray-400">({group.length})</span>
                </h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Código', 'Nombre', 'Unidad', 'Estado', 'Precio', 'Proveedor / fecha', 'Precios'].map((h, i) => (
                          <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${i === 2 || i === 3 ? 'text-center' : i === 4 || i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.map((r) => {
                        const st = (r.priceStatus ?? 'none') as PriceStatus;
                        const href = `/catalog/resources/${r.id}/price-intelligence`;
                        return (
                          <tr key={r.id} className="transition-colors hover:bg-gray-50">
                            <td className="px-4 py-2.5"><Link href={href} className="font-mono text-xs text-iconic-primary hover:underline">{r.code}</Link></td>
                            <td className="px-4 py-2.5 font-medium text-gray-900"><Link href={href} className="hover:text-iconic-primary hover:underline">{r.name}</Link></td>
                            <td className="px-4 py-2.5 text-center text-gray-600">{r.unit}</td>
                            <td className="px-4 py-2.5 text-center"><Badge variant={PRICE_STATUS_VARIANT[st]}>{PRICE_STATUS_LABELS[st]}</Badge></td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {st === 'approved' && r.approvedPrice ? (
                                <span className="font-medium text-gray-900">{formatCOP(r.approvedPrice)}</span>
                              ) : st === 'pending' && r.pendingPrice ? (
                                <span className="text-amber-700" title="Precio pendiente de aprobación">{formatCOP(r.pendingPrice)}<span className="ml-1 text-[10px] uppercase">pend.</span></span>
                              ) : (
                                <span className="text-xs text-gray-300">Sin precio aprobado</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {r.supplierName ? <span>{r.supplierName}</span> : <span className="text-gray-300">—</span>}
                              {r.priceDate && <span className="ml-1 text-gray-400">· {r.priceDate.slice(0, 10)}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Link href={href} className="text-xs font-medium text-iconic-primary hover:underline">
                                {st === 'none' ? 'Agregar precio' : st === 'pending' ? 'Revisar precios' : 'Ver observaciones'}
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
