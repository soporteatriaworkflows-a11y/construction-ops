/**
 * price-list-wizard.tsx — Wizard cliente de importación de lista de precios de
 * proveedor (CATALOG_BULK_ONBOARDING_V1). Propiedad: agent-frontend-boq.
 *
 * Proveedor → archivo → analizar → mapeo → confirmar. Cada precio crea una
 * observación pendiente; las filas sin asociar se exportan para revisión.
 */
'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FIELD_LABELS,
  type ColumnAssignment,
  type PriceListPreview,
  type PriceListResult,
  type PriceListRowReport,
} from '@/lib/catalog-import/types';
import { previewPriceListAction, confirmPriceListAction } from '../actions';

const MATCH_BADGE: Record<
  PriceListRowReport['matchType'],
  { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' }
> = {
  sku: { label: 'SKU', variant: 'success' },
  reference: { label: 'Referencia', variant: 'success' },
  code: { label: 'Código', variant: 'success' },
  none: { label: 'Sin asociar', variant: 'warning' },
  ambiguous: { label: 'Ambiguo', variant: 'destructive' },
};

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function PriceListWizard({
  providers,
}: {
  providers: Array<{ id: string; name: string }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [providerId, setProviderId] = useState('');
  const [preview, setPreview] = useState<PriceListPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnAssignment[]>([]);
  const [result, setResult] = useState<PriceListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview(currentMapping: ColumnAssignment[] | null) {
    const file = fileRef.current?.files?.[0];
    if (!providerId) {
      setError('Selecciona un proveedor.');
      return;
    }
    if (!file) {
      setError('Selecciona un archivo .xlsx, .xls o .csv.');
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('providerId', providerId);
      fd.set('file', file);
      if (currentMapping) fd.set('mapping', JSON.stringify(currentMapping));
      const res = await previewPriceListAction(fd);
      if (res.ok) {
        setPreview(res.preview);
        setMapping(res.preview.mapping);
      } else {
        setError(res.error);
      }
    });
  }

  function runConfirm() {
    const file = fileRef.current?.files?.[0];
    if (!file || !preview) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('providerId', providerId);
      fd.set('file', file);
      fd.set('digest', preview.digest);
      fd.set('mapping', JSON.stringify(mapping));
      const res = await confirmPriceListAction(fd);
      if (res.ok) {
        setResult(res.result);
      } else {
        setError(res.error);
      }
    });
  }

  function updateMapping(field: string, value: string) {
    const columnIndex = value === '' ? null : Number(value);
    setMapping((prev) =>
      prev.map((a) =>
        a.field === field
          ? { ...a, columnIndex }
          : a.columnIndex === columnIndex
            ? { ...a, columnIndex: null }
            : a,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">1. Proveedor y archivo</h2>
        <p className="mb-3 text-xs text-gray-500">
          Cada precio crea una observación <strong>pendiente de aprobación</strong> para el
          proveedor seleccionado. Nunca modifica presupuestos, AIU ni exportaciones.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            aria-label="Proveedor"
          >
            <option value="">— Selecciona proveedor —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label="Archivo de lista de precios"
            className="block text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
            onChange={() => {
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
          <Button size="sm" onClick={() => runPreview(null)} disabled={pending}>
            {pending && !preview ? 'Analizando…' : 'Analizar archivo'}
          </Button>
        </div>
      </section>

      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {preview && !result && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">2. Mapeo de columnas</h2>
          <p className="mb-3 text-xs text-gray-500">
            Obligatorio: precio observado y al menos un identificador (SKU externo,
            referencia externa o código).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mapping.map((a) => (
              <label key={a.field} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-600">{FIELD_LABELS[a.field] ?? a.field}</span>
                <select
                  className="w-40 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                  value={a.columnIndex === null ? '' : String(a.columnIndex)}
                  onChange={(e) => updateMapping(a.field, e.target.value)}
                  aria-label={`Columna para ${FIELD_LABELS[a.field] ?? a.field}`}
                >
                  <option value="">— Sin asignar —</option>
                  {preview.headers.map((h, idx) => (
                    <option key={idx} value={idx}>
                      {h || `Columna ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => runPreview(mapping)} disabled={pending}>
              {pending ? 'Recalculando…' : 'Recalcular vista previa'}
            </Button>
          </div>
        </section>
      )}

      {preview && !result && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            3. Vista previa — {preview.providerName}
          </h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <SummaryStat label="Filas" value={preview.totalRows} />
            <SummaryStat label="Asociadas" value={preview.matchedCount} tone="text-emerald-700" />
            <SummaryStat label="Sin asociar" value={preview.unmatchedCount} tone="text-amber-700" />
            <SummaryStat label="Inválidas" value={preview.invalidCount} tone="text-red-700" />
            <SummaryStat label="Omitidas" value={preview.omittedCount} />
          </dl>

          {preview.errors.length > 0 && (
            <ul className="mb-3 list-disc space-y-1 rounded-md border border-red-200 bg-red-50 px-4 py-2 pl-8 text-sm text-red-700">
              {preview.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <ul className="mb-3 list-disc space-y-1 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 pl-8 text-sm text-amber-800">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <PriceListRows rows={preview.rows} truncated={preview.rowsTruncated} />

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={runConfirm} disabled={pending || !preview.importable}>
              {pending
                ? 'Importando…'
                : `Crear ${preview.matchedCount} observación(es) pendiente(s)`}
            </Button>
            {!preview.importable && (
              <p className="text-xs text-gray-500" role="note">
                Se requiere al menos una fila asociada y un mapeo válido.
              </p>
            )}
          </div>
        </section>
      )}

      {result && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">4. Resultado</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <SummaryStat
              label="Observaciones pendientes"
              value={result.observationsCreated}
              tone="text-emerald-700"
            />
            <SummaryStat label="Sin asociar" value={result.unmatchedCount} tone="text-amber-700" />
            <SummaryStat label="Inválidas" value={result.invalidCount} tone="text-red-700" />
          </dl>
          <p className="mb-3 text-xs text-gray-600">
            Las observaciones quedan <strong>pendientes de aprobación humana</strong> en
            Price Intelligence. Ningún presupuesto fue modificado.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv(result.reportCsv, 'reporte-lista-precios.csv')}
            >
              Descargar reporte CSV
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="/catalog/providers">Volver a proveedores</a>
            </Button>
          </div>
          <div className="mt-4">
            <PriceListRows rows={result.rows.slice(0, 100)} truncated={result.rows.length > 100} />
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'text-gray-900',
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function PriceListRows({
  rows,
  truncated,
}: {
  rows: PriceListRowReport[];
  truncated: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="w-full text-xs" aria-label="Detalle por fila">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Fila</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Identificador</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Coincidencia</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Recurso</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Mensajes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r) => {
            const badge = MATCH_BADGE[r.matchType];
            return (
              <tr key={r.row}>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{r.row}</td>
                <td className="px-3 py-1.5 font-mono">{r.identifier ?? '—'}</td>
                <td className="px-3 py-1.5">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </td>
                <td className="px-3 py-1.5">
                  {r.resourceCode ? `${r.resourceCode} · ${r.resourceName ?? ''}` : '—'}
                </td>
                <td className="px-3 py-1.5 text-gray-600">{r.messages.join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {truncated && (
        <p className="bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
          Mostrando las primeras {rows.length} filas. El reporte CSV incluye todas.
        </p>
      )}
    </div>
  );
}
