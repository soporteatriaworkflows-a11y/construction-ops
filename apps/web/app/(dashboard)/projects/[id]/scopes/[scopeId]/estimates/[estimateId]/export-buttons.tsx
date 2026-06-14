'use client';

/**
 * export-buttons.tsx — Menú «Exportar» del presupuesto (APU_EXPORTS_V1).
 *
 * Seis descargas server-side vía GET /api/estimates/export:
 *  - Presupuesto PDF / Excel (4E.1, intacto).
 *  - APU vinculados PDF / Excel (kind=apu).
 *  - Paquete completo PDF / Excel (kind=package).
 * Muestra conteos (ítems BOQ, APU vinculados, sin vínculo, archivados incluidos)
 * y advertencias. Las opciones APU se deshabilitan si no hay APU vinculados.
 * No recalcula ni expone finanzas; sólo dispara la descarga.
 */
import { useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  apuOptionsEnabled,
  showNoApuMessage,
  showArchivedIncluded,
  exportWarnings,
  buildExportQuery,
  type ExportCounts,
} from './export-menu-logic';

export type { ExportCounts } from './export-menu-logic';

type Format = 'xlsx' | 'pdf';
type Kind = 'budget' | 'apu' | 'package';
type Profile = 'client' | 'technical';

interface ExportButtonsProps {
  projectId: string;
  scopeId: string;
  estimateId: string;
  counts?: ExportCounts | null;
}

export function ExportButtons({ projectId, scopeId, estimateId, counts }: ExportButtonsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasApu = apuOptionsEnabled(counts);
  const warnings = exportWarnings(counts);

  async function download(format: Format, kind: Kind, profile: Profile = 'technical') {
    const token = `${profile}:${kind}:${format}`;
    if (busy) return; // anti doble-click
    setBusy(token);
    setError(null);
    try {
      const query = buildExportQuery({ format, kind, estimateId, projectId, scopeId, profile });
      const res = await fetch(`/api/estimates/export?${query}`, { method: 'GET' });
      if (!res.ok) {
        let message = 'No fue posible generar la exportación.';
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          /* respuesta no-JSON: mensaje genérico */
        }
        setError(message);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const fileName = match?.[1] ?? `export.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Error de red al generar la exportación.');
    } finally {
      setBusy(null);
    }
  }

  const btn = (
    label: string,
    format: Format,
    kind: Kind,
    profile: Profile = 'technical',
    disabled = false,
  ) => {
    const token = `${profile}:${kind}:${format}`;
    const Icon = format === 'xlsx' ? FileSpreadsheet : FileText;
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => download(format, kind, profile)}
        disabled={busy !== null || disabled}
        aria-busy={busy === token}
        title={disabled ? 'Este presupuesto aún no tiene APU vinculados.' : undefined}
      >
        {busy === token ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="h-4 w-4" aria-hidden="true" />
        )}
        {label}
      </Button>
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      {/* Conteos */}
      {counts && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
          <span>
            Ítems BOQ: <strong className="tabular-nums text-gray-900">{counts.boqItems}</strong>
          </span>
          <span>
            APU vinculados: <strong className="tabular-nums text-gray-900">{counts.linkedApu}</strong>
          </span>
          <span>
            Sin vínculo: <strong className="tabular-nums text-gray-900">{counts.unlinkedItems}</strong>
          </span>
          {showArchivedIncluded(counts) && (
            <span className="text-iconic-primary">
              Archivados (histórico): <strong className="tabular-nums">{counts.archivedIncluded}</strong>
            </span>
          )}
        </div>
      )}

      {/* Cliente / comercial — presupuesto legible, sin fichas APU técnicas */}
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Para cliente / comercial
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {btn('PDF cliente', 'pdf', 'budget', 'client')}
        {btn('Excel presupuesto', 'xlsx', 'budget', 'client')}
      </div>

      {/* Técnico / interno — presupuesto completo + fichas APU + trazabilidad */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Técnico / interno
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {btn('PDF técnico completo', 'pdf', 'package', 'technical', !hasApu)}
        {btn('Excel técnico con APU', 'xlsx', 'package', 'technical', !hasApu)}
        {btn('APU vinculados PDF', 'pdf', 'apu', 'technical', !hasApu)}
        {btn('APU vinculados Excel', 'xlsx', 'apu', 'technical', !hasApu)}
      </div>

      {/* Mensaje sin APU */}
      {showNoApuMessage(counts) && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
          role="status"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span>Este presupuesto aún no tiene APU vinculados.</span>
        </div>
      )}

      {/* Advertencias */}
      {warnings.length > 0 && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          role="status"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{warnings.join(' ')}</span>
        </div>
      )}

      {error && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
