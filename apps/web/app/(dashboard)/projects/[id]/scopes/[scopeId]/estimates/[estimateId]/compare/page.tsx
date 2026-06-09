/**
 * Comparar versiones — .../estimates/[estimateId]/compare (4E.3B).
 *
 * Server Component request-time, READ-ONLY. Selectores base/objetivo por GET
 * (?base=&target=); default base = issued anterior más cercana, target = activa.
 * Render server-side de resumen financiero + diff de capítulos/ítems. Sin client
 * component (expand nativo con <details>). RLS/cross-org ⇒ notFound.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GitCompare, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCOP, formatNumber } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import {
  getEstimatesWriteRepository,
  EstimateNotFoundError,
  VersionMismatchError,
} from '@/server/estimates';
import type { EstimateVersionSummary } from '@/lib/estimates/version-types';
import type { DiffStatus, FinancialDelta, VersionCompareResult } from '@/lib/estimates/compare-types';
import { formatVersionLabel } from '../../../estimate-format';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABEL: Record<DiffStatus, string> = {
  added: 'Agregado',
  removed: 'Retirado',
  changed: 'Modificado',
  unchanged: 'Sin cambios',
};

function StatusBadge({ status }: { status: DiffStatus }) {
  if (status === 'added') return <Badge variant="success">Agregado</Badge>;
  if (status === 'removed') return <Badge variant="outline">Retirado</Badge>;
  if (status === 'changed') return <Badge variant="warning">Modificado</Badge>;
  return <Badge variant="secondary">Sin cambios</Badge>;
}

function pickDefaults(versions: EstimateVersionSummary[]): { base: string | null; target: string | null } {
  if (versions.length === 0) return { base: null, target: null };
  const active = versions.find((v) => v.isActive) ?? versions[versions.length - 1]!;
  // base = issued anterior más cercana (menor número que la activa); si no hay, la anterior.
  const prior = versions.filter((v) => v.versionNumber < active.versionNumber);
  const issuedPrior = prior.filter((v) => v.status === 'issued').sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const base = issuedPrior ?? prior.sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? active;
  return { base: base.id, target: active.id };
}

function DeltaCell({ d }: { d: FinancialDelta }) {
  const positive = d.delta.startsWith('-') ? false : Number(d.delta) !== 0;
  const neg = d.delta.startsWith('-');
  const color = Number(d.delta) === 0 ? 'text-gray-400' : neg ? 'text-red-600' : positive ? 'text-green-700' : 'text-gray-600';
  return (
    <span className={`tabular-nums ${color}`}>
      {formatCOP(d.delta)}{d.deltaPct !== null ? ` (${d.deltaPct}%)` : ''}
    </span>
  );
}

export default async function CompareVersionsPage({ params, searchParams }: PageProps) {
  const { id, scopeId, estimateId } = await params;
  const sp = searchParams ? await searchParams : {};
  const estimateHref = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}`;
  const compareHref = `${estimateHref}/compare`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  const repo = getEstimatesWriteRepository();
  let versions: EstimateVersionSummary[] = [];
  try {
    versions = await repo.listEstimateVersions(viewer, estimateId);
  } catch (e) {
    if (e instanceof EstimateNotFoundError) notFound();
    notFound();
  }
  if (versions.length === 0) notFound();

  const defaults = pickDefaults(versions);
  const baseId = (typeof sp['base'] === 'string' && sp['base']) || defaults.base!;
  const targetId = (typeof sp['target'] === 'string' && sp['target']) || defaults.target!;

  let result: VersionCompareResult | null = null;
  let error: string | null = null;
  try {
    result = await repo.compareEstimateVersions(viewer, estimateId, baseId, targetId);
  } catch (e) {
    if (e instanceof VersionMismatchError) error = 'Las versiones deben pertenecer al mismo presupuesto.';
    else if (e instanceof EstimateNotFoundError) error = 'Versión no encontrada o sin acceso.';
    else error = 'No se pudo comparar. Revisa la selección.';
  }

  const FIN_ROWS: { label: string; key: keyof VersionCompareResult['financial'] }[] = [
    { label: 'Costo directo', key: 'directTotal' },
    { label: 'Administración', key: 'administration' },
    { label: 'Imprevistos', key: 'contingency' },
    { label: 'Utilidad', key: 'utility' },
    { label: 'IVA sobre utilidad', key: 'utilityVat' },
    { label: 'Costos indirectos', key: 'indirectTotal' },
    { label: 'Total general', key: 'grandTotal' },
  ];

  return (
    <div>
      <PageHeader
        title="Comparar versiones"
        breadcrumb={
          <Link href={estimateHref} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al presupuesto
          </Link>
        }
      />

      {/* Selectores (GET) */}
      <form method="get" action={compareHref} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="space-y-1">
          <label htmlFor="base" className="block text-xs font-medium text-gray-600">Versión base</label>
          <select id="base" name="base" defaultValue={baseId} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm">
            {versions.map((v) => (
              <option key={v.id} value={v.id}>{formatVersionLabel(v.versionNumber)} · {v.status}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="target" className="block text-xs font-medium text-gray-600">Versión objetivo</label>
          <select id="target" name="target" defaultValue={targetId} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm">
            {versions.map((v) => (
              <option key={v.id} value={v.id}>{formatVersionLabel(v.versionNumber)} · {v.status}</option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm">
          <GitCompare className="h-4 w-4" aria-hidden="true" />
          Comparar
        </Button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>
      )}

      {result && (
        <>
          {result.duplicateCodeWarning && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800" role="status">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Código repetido: comparación emparejada por orden.
            </div>
          )}

          {/* Resumen financiero */}
          <section aria-label="Resumen financiero" className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">Resumen financiero</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Concepto</th>
                    <th className="px-3 py-2 text-right font-medium">{formatVersionLabel(result.base.versionNumber)} (base)</th>
                    <th className="px-3 py-2 text-right font-medium">{formatVersionLabel(result.target.versionNumber)} (objetivo)</th>
                    <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {FIN_ROWS.map((r) => {
                    const d = result!.financial[r.key];
                    return (
                      <tr key={r.key} className={r.key === 'grandTotal' ? 'font-semibold' : ''}>
                        <td className="px-3 py-2 text-gray-700">{r.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatCOP(d.base)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatCOP(d.target)}</td>
                        <td className="px-3 py-2 text-right"><DeltaCell d={d} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Capítulos */}
          <section aria-label="Capítulos" className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">Capítulos</h2>
            <div className="space-y-2">
              {result.chapters.map((ch) => (
                <details key={ch.code} className="rounded-lg border border-gray-200 bg-white" open={ch.status !== 'unchanged'}>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-600">{ch.code}</span>
                      <span className="text-gray-900">{ch.name.target ?? ch.name.base}</span>
                      <StatusBadge status={ch.status} />
                      {ch.archivedChanged && <span className="text-[10px] text-gray-500">archivado: {String(ch.archived.base)}→{String(ch.archived.target)}</span>}
                    </span>
                    <span className="tabular-nums text-xs text-gray-600">
                      {formatCOP(ch.subtotal.base)} → {formatCOP(ch.subtotal.target)}{' '}
                      <span className={ch.subtotalDelta.startsWith('-') ? 'text-red-600' : Number(ch.subtotalDelta) === 0 ? 'text-gray-400' : 'text-green-700'}>
                        ({formatCOP(ch.subtotalDelta)})
                      </span>
                    </span>
                  </summary>
                  {ch.items.length > 0 && (
                    <div className="overflow-x-auto border-t border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-left text-gray-500">
                          <tr>
                            <th className="px-3 py-1.5 font-medium">Código</th>
                            <th className="px-3 py-1.5 font-medium">Estado</th>
                            <th className="px-3 py-1.5 text-right font-medium">Cant. base→obj</th>
                            <th className="px-3 py-1.5 text-right font-medium">V/U base→obj</th>
                            <th className="px-3 py-1.5 text-right font-medium">Subtotal base→obj</th>
                            <th className="px-3 py-1.5 text-right font-medium">Δ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {ch.items.map((it) => (
                            <tr key={`${it.code}-${it.occurrenceIndex}`}>
                              <td className="px-3 py-1.5">
                                <span className="font-mono text-gray-600">{it.code}</span>
                                {it.occurrenceIndex > 1 && <span className="ml-1 text-[10px] text-amber-700">#{it.occurrenceIndex}</span>}
                                {it.archivedChanged && <span className="ml-1 text-[10px] text-gray-500">arch.</span>}
                              </td>
                              <td className="px-3 py-1.5">{STATUS_LABEL[it.status]}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                                {it.quantity.base !== null ? formatNumber(it.quantity.base) : '—'} → {it.quantity.target !== null ? formatNumber(it.quantity.target) : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                                {it.unitPrice.base !== null ? formatCOP(it.unitPrice.base) : '—'} → {it.unitPrice.target !== null ? formatCOP(it.unitPrice.target) : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                                {it.subtotal.base !== null ? formatCOP(it.subtotal.base) : '—'} → {it.subtotal.target !== null ? formatCOP(it.subtotal.target) : '—'}
                              </td>
                              <td className={`px-3 py-1.5 text-right tabular-nums ${it.subtotalDelta.startsWith('-') ? 'text-red-600' : Number(it.subtotalDelta) === 0 ? 'text-gray-400' : 'text-green-700'}`}>
                                {formatCOP(it.subtotalDelta)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
