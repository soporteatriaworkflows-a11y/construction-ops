/**
 * manual-export-section.tsx - Export local del borrador manual.
 *
 * Genera archivos EN EL NAVEGADOR (Blob) con las lineas calculadas, plan de
 * corte y pedido mock. Sigue siendo preview local: sin backend, sin DB.
 */
'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineCallout } from '@/components/shared/inline-callout';
import {
  buildManualExportCsv,
  type ManualComputedLine,
  type ManualCutPlanResult,
  type ManualOrderDraft,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';

export function ManualExportSection({
  takeoff,
  lines,
  planResult,
  order,
}: {
  takeoff: ManualTakeoffRecord;
  lines: readonly ManualComputedLine[];
  planResult: ManualCutPlanResult | null;
  order: ManualOrderDraft | null;
}) {
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadCsv() {
    const csv = buildManualExportCsv(takeoff, lines, order ?? undefined);
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `steel-takeoff-${takeoff.id}.csv`);
  }

  async function handleDownloadExcel() {
    setIsExportingExcel(true);
    try {
      const { buildSteelManualExcelBuffer, buildSteelManualExcelFileName } = await import('@/lib/steel/manual-excel-export');
      const bytes = await buildSteelManualExcelBuffer({
        takeoff,
        lines,
        planResult,
        order,
      });
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, buildSteelManualExcelFileName(takeoff));
    } finally {
      setIsExportingExcel(false);
    }
  }

  return (
    <div>
      <InlineCallout tone="info" title="Borrador para revision/proveedor" className="mb-3">
        Excel operativo generado en el navegador con resumen, cantidades, alertas, plan de corte,
        sobrantes, pedido proveedor mock y configuracion. No reemplaza aprobacion tecnica ni
        cotizacion aprobada.
      </InlineCallout>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleDownloadExcel} disabled={lines.length === 0 || isExportingExcel}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {isExportingExcel ? 'Generando Excel...' : 'Exportar Excel'}
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadCsv} disabled={lines.length === 0}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Descargar CSV
        </Button>
      </div>
    </div>
  );
}
