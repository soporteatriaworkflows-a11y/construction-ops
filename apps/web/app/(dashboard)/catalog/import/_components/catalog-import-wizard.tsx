/**
 * catalog-import-wizard.tsx — Wizard cliente de importación masiva de catálogo
 * (CATALOG_BULK_ONBOARDING_V1). Propiedad: agent-frontend-boq.
 *
 * Pasos: archivo → analizar (preview server-side) → ajustar mapeo →
 * confirmar lote → reporte + CSV descargable sanitizado.
 *
 * El cliente NUNCA calcula nada definitivo: preview y confirmación re-parsean
 * el archivo server-side; el mapeo viaja como intención y se re-valida.
 */
'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CATALOG_REQUIRED_FIELDS,
  FIELD_LABELS,
  type CatalogImportPreview,
  type CatalogImportResult,
  type CatalogImportRowReport,
  type ColumnAssignment,
} from '@/lib/catalog-import/types';
import {
  previewCatalogImportAction,
  confirmCatalogImportAction,
} from '../actions';

function isCatalogMappingComplete(mapping: ColumnAssignment[]): boolean {
  const mapped = new Set(mapping.filter((a) => a.columnIndex !== null).map((a) => a.field));
  return (CATALOG_REQUIRED_FIELDS as readonly string[]).every((f) => mapped.has(f));
}

