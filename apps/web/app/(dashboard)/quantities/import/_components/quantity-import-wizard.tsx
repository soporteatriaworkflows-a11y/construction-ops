'use client';

/**
 * quantity-import-wizard.tsx — Wizard cliente de importación de memorias de
 * cantidades (QUANTITY_TAKEOFF_IMPORT_V1, contrato §12).
 *
 * Paso 1: seleccionar workbook (+ versión BOQ opcional) → analizar.
 * Paso 2: vista previa (resumen, grupos con líneas desplegables, fórmulas,
 *         diferencias vs Excel, vínculos BOQ por estado) → confirmar.
 * Paso 3: reporte final + CSV sanitizado.
 *
 * El preview es solo lectura: la confirmación re-parsea y re-valida TODO
 * server-side. Cero cálculo financiero en React: todos los números llegan
 * calculados del servidor.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Link2,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import type {
  QuantityImportPreview,
  QuantityImportResult,
  TakeoffGroupPreview,
  TakeoffLinkableVersion,
  TakeoffFormulaType,
} from '@/lib/quantity-import/types';
import { confirmQuantityImportAction, previewQuantityImportAction } from '../actions';

type GroupFilter =
  | 'all'
  | 'linked'
  | 'suggested'
  | 'unresolved'
  | 'ambiguous'
  | 'skipped_existing'
  | 'warnings'
  | 'deductions';

const FILTER_LABELS: Record<GroupFilter, string> = {
  all: 'Todos',
  linked: 'Vinculados',
  suggested: 'Sugerencias',
  unresolved: 'Sin ítem BOQ',
  ambiguous: 'Ambiguos',
  skipped_existing: 'Ya vinculados',
  warnings: 'Con advertencias',
  deductions: 'Con deducciones',
};

const DEFAULT_LINK_BADGE = { label: '—', className: 'bg-gray-50 text-gray-400' };

const LINK_BADGE: Record<string, { label: string; className: string }> = {
  linked: { label: 'Vinculado', className: 'bg-emerald-100 text-emerald-800' },
  suggested: { label: 'Sugerencia', className: 'bg-blue-100 text-blue-800' },
  unresolved: { label: 'Sin ítem BOQ', className: 'bg-gray-100 text-gray-600' },
  ambiguous: { label: 'Ambiguo', className: 'bg-amber-100 text-amber-800' },
  skipped_existing: { label: 'Ya vinculado', className: 'bg-gray-100 text-gray-600' },
  not_evaluated: { label: '—', className: 'bg-gray-50 text-gray-400' },
};

const FORMULA_LABELS: Record<TakeoffFormulaType, string> = {
  direct: 'Directa',
  count_only: 'Cantidad',
  length_only: 'Largo',
  width_only: 'Ancho',
  height_only: 'Alto',
  length_count: 'Largo × Cant',
  width_count: 'Ancho × Cant',
  height_count: 'Alto × Cant',
  length_width: 'Largo × Ancho',
  length_height: 'Largo × Alto',
  width_height: 'Ancho × Alto',
  length_width_count: 'Largo × Ancho × Cant',
  length_height_count: 'Largo × Alto × Cant',
  width_height_count: 'Ancho × Alto × Cant',
  length_width_height: 'Largo × Ancho × Alto',
  length_width_height_count: 'L × A × H × Cant',
  dims_sum_count: '(L + A + H) × Cant',
  custom: 'No geométrica',
};

function groupHasWarnings(group: TakeoffGroupPreview): boolean {
  return group.warnings.length > 0 || group.lines.some((l) => l.warnings.length > 0);
}

export function QuantityImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QuantityImportPreview | null>(null);
  const [linkableVersions, setLinkableVersions] = useState<TakeoffLinkableVersion[]>([]);
  const [linkVersionId, setLinkVersionId] = useState<string>('');
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [result, setResult] = useState<QuantityImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const runPreview = (selected: File, versionId: string) => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('file', selected);
      if (versionId) formData.set('linkVersionId', versionId);
      const response = await previewQuantityImportAction(formData);
      if (!response.ok) {
        setPreview(null);
        setError(response.error);
        return;
      }
      setPreview(response.preview);
      setLinkableVersions(response.linkableVersions);
      setExpanded(new Set());
      setFilter('all');
    });
  };

  const onAnalyze = () => {
    const selected = fileRef.current?.files?.[0] ?? null;
    if (!selected) {
      setError('Selecciona el workbook (.xlsx) con la hoja CANTIDADES 1 PISO.');
      return;
    }
    setFile(selected);
    runPreview(selected, linkVersionId);
  };

  const onVersionChange = (versionId: string) => {
    setLinkVersionId(versionId);
    if (file) runPreview(file, versionId);
  };

  const onConfirm = () => {
    if (!file || !preview) return;
    setConfirmOpen(false);
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('digest', preview.digest);
      if (linkVersionId) formData.set('linkVersionId', linkVersionId);
      const response = await confirmQuantityImportAction(formData);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.result);
    });
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!preview) return [];
    return preview.groups.filter((g) => {
      switch (filter) {
        case 'linked':
        case 'suggested':
        case 'unresolved':
        case 'ambiguous':
        case 'skipped_existing':
          return g.linkStatus === filter;
        case 'warnings':
          return groupHasWarnings(g);
        case 'deductions':
          return g.lines.some((l) => l.deduction);
        default:
          return true;
      }
    });
  }, [preview, filter]);

  const downloadCsv = () => {
    if (!result) return;
    const blob = new Blob([result.reportCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'importacion-cantidades.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ── Paso 3: resultado ────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {result.duplicate ? (
                <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              )}
              {result.duplicate
                ? 'Workbook ya importado (sin cambios)'
                : 'Importación completada'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.duplicate ? (
              <p className="mb-3 text-sm text-gray-600">
                Este workbook ya fue importado antes con el mismo contenido. No se creó
                nada nuevo (importación idempotente).
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Grupos creados', result.groupsCreated],
                ['Líneas creadas', result.linesCreated],
                ['Ítems BOQ vinculados', result.linkedBoqItems],
                ['Grupos sin vínculo exacto', result.unresolvedGroups],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md bg-gray-50 px-3 py-2">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-gray-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadCsv}>
                <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                Descargar reporte CSV
              </Button>
              <Button size="sm" asChild>
                <Link href="/quantities">Ver cantidades</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalle por grupo</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3">Ítem</th>
                  <th className="py-2 pr-3">Descripción</th>
                  <th className="py-2 pr-3 text-right">Líneas</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3">Importación</th>
                  <th className="py-2 pr-3">Vínculo BOQ</th>
                  <th className="py-2">Mensajes</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.groupKey} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {row.itemCode ?? row.visibleCode ?? '—'}
                    </td>
                    <td className="py-2 pr-3">{row.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.lines}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatNumber(row.totalCalculated, 4)}
                      {row.unit ? ` ${row.unit}` : ''}
                    </td>
                    <td className="py-2 pr-3">
                      {row.importStatus === 'created' ? 'Creado' : 'Omitido'}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${(LINK_BADGE[row.linkStatus] ?? DEFAULT_LINK_BADGE).className}`}
                      >
                        {(LINK_BADGE[row.linkStatus] ?? DEFAULT_LINK_BADGE).label}
                        {row.boqItemCode ? ` · ${row.boqItemCode}` : ''}
                      </span>
                    </td>
                    <td className="max-w-[280px] py-2 text-xs text-gray-500">
                      {row.messages.slice(0, 3).join(' · ')}
                      {row.messages.length > 3 ? ` (+${row.messages.length - 3})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Pasos 1 y 2 ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-5 w-5 text-blue-700" aria-hidden="true" />
            1. Workbook del proyecto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="qty-file" className="mb-1 block text-sm text-gray-600">
                Archivo .xlsx con hoja{' '}
                <span className="font-mono">CANTIDADES 1 PISO</span> (máx. 10 MB)
              </label>
              <input
                id="qty-file"
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div>
              <label htmlFor="qty-link-version" className="mb-1 block text-sm text-gray-600">
                Vincular con presupuesto (opcional)
              </label>
              <select
                id="qty-link-version"
                value={linkVersionId}
                onChange={(e) => onVersionChange(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              >
                <option value="">Sin vinculación BOQ</option>
                {linkableVersions.map((v) => (
                  <option key={v.versionId} value={v.versionId}>
                    {v.label} · {v.itemCount} ítems
                  </option>
                ))}
              </select>
              {linkableVersions.length === 0 ? (
                <p className="mt-1 text-xs text-gray-400">
                  Analiza el workbook para cargar las versiones editables.
                </p>
              ) : null}
            </div>
            <Button onClick={onAnalyze} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Analizar workbook
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            El archivo no se guarda. Solo se leen los valores de la hoja; las fórmulas
            nunca se ejecutan: se reconocen como geometría (largo × ancho × alto ×
            cantidad) y los subtotales se recalculan en el servidor. El BOQ no se
            modifica.
          </p>
        </CardContent>
      </Card>

      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {preview ? (
        <>
          {preview.blockingErrors.length > 0 ? (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              <p className="font-medium">
                <XCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />
                Errores críticos — la confirmación está bloqueada:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {preview.blockingErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Resumen del análisis</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                {[
                  ['Grupos', preview.totals.groups],
                  ['Líneas de medición', preview.totals.lines],
                  ['Vinculados BOQ', preview.totals.linked],
                  ['Sugerencias', preview.totals.suggested],
                  ['Sin ítem BOQ', preview.totals.unresolved],
                  ['Ambiguos', preview.totals.ambiguous],
                  ['Ya vinculados', preview.totals.skippedExisting],
                  ['Deducciones', preview.totals.deductions],
                  ['Diferencias vs Excel', preview.totals.excelMismatches],
                  ['Advertencias', preview.totals.warnings],
                  ['Sin líneas (no se importan)', preview.totals.skippedNoLines],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md bg-gray-50 px-3 py-2">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums text-gray-900">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              {!preview.linkVersionId ? (
                <p className="mt-3 text-xs text-gray-500">
                  Sin presupuesto seleccionado: los grupos se importan como memoria
                  trazable sin vínculo BOQ.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">3. Grupos detectados</CardTitle>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(FILTER_LABELS) as GroupFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        filter === f
                          ? 'bg-blue-700 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {FILTER_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="py-2 pr-2" aria-label="Detalle" />
                    <th className="py-2 pr-3">Código</th>
                    <th className="py-2 pr-3">Ítem</th>
                    <th className="py-2 pr-3">Descripción</th>
                    <th className="py-2 pr-3">Unidad</th>
                    <th className="py-2 pr-3 text-right">Líneas</th>
                    <th className="py-2 pr-3 text-right">Total calculado</th>
                    <th className="py-2 pr-3 text-right">Total Excel</th>
                    <th className="py-2 pr-3">Advertencias</th>
                    <th className="py-2">Vínculo BOQ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((group) => (
                    <GroupRows
                      key={group.key}
                      group={group}
                      isOpen={expanded.has(group.key)}
                      onToggle={() => toggleExpanded(group.key)}
                    />
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  Ningún grupo coincide con el filtro seleccionado.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {preview.skippedGroups.length > 0 ? (
            <Card>
              <CardHeader>
                <button
                  type="button"
                  onClick={() => setShowSkipped((v) => !v)}
                  aria-expanded={showSkipped}
                  className="flex items-center gap-2 text-left"
                >
                  {showSkipped ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  )}
                  <CardTitle className="text-base">
                    Ítems sin memoria de cantidades ({preview.skippedGroups.length}) — no
                    se importan
                  </CardTitle>
                </button>
              </CardHeader>
              {showSkipped ? (
                <CardContent className="overflow-x-auto">
                  <p className="mb-2 text-xs text-gray-500">
                    Estos ítems aparecen en la hoja con descripción y unidad pero sin
                    líneas de medición (listados de suministro/subcontrato). Quedan en el
                    reporte como referencia.
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-1.5 pr-3">Fila</th>
                        <th className="py-1.5 pr-3">Código</th>
                        <th className="py-1.5 pr-3">Ítem</th>
                        <th className="py-1.5 pr-3">Descripción</th>
                        <th className="py-1.5">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.skippedGroups.map((g) => (
                        <tr key={g.sourceRow} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 tabular-nums">{g.sourceRow}</td>
                          <td className="py-1.5 pr-3 font-mono">{g.visibleCode ?? '—'}</td>
                          <td className="py-1.5 pr-3 font-mono">{g.itemCode ?? '—'}</td>
                          <td className="py-1.5 pr-3">{g.description}</td>
                          <td className="py-1.5">{g.rawUnit ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Confirmar importación</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>
                  Se crearán <strong>{preview.totals.groups}</strong> grupos con{' '}
                  <strong>{preview.totals.lines}</strong> líneas de medición como memoria
                  trazable (valores y fórmulas originales preservados).
                </li>
                <li>
                  {preview.linkVersionId
                    ? `Se vincularán ${preview.totals.linked} grupos con el presupuesto seleccionado (solo coincidencias exactas y únicas; los vínculos existentes no se reemplazan).`
                    : 'Sin vinculación BOQ (no se seleccionó presupuesto).'}
                </li>
                <li>
                  Las cantidades del presupuesto (BOQ) <strong>no se modifican</strong>;
                  el total importado queda para revisión. APU, AIU, precios y
                  exportaciones tampoco se tocan.
                </li>
              </ul>
              {!confirmOpen ? (
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={isPending || !preview.importable}
                >
                  Confirmar importación…
                </Button>
              ) : (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm text-blue-900">
                    ¿Importar {preview.totals.groups} grupos de la hoja CANTIDADES 1 PISO
                    de <strong>{preview.fileName}</strong>? Esta acción es idempotente:
                    el mismo workbook no se importa dos veces.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={onConfirm} disabled={isPending}>
                      {isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Sí, importar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmOpen(false)}
                      disabled={isPending}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {!preview.importable ? (
                <p className="mt-2 text-xs text-red-600">
                  La confirmación está bloqueada por errores críticos o porque no hay
                  grupos importables.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function GroupRows({
  group,
  isOpen,
  onToggle,
}: {
  group: TakeoffGroupPreview;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const linkBadge = LINK_BADGE[group.linkStatus] ?? DEFAULT_LINK_BADGE;
  const warningCount =
    group.warnings.length + group.lines.reduce((a, l) => a + l.warnings.length, 0);

  return (
    <>
      <tr className="border-b align-top">
        <td className="py-2 pr-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={`Revisar ${group.visibleCode ?? group.itemCode ?? group.description}`}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </td>
        <td className="py-2 pr-3 font-mono text-xs">{group.visibleCode ?? '—'}</td>
        <td className="py-2 pr-3 font-mono text-xs">
          {group.itemCode ?? '—'}
          {group.occurrenceIndex > 1 ? (
            <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">
              #{group.occurrenceIndex}
            </span>
          ) : null}
        </td>
        <td className="max-w-[280px] py-2 pr-3">{group.description}</td>
        <td className="py-2 pr-3">{group.unit ?? group.rawUnit ?? '—'}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{group.lines.length}</td>
        <td className="py-2 pr-3 text-right font-medium tabular-nums">
          {formatNumber(group.totalCalculated, 4)}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums text-gray-500">
          {group.excelTotal !== null ? formatNumber(group.excelTotal, 4) : '—'}
        </td>
        <td className="py-2 pr-3">
          {warningCount > 0 ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              <AlertTriangle className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
              {warningCount}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="py-2">
          <span className={`rounded px-2 py-0.5 text-xs ${linkBadge.className}`}>
            <Link2 className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
            {linkBadge.label}
            {group.boqItemCode ? ` · ${group.boqItemCode}` : ''}
          </span>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b bg-gray-50/60">
          <td colSpan={10} className="px-4 py-3">
            {group.warnings.length > 0 ? (
              <ul className="mb-2 list-disc pl-5 text-xs text-amber-700">
                {group.warnings.map((w) => (
                  <li key={`${w.code}-${w.sourceRow ?? 0}`}>{w.message}</li>
                ))}
              </ul>
            ) : null}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2">Fila</th>
                  <th className="py-1 pr-2">Elemento</th>
                  <th className="py-1 pr-2">Fórmula</th>
                  <th className="py-1 pr-2 text-right">Largo</th>
                  <th className="py-1 pr-2 text-right">Ancho</th>
                  <th className="py-1 pr-2 text-right">Alto</th>
                  <th className="py-1 pr-2 text-right">Cant</th>
                  <th className="py-1 pr-2 text-right">Subtotal Excel</th>
                  <th className="py-1 pr-2 text-right">Subtotal recalculado</th>
                  <th className="py-1">Notas</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line) => (
                  <tr key={line.key} className="border-t border-gray-100 align-top">
                    <td className="py-1.5 pr-2 tabular-nums">{line.sourceRow}</td>
                    <td className="py-1.5 pr-2">
                      {line.description ?? '—'}
                      {line.deduction ? (
                        <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">
                          deducción
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2">
                      {FORMULA_LABELS[line.formulaType]}
                      {line.formulaText ? (
                        <span className="ml-1 font-mono text-[10px] text-gray-400">
                          ={line.formulaText}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {line.length !== null ? formatNumber(line.length, 2) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {line.width !== null ? formatNumber(line.width, 2) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {line.height !== null ? formatNumber(line.height, 2) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {line.count !== null ? formatNumber(line.count, 0) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">
                      {line.excelSubtotal !== null
                        ? formatNumber(line.excelSubtotal, 4)
                        : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-medium tabular-nums">
                      {formatNumber(line.subtotalCalculated, 4)}
                    </td>
                    <td className="py-1.5">
                      {line.warnings.map((w) => (
                        <p key={`${w.code}-${w.sourceRow ?? 0}`} className="text-amber-700">
                          <AlertTriangle className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {w.message}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}
