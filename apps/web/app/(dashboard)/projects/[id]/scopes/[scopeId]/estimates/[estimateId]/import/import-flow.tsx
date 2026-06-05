/**
 * import-flow.tsx — Flujo cliente de importación de Excel (4C.1).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/EXCEL_IMPORT_CONTRACT.md §2`.
 *
 * Dos pasos sin persistir el archivo en servidor: el File vive en estado del
 * cliente y se reenvía en la confirmación. Doble submit bloqueado por `isPending`.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/auth/form-error';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCOP } from '@/lib/utils/format';
import { IMPORT_LIMITS, EXPECTED_SHEET, type ImportPreview } from '@/lib/import/types';
import {
  previewExcelImportAction,
  confirmExcelImportAction,
  type PreviewActionResult,
  type ConfirmActionResult,
} from './actions';

const MAX_MB = (IMPORT_LIMITS.maxFileBytes / (1024 * 1024)).toFixed(0);

export function ImportFlow({
  estimateId,
  backHref,
}: {
  estimateId: string;
  backHref: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedSheets, setDetectedSheets] = useState<string[] | null>(null);
  // Overrides de mapping: clave `rowType:sourceRow` → código canónico editado.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const overridesArray = () =>
    Object.entries(overrides).map(([k, canonicalCode]) => {
      const [rowType, sourceRow] = k.split(':');
      return { rowType: rowType as 'chapter' | 'item', sourceRow: Number(sourceRow), canonicalCode };
    });

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setError(null);
    setDetectedSheets(null);
    setOverrides({});
    if (f && f.size > IMPORT_LIMITS.maxFileBytes) {
      setError(`El archivo supera el tamaño máximo de ${MAX_MB} MB.`);
    }
  }

  // Analiza el archivo. `seedFromMappings`: tras un primer análisis sin overrides,
  // siembra el estado editable con las propuestas del parser.
  function analyze(seedFromMappings: boolean) {
    if (!file || pending) return;
    setError(null);
    setDetectedSheets(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      fd.set('file', file);
      if (!seedFromMappings) fd.set('overrides', JSON.stringify(overridesArray()));
      const res: PreviewActionResult = await previewExcelImportAction(fd);
      if (res.ok) {
        setPreview(res.preview);
        if (seedFromMappings) {
          const seed: Record<string, string> = {};
          for (const m of res.preview.mappings) seed[`${m.rowType}:${m.sourceRow}`] = m.canonicalCode;
          setOverrides(seed);
        }
      } else {
        setError(res.error);
        setDetectedSheets(res.detectedSheets ?? null);
      }
    });
  }

  function confirm() {
    if (!file || !preview || pending || !preview.importable) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      fd.set('file', file);
      fd.set('digest', preview.digest);
      fd.set('overrides', JSON.stringify(overridesArray()));
      const res: ConfirmActionResult = await confirmExcelImportAction(fd);
      if (res.ok) {
        router.push(`${backHref}?imported=1`);
        router.refresh();
      } else {
        setError(res.error);
        if (/vista previa|analiz/i.test(res.error)) setPreview(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Paso A — selección + análisis */}
      <Card>
        <CardContent className="space-y-3 py-5">
          <label htmlFor="excel" className="block text-sm font-medium text-gray-800">
            Archivo Excel (.xlsx) — hoja <code className="font-mono text-xs">{EXPECTED_SHEET}</code>
          </label>
          <input
            id="excel"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFileChange}
            disabled={pending}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          <p className="text-xs text-gray-400">Tamaño máximo {MAX_MB} MB. El archivo no se almacena.</p>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => analyze(true)} disabled={!file || pending} size="sm">
              {pending && !preview ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              Analizar
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={backHref}>Cancelar</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div>
          <FormError id="import-error" message={error} />
          {detectedSheets && detectedSheets.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Hojas detectadas: {detectedSheets.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Paso A.2 — preview */}
      {preview && (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Vista previa</h3>
              <span className="text-xs text-gray-400">
                {preview.fileName} · hoja {preview.sheet}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Capítulos" value={String(preview.chapterCount)} />
              <Stat label="Ítems" value={String(preview.itemCount)} />
              <Stat label="Total directo" value={formatCOP(preview.directTotal)} accent />
            </div>

            {preview.errors.length > 0 && (
              <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <p className="font-medium">
                  {preview.errors.length} problema(s) deben corregirse antes de importar:
                </p>
                <ul className="space-y-1">
                  {preview.errors.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {e.row !== null && <strong>Fila {e.row}: </strong>}
                        {e.code ? <span className="font-mono">[{e.code}] </span> : null}
                        {e.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {w.row !== null && <strong>Fila {w.row}: </strong>}
                      {w.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs" aria-label="Resumen por capítulo">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="py-1.5 pr-3 font-medium">Capítulo</th>
                    <th className="py-1.5 pr-3 font-medium">Ítems</th>
                    <th className="py-1.5 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.chapters.map((c) => (
                    <tr key={c.code}>
                      <td className="py-1.5 pr-3">
                        <span className="font-mono text-gray-500">{c.code}</span> {c.name}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums text-gray-600">{c.itemCount}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCOP(c.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.mappings.length > 0 && (
              <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/40 p-3">
                <h4 className="text-sm font-semibold text-gray-900">Revisar numeración</h4>
                <p className="text-xs text-gray-500">
                  Se detectaron códigos a normalizar. Edita el código propuesto si es necesario y
                  pulsa <strong>Revalidar</strong>. El código original se conserva como trazabilidad.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" aria-label="Revisión de numeración">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-1.5 pr-2 font-medium">Fila</th>
                        <th className="py-1.5 pr-2 font-medium">Tipo</th>
                        <th className="py-1.5 pr-2 font-medium">Original</th>
                        <th className="py-1.5 pr-2 font-medium">Propuesto</th>
                        <th className="py-1.5 pr-2 font-medium">Descripción</th>
                        <th className="py-1.5 pr-2 font-medium">Motivo</th>
                        <th className="py-1.5 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.mappings.map((m) => {
                        const key = `${m.rowType}:${m.sourceRow}`;
                        return (
                          <tr key={key}>
                            <td className="py-1 pr-2 tabular-nums">{m.sourceRow}</td>
                            <td className="py-1 pr-2">{m.rowType === 'chapter' ? 'Capítulo' : 'Ítem'}</td>
                            <td className="py-1 pr-2 font-mono">{m.sourceCode}</td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={overrides[key] ?? m.canonicalCode}
                                onChange={(e) => setOverrides((o) => ({ ...o, [key]: e.target.value }))}
                                disabled={pending}
                                maxLength={60}
                                className={`w-24 rounded border px-1.5 py-0.5 font-mono text-xs ${m.requiresManualReview ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                                aria-label={`Código propuesto fila ${m.sourceRow}`}
                              />
                            </td>
                            <td className="py-1 pr-2 max-w-[16rem] truncate text-gray-600">{m.description}</td>
                            <td className="py-1 pr-2 text-gray-500">{m.reason}</td>
                            <td className="py-1">
                              {m.requiresManualReview ? (
                                <Badge variant="destructive">Requiere corrección</Badge>
                              ) : (
                                <Badge variant="secondary">Propuesta</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => analyze(false)} disabled={pending}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Revalidar
                  </Button>
                  {!preview.importable && (
                    <span className="text-xs text-red-600">
                      Resuelve las correcciones pendientes para habilitar la importación.
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
              <Button
                type="button"
                onClick={confirm}
                disabled={pending || !preview.importable}
                title={preview.importable ? undefined : 'Corrige los errores antes de confirmar'}
                size="sm"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                Confirmar importación
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={backHref}>Cancelar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-base font-bold tabular-nums ${accent ? 'text-blue-700' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
