'use client';

/**
 * apu-import-wizard.tsx — Wizard cliente de importación de la hoja APU
 * (ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1).
 *
 * Paso 1: seleccionar workbook (+ versión BOQ opcional) → analizar.
 * Paso 2: vista previa (resumen, roles, actividades con filtros y detalle,
 *         aceptes EXPLÍCITOS de sugerencias) → confirmar.
 * Paso 3: reporte final + CSV sanitizado.
 *
 * El preview es solo lectura: la confirmación re-parsea y re-valida TODO
 * server-side (los aceptes son intención, jamás se confían).
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCOP } from '@/lib/utils/format';
import type {
  AcceptedSuggestion,
  ApuImportActivityPreview,
  ApuImportPreview,
  ApuImportResult,
  LinkableVersionOption,
} from '@/lib/apu-import/types';
import { confirmApuImportAction, previewApuImportAction } from '../actions';

type ActivityFilter =
  | 'all'
  | 'exact'
  | 'suggested'
  | 'unresolved'
  | 'ambiguous'
  | 'cost_delta'
  | 'linkable'
  | 'not_linkable'
  | 'errors';

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'Todas',
  exact: 'Con exactos',
  suggested: 'Con sugerencias',
  unresolved: 'Con sin resolver',
  ambiguous: 'Con ambiguos',
  cost_delta: 'Diferencias de costo',
  linkable: 'Vinculables BOQ',
  not_linkable: 'No vinculables',
  errors: 'Con errores',
};

const STATUS_BADGE: Record<
  ApuImportActivityPreview['status'],
  { label: string; className: string }
> = {
  ready: { label: 'Lista', className: 'bg-emerald-100 text-emerald-800' },
  needs_review: { label: 'Revisar', className: 'bg-amber-100 text-amber-800' },
  error: { label: 'Error', className: 'bg-red-100 text-red-700' },
};

const DEFAULT_LINK_BADGE = { label: '—', className: 'bg-gray-50 text-gray-400' };

const LINK_BADGE: Record<string, { label: string; className: string }> = {
  linkable: { label: 'Vinculable', className: 'bg-blue-100 text-blue-800' },
  linked: { label: 'Vinculada', className: 'bg-emerald-100 text-emerald-800' },
  unresolved: { label: 'Sin ítem BOQ', className: 'bg-gray-100 text-gray-600' },
  ambiguous: { label: 'Ambigua', className: 'bg-amber-100 text-amber-800' },
  skipped_existing: { label: 'Ya vinculado', className: 'bg-gray-100 text-gray-600' },
  not_evaluated: { label: '—', className: 'bg-gray-50 text-gray-400' },
};

const MATCH_LABELS: Record<string, string> = {
  exact: 'Exacto',
  suggested: 'Sugerencia',
  unresolved: 'Sin resolver',
  ambiguous: 'Ambiguo',
  labor: 'Mano de obra',
  none: '—',
};

function formatDelta(value: string | null): string {
  if (value === null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n) <= 0.01) return 'Sin diferencia';
  return `${n > 0 ? '+' : ''}${formatCOP(value)}`;
}

function pctLabel(fraction: string): string {
  const n = Number(fraction);
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

export function ApuImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ApuImportPreview | null>(null);
  const [linkableVersions, setLinkableVersions] = useState<LinkableVersionOption[]>([]);
  const [linkVersionId, setLinkVersionId] = useState<string>('');
  const [accepted, setAccepted] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ApuImportResult | null>(null);
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
      const response = await previewApuImportAction(formData);
      if (!response.ok) {
        setPreview(null);
        setError(response.error);
        return;
      }
      setPreview(response.preview);
      setLinkableVersions(response.linkableVersions);
      setAccepted(new Map());
      setExpanded(new Set());
      setFilter('all');
    });
  };

  const onAnalyze = () => {
    const selected = fileRef.current?.files?.[0] ?? null;
    if (!selected) {
      setError('Selecciona el workbook (.xlsx) con la hoja APU.');
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
      const acceptedList: AcceptedSuggestion[] = [...accepted.entries()].map(
        ([componentKey, resourceId]) => ({ componentKey, resourceId }),
      );
      formData.set('acceptedSuggestions', JSON.stringify(acceptedList));
      const response = await confirmApuImportAction(formData);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.result);
    });
  };

  const toggleAccepted = (componentKey: string, resourceId: string | undefined) => {
    if (!resourceId) return;
    setAccepted((prev) => {
      const next = new Map(prev);
      if (next.has(componentKey)) next.delete(componentKey);
      else next.set(componentKey, resourceId);
      return next;
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
    return preview.activities.filter((a) => {
      switch (filter) {
        case 'exact':
          return a.exactCount > 0;
        case 'suggested':
          return a.suggestedCount > 0;
        case 'unresolved':
          return a.unresolvedCount > 0;
        case 'ambiguous':
          return a.ambiguousCount > 0;
        case 'cost_delta':
          return a.costDelta !== null && Math.abs(Number(a.costDelta)) > 0.01;
        case 'linkable':
          return a.boqLink.status === 'linkable';
        case 'not_linkable':
          return (
            a.boqLink.status !== 'linkable' && a.boqLink.status !== 'not_evaluated'
          );
        case 'errors':
          return a.status === 'error';
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
    anchor.download = 'importacion-apu.csv';
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
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ['Actividades creadas', result.importedActivities],
                ['Componentes creados', result.importedComponents],
                ['Omitidas (ya existían)', result.skippedExisting],
                ['Ítems BOQ vinculados', result.linkedBoqItems],
                ['Componentes sin asociar', result.unresolvedComponents],
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
                <Link href="/apu">Ver catálogo APU</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalle por actividad</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Descripción</th>
                  <th className="py-2 pr-3">Importación</th>
                  <th className="py-2 pr-3">Vínculo BOQ</th>
                  <th className="py-2">Mensajes</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.activityKey} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono text-xs">{row.persistedCode}</td>
                    <td className="py-2 pr-3">{row.description}</td>
                    <td className="py-2 pr-3">
                      {row.importStatus === 'created'
                        ? 'Creada'
                        : row.importStatus === 'skipped_existing'
                          ? 'Ya existía'
                          : 'Omitida'}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${(LINK_BADGE[row.linkStatus] ?? DEFAULT_LINK_BADGE).className}`}
                      >
                        {(LINK_BADGE[row.linkStatus] ?? DEFAULT_LINK_BADGE).label}
                        {row.boqItemCode ? ` · ${row.boqItemCode}` : ''}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-gray-500">
                      {row.messages.join(' · ')}
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
              <label htmlFor="apu-file" className="mb-1 block text-sm text-gray-600">
                Archivo .xlsx con hoja <span className="font-mono">APU</span> (máx. 10 MB)
              </label>
              <input
                id="apu-file"
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div>
              <label htmlFor="apu-link-version" className="mb-1 block text-sm text-gray-600">
                Vincular con presupuesto (opcional)
              </label>
              <select
                id="apu-link-version"
                value={linkVersionId}
                onChange={(e) => onVersionChange(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              >
                <option value="">Sin vinculación BOQ</option>
                {linkableVersions.map((v) => (
                  <option key={v.versionId} value={v.versionId}>
                    {v.label} · {v.unlinkedCount} ítems sin APU
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
            El archivo no se guarda. Solo se leen los valores de la hoja APU; las
            fórmulas nunca se ejecutan. Los precios del Excel quedan como evidencia y
            ningún precio del catálogo se aprueba automáticamente.
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
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Actividades', preview.totals.activities],
                  ['Componentes', preview.totals.components],
                  ['Asociaciones exactas', preview.totals.exactMatches],
                  ['Sugerencias', preview.totals.suggested],
                  ['Sin resolver', preview.totals.unresolved],
                  ['Ambiguos', preview.totals.ambiguous],
                  ['Listas para importar', preview.totals.readyToImport],
                  ['Ya existentes', preview.totals.skippedExisting],
                  ['Vinculables BOQ', preview.totals.linkable],
                  ['Advertencias', preview.totals.warnings],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md bg-gray-50 px-3 py-2">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums text-gray-900">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 rounded-md border border-gray-100 p-3">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Mano de obra (bloque salarial de la hoja)
                </p>
                <ul className="space-y-1 text-sm text-gray-600">
                  {preview.laborRoles.map((role) => (
                    <li key={role.role} className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {role.role}
                      </Badge>
                      <span>
                        Costo hora: {role.hourlyRecalculated ? formatCOP(role.hourlyRecalculated) : '—'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {role.action === 'reuse'
                          ? `Reutiliza el rol existente "${role.existingRoleName}"`
                          : role.action === 'create'
                            ? 'Se creará desde el bloque salarial de la hoja'
                            : 'No disponible'}
                      </span>
                      {role.warnings.map((w) => (
                        <span key={w} className="text-xs text-amber-700">
                          <AlertTriangle className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {w}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">3. Actividades detectadas</CardTitle>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(FILTER_LABELS) as ActivityFilter[]).map((f) => (
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
                    <th className="py-2 pr-3">Descripción</th>
                    <th className="py-2 pr-3">Unidad</th>
                    <th className="py-2 pr-3">Comp.</th>
                    <th className="py-2 pr-3">Herr. menor</th>
                    <th className="py-2 pr-3 text-right">Costo Excel</th>
                    <th className="py-2 pr-3 text-right">Costo recalculado</th>
                    <th className="py-2 pr-3 text-right">Diferencia</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2">Vínculo BOQ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((activity) => {
                    const isOpen = expanded.has(activity.key);
                    const statusBadge = STATUS_BADGE[activity.status];
                    const linkBadge =
                      LINK_BADGE[activity.boqLink.status] ?? DEFAULT_LINK_BADGE;
                    return (
                      <ActivityRows
                        key={activity.key}
                        activity={activity}
                        isOpen={isOpen}
                        statusBadge={statusBadge}
                        linkBadge={linkBadge}
                        accepted={accepted}
                        onToggle={() => toggleExpanded(activity.key)}
                        onToggleAccepted={toggleAccepted}
                      />
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  Ninguna actividad coincide con el filtro seleccionado.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Confirmar importación</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>
                  Se crearán <strong>{preview.totals.readyToImport}</strong> plantillas
                  APU nuevas; las existentes no se sobrescriben.
                </li>
                <li>
                  Solo las asociaciones exactas y las sugerencias aceptadas
                  explícitamente ({accepted.size}) se vinculan al catálogo; el resto se
                  importa sin asociar y queda reportado.
                </li>
                <li>
                  {linkVersionId
                    ? `Se vincularán ${preview.totals.linkable} actividades con el presupuesto seleccionado (solo coincidencias exactas y únicas; los vínculos existentes no se reemplazan).`
                    : 'Sin vinculación BOQ (no se seleccionó presupuesto).'}
                </li>
                <li>
                  Cantidades, AIU, exportaciones y precios aprobados NO se modifican.
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
                    ¿Importar {preview.totals.readyToImport} actividades de la hoja APU
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
                  actividades importables.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function ActivityRows({
  activity,
  isOpen,
  statusBadge,
  linkBadge,
  accepted,
  onToggle,
  onToggleAccepted,
}: {
  activity: ApuImportActivityPreview;
  isOpen: boolean;
  statusBadge: { label: string; className: string };
  linkBadge: { label: string; className: string };
  accepted: Map<string, string>;
  onToggle: () => void;
  onToggleAccepted: (componentKey: string, resourceId: string | undefined) => void;
}) {
  return (
    <>
      <tr className="border-b align-top">
        <td className="py-2 pr-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={`Revisar ${activity.visibleCode}`}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </td>
        <td className="py-2 pr-3 font-mono text-xs">
          {activity.visibleCode}
          {activity.occurrenceIndex > 1 ? (
            <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">
              #{activity.occurrenceIndex}
            </span>
          ) : null}
        </td>
        <td className="max-w-[260px] py-2 pr-3">{activity.description}</td>
        <td className="py-2 pr-3">{activity.rawUnit}</td>
        <td className="py-2 pr-3 tabular-nums">{activity.componentCount}</td>
        <td className="py-2 pr-3">{pctLabel(activity.defaultToolPct)}</td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {activity.excelTotal !== null ? formatCOP(activity.excelTotal) : '—'}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {activity.recalculatedTotal !== null
            ? formatCOP(activity.recalculatedTotal)
            : '—'}
        </td>
        <td className="py-2 pr-3 text-right text-xs tabular-nums">
          {formatDelta(activity.costDelta)}
        </td>
        <td className="py-2 pr-3">
          <span className={`rounded px-2 py-0.5 text-xs ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          {activity.importAction === 'skip_existing' ? (
            <span className="ml-1 text-[10px] text-gray-400">ya existe</span>
          ) : null}
        </td>
        <td className="py-2">
          <span className={`rounded px-2 py-0.5 text-xs ${linkBadge.className}`}>
            <Link2 className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
            {linkBadge.label}
            {activity.boqLink.boqItemCode ? ` · ${activity.boqLink.boqItemCode}` : ''}
          </span>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b bg-gray-50/60">
          <td colSpan={11} className="px-4 py-3">
            {activity.errors.length > 0 ? (
              <ul className="mb-2 list-disc pl-5 text-xs text-red-600">
                {activity.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2">Fila</th>
                  <th className="py-1 pr-2">Código origen</th>
                  <th className="py-1 pr-2">Descripción</th>
                  <th className="py-1 pr-2">Tipo</th>
                  <th className="py-1 pr-2">Unidad</th>
                  <th className="py-1 pr-2 text-right">Cantidad</th>
                  <th className="py-1 pr-2 text-right">Desperdicio</th>
                  <th className="py-1 pr-2 text-right">Precio hoja</th>
                  <th className="py-1 pr-2 text-right">Precio aprobado</th>
                  <th className="py-1 pr-2 text-right">Subtotal hoja</th>
                  <th className="py-1 pr-2 text-right">Subtotal recalculado</th>
                  <th className="py-1">Asociación</th>
                </tr>
              </thead>
              <tbody>
                {activity.components.map((component) => (
                  <tr key={component.key} className="border-t border-gray-100 align-top">
                    <td className="py-1.5 pr-2 tabular-nums">{component.sourceRow}</td>
                    <td className="py-1.5 pr-2 font-mono">{component.rawCode || '—'}</td>
                    <td className="max-w-[220px] py-1.5 pr-2">
                      {component.description}
                      {component.crew && component.crew.length > 0 ? (
                        <span className="ml-1 text-gray-400">
                          (
                          {component.crew
                            .map((m) => `${m.count} ${m.role}`)
                            .join(' + ')}
                          )
                        </span>
                      ) : null}
                      {component.warnings.map((w) => (
                        <p key={w} className="mt-0.5 text-amber-700">
                          <AlertTriangle
                            className="mr-0.5 inline h-3 w-3"
                            aria-hidden="true"
                          />
                          {w}
                        </p>
                      ))}
                    </td>
                    <td className="py-1.5 pr-2 capitalize">{component.componentType}</td>
                    <td className="py-1.5 pr-2">{component.rawUnit || '—'}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {component.quantity ?? '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {component.wastePct}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {component.unitPrice !== null ? formatCOP(component.unitPrice) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {component.approvedBaselinePrice
                        ? formatCOP(component.approvedBaselinePrice)
                        : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {component.excelSubtotal !== null
                        ? formatCOP(component.excelSubtotal)
                        : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {component.recalculatedSubtotal !== null
                        ? formatCOP(component.recalculatedSubtotal)
                        : '—'}
                    </td>
                    <td className="py-1.5">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">
                        {MATCH_LABELS[component.match] ?? component.match}
                      </span>
                      {component.resourceName ? (
                        <span className="ml-1 text-gray-500">
                          {component.resourceCode} · {component.resourceName}
                        </span>
                      ) : null}
                      {component.match === 'suggested' && component.resourceId ? (
                        <label className="mt-1 flex items-center gap-1 text-gray-700">
                          <input
                            type="checkbox"
                            checked={accepted.has(component.key)}
                            onChange={() =>
                              onToggleAccepted(component.key, component.resourceId)
                            }
                          />
                          Aceptar sugerencia
                        </label>
                      ) : null}
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
