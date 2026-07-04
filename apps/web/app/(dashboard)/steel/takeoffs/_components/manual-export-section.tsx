/**
 * manual-export-section.tsx — Preparación de export del borrador local.
 *
 * Genera un CSV EN EL NAVEGADOR (Blob) con las líneas calculadas y el pedido
 * mock: trivial y seguro (datos mock locales, sin backend). El export real
 * (Excel/PDF con perfiles de privacidad por rol, backend-first) NO se
 * implementa aquí — llega con la integración real post-F3.
 */
'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineCallout } from '@/components/shared/inline-callout';
import {
  buildManualExportCsv,
  type ManualComputedLine,
  type ManualOrderDraft,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';

export function ManualExportSection({
  takeoff,
  lines,
  order,
}: {
  takeoff: ManualTakeoffRecord;
  lines: readonly ManualComputedLine[];
  order: ManualOrderDraft | null;
}) {
  function handleDownload() {
    const csv = buildManualExportCsv(takeoff, lines, order ?? undefined);
    // BOM explícito para que Excel abra el CSV como UTF-8 (tildes correctas).
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `steel-takeoff-${takeoff.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <InlineCallout tone="info" title="Qué incluye este export (borrador local)" className="mb-3">
        Resumen del takeoff, líneas con interpretación/ml/kg/desperdicio/confianza
        {order ? ' y el pedido proveedor mock' : ' (genera el pedido mock para incluirlo)'}. CSV plano
        generado en el navegador con celdas sanitizadas. El export oficial (Excel/PDF con perfiles
        por rol) se hará backend-first cuando Steel se integre al pipeline real de exports.
      </InlineCallout>
      <Button type="button" variant="outline" onClick={handleDownload} disabled={lines.length === 0}>
        <Download className="h-4 w-4" aria-hidden="true" />
        Descargar CSV (borrador local)
      </Button>
    </div>
  );
}