const STATUS_BADGE: Record<
  CatalogImportRowReport['status'],
  { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive' }
> = {
  new: { label: 'Nuevo', variant: 'success' },
  skip_existing: { label: 'Ya existe', variant: 'secondary' },
  duplicate_in_file: { label: 'Duplicado', variant: 'warning' },
  invalid: { label: 'Inválido', variant: 'destructive' },
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

export function CatalogImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnAssignment[]>([]);
  const [result, setResult] = useState<CatalogImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const requiredMissing = mapping
    .filter(
      (a) =>
        (CATALOG_REQUIRED_FIELDS as readonly string[]).includes(a.field) &&
        a.columnIndex === null,
    )
    .map((a) => FIELD_LABELS[a.field] ?? a.field);

  function runPreview(currentMapping: ColumnAssignment[] | null) {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Selecciona un archivo .xlsx, .xls o .csv.');
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('file', file);
      if (currentMapping) fd.set('mapping', JSON.stringify(currentMapping));
      const res = await previewCatalogImportAction(fd);
      if (res.ok) {
        setPreview(res.preview);
        const newMapping = res.preview.mapping;
        setMapping(newMapping);
        // Abre automáticamente si faltan campos obligatorios
        setIsAdvancedOpen(!isCatalogMappingComplete(newMapping));
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
      fd.set('file', file);
      fd.set('digest', preview.digest);
      fd.set('mapping', JSON.stringify(mapping));
      const res = await confirmCatalogImportAction(fd);
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
          : // una columna no puede estar asignada a dos campos
            a.columnIndex === columnIndex
            ? { ...a, columnIndex: null }
            : a,
      ),
    );
  }

  return (
    <div className="space-y-6">
      {/* Paso 1 — archivo */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">1. Archivo</h2>
        <p className="mb-3 text-xs text-gray-500">
          Formatos: .xlsx, .xls, .csv · máx. 10 MB · máx. 5.000 filas. La primera fila
          no vacía se usa como encabezados. No se ejecutan fórmulas ni macros.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label="Archivo de catálogo"
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

      {/* Paso 2 — mapeo */}
      {preview && !result && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">2. Campos del catálogo</h2>
          <p className="mb-3 text-xs text-gray-500">
            {requiredMissing.length === 0
              ? 'Mapeo obligatorio completo. Revisa el ajuste únicamente si alguna columna no fue reconocida.'
              : 'Asigna las columnas obligatorias: código, nombre, tipo de recurso y unidad.'}
          </p>

          {requiredMissing.length > 0 && (
            <p className="mb-3 text-xs font-medium text-amber-700" role="note">
              Falta asignar: {requiredMissing.join(', ')}.
            </p>
          )}

          {/* Panel colapsable de ajuste de mapeo */}
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
            onClick={() => setIsAdvancedOpen((v) => !v)}
            aria-expanded={isAdvancedOpen}
            aria-controls="catalog-mapping-panel"
          >
            <span aria-hidden="true">{isAdvancedOpen ? '▼' : '▶'}</span>
            Ajustar mapeo de columnas
          </button>

          {isAdvancedOpen && (
            <div
              id="catalog-mapping-panel"
              className="mt-3 rounded-md border border-gray-200 bg-white p-3"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mapping.map((a) => {
                  const isRequired = (CATALOG_REQUIRED_FIELDS as readonly string[]).includes(a.field);
                  return (
                    <label key={a.field} className="flex items-center justify-between gap-2 text-sm">
                      <span className={isRequired ? 'font-medium text-gray-900' : 'text-gray-600'}>
                        {FIELD_LABELS[a.field] ?? a.field}
                        {isRequired && <span className="text-red-600"> *</span>}
                      </span>
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
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                * Requerido · Una columna no puede asignarse a dos campos.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => runPreview(mapping)} disabled={pending}>
              {pending ? 'Recalculando…' : 'Recalcular vista previa'}
            </Button>
          </div>
        </section>
      )}

      {/* Paso 3 — preview */}
      {preview && !result && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">3. Vista previa</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
            <SummaryStat label="Filas" value={preview.totalRows} />
            <SummaryStat label="Nuevas" value={preview.newCount} tone="text-emerald-700" />
            <SummaryStat label="Ya existen" value={preview.existingCount} />
            <SummaryStat label="Duplicadas" value={preview.duplicateCount} tone="text-amber-700" />
            <SummaryStat label="Inválidas" value={preview.invalidCount} tone="text-red-700" />
            <SummaryStat label="Omitidas" value={preview.omittedCount} />
            <SummaryStat
              label="Precios pendientes"
              value={preview.pendingObservationCount}
              tone="text-blue-700"
            />
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

          <RowsTable rows={preview.rows} truncated={preview.rowsTruncated} />

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={runConfirm} disabled={pending || !preview.importable}>
              {pending ? 'Importando…' : `Confirmar importación (${preview.newCount} nuevos)`}
            </Button>
            {!preview.importable && (
              <p className="text-xs text-gray-500" role="note">
                Corrige los errores o el mapeo para habilitar la confirmación. Solo se
                crean recursos nuevos; los existentes nunca se sobrescriben.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Paso 4 — resultado */}
      {result && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">4. Resultado</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <SummaryStat label="Creados" value={result.createdCount} tone="text-emerald-700" />
            <SummaryStat label="Omitidos (existen)" value={result.skippedExistingCount} />
            <SummaryStat label="Duplicados" value={result.duplicateCount} tone="text-amber-700" />
            <SummaryStat label="Inválidos" value={result.invalidCount} tone="text-red-700" />
            <SummaryStat
              label="Observaciones pendientes"
              value={result.observationsCreated}
              tone="text-blue-700"
            />
            <SummaryStat label="Precios rechazados" value={result.observationsRejected} tone="text-red-700" />
          </dl>
          <p className="mb-3 text-xs text-gray-600">
            Las observaciones de precio quedan <strong>pendientes de aprobación humana</strong>.
            Ningún presupuesto ni AIU fue modificado.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv(result.reportCsv, 'reporte-importacion-catalogo.csv')}
            >
              Descargar reporte CSV
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="/catalog">Volver al catálogo</a>
            </Button>
          </div>
          <div className="mt-4">
            <RowsTable rows={result.rows.slice(0, 100)} truncated={result.rows.length > 100} />
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

function RowsTable({
  rows,
  truncated,
}: {
  rows: CatalogImportRowReport[];
  truncated: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="w-full text-xs" aria-label="Detalle por fila">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Fila</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Código</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Nombre</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Estado</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Mensajes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status];
            return (
              <tr key={r.row}>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{r.row}</td>
                <td className="px-3 py-1.5 font-mono">{r.code ?? '—'}</td>
                <td className="px-3 py-1.5">{r.name ?? '—'}</td>
                <td className="px-3 py-1.5">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {r.priceStatus === 'pending_observation' && (
                    <Badge variant="outline" className="ml-1">
                      Precio pendiente
                    </Badge>
                  )}
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
