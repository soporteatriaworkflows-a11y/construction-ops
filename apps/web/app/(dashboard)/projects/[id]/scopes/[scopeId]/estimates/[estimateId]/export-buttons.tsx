'use client';

/**
 * export-buttons.tsx — Descargas protegidas Excel/PDF del presupuesto (4E.1).
 *
 * Propiedad: agent-frontend-boq (orquestación 4E.1).
 * - Genera la descarga server-side vía GET /api/estimates/export.
 * - Loading por botón; anti doble-click; error sanitizado; descarga directa.
 * - No recalcula ni expone finanzas; sólo dispara la descarga.
 */
import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Format = 'xlsx' | 'pdf';

interface ExportButtonsProps {
  projectId: string;
  scopeId: string;
  estimateId: string;
}

export function ExportButtons({ projectId, scopeId, estimateId }: ExportButtonsProps) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: Format) {
    if (busy) return; // anti doble-click
    setBusy(format);
    setError(null);
    try {
      const params = new URLSearchParams({ format, estimateId, projectId, scopeId });
      const res = await fetch(`/api/estimates/export?${params.toString()}`, { method: 'GET' });
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
      const fileName = match?.[1] ?? `presupuesto.${format}`;

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

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      <p className="text-sm text-gray-600">
        El archivo se genera con los datos actuales de V01.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => download('xlsx')}
          disabled={busy !== null}
          aria-busy={busy === 'xlsx'}
        >
          {busy === 'xlsx' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          )}
          Exportar Excel
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => download('pdf')}
          disabled={busy !== null}
          aria-busy={busy === 'pdf'}
        >
          {busy === 'pdf' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          Exportar PDF
        </Button>
      </div>
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
