/**
 * BudgetBoqGrid — grilla AG Grid Community para el BOQ (Oleada 3A).
 * "use client" requerido porque AG Grid necesita el DOM.
 * NUNCA importar de ag-grid-enterprise.
 * Propiedad: agent-frontend-boq.
 *
 * Acepta ChapterSummary[] + BoqItemView[] del read-model.
 * NO realiza cálculos financieros.
 */
'use client';

import { useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridReadyEvent,
  RowClassParams,
  RowStyle,
} from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type { ChapterSummary, BoqItemView } from '@/lib/contracts/read-model';
import { formatCOP, formatNumber } from '@/lib/utils/format';

// Registrar solo módulos Community
ModuleRegistry.registerModules([AllCommunityModule]);

// ---------------------------------------------------------------------------
// Tipo de fila flatten (capítulo + ítem)
// ---------------------------------------------------------------------------

interface BudgetRow {
  id: string;
  isChapter: boolean;
  code: string;
  description: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  subtotal: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRows(chapters: ChapterSummary[], items: BoqItemView[]): BudgetRow[] {
  const rows: BudgetRow[] = [];

  for (const chapter of chapters) {
    // Fila de capítulo
    rows.push({
      id: `chapter-${chapter.id}`,
      isChapter: true,
      code: chapter.code,
      description: `${chapter.name} (${chapter.itemCount} ítem${chapter.itemCount !== 1 ? 's' : ''})`,
      unit: null,
      quantity: null,
      unitPrice: null,
      subtotal: chapter.subtotal,
    });

    // Filas de ítems
    const chapterItems = items
      .filter((i) => i.chapterId === chapter.id);

    for (const item of chapterItems) {
      rows.push({
        id: item.id,
        isChapter: false,
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface BudgetBoqGridProps {
  chapters: ChapterSummary[];
  items: BoqItemView[];
  /** Altura del grid en px; por defecto 560 */
  height?: number;
}

export function BudgetBoqGrid({ chapters, items, height = 560 }: BudgetBoqGridProps) {
  const gridRef = useRef<AgGridReact<BudgetRow>>(null);

  const rowData = useMemo(
    () => buildRows(chapters, items),
    [chapters, items]
  );

  const columnDefs = useMemo<ColDef[]>(
    () => [
      {
        field: 'code',
        headerName: 'Código',
        width: 90,
        pinned: 'left' as const,
        cellClassRules: {
          'font-bold text-blue-700 bg-slate-50': (params) =>
            Boolean(params.data?.isChapter),
        },
      },
      {
        field: 'description',
        headerName: 'Descripción',
        flex: 1,
        minWidth: 300,
        wrapText: false,
        cellClassRules: {
          'font-semibold bg-slate-50': (params) =>
            Boolean(params.data?.isChapter),
          'pl-6': (params) => !params.data?.isChapter,
        },
      },
      {
        field: 'unit',
        headerName: 'Unidad',
        width: 80,
        cellStyle: { textAlign: 'center' },
        valueFormatter: (params) =>
          params.data?.isChapter ? '' : (params.value ?? '—'),
      },
      {
        field: 'quantity',
        headerName: 'Cantidad',
        width: 110,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) =>
          params.data?.isChapter || !params.value
            ? ''
            : formatNumber(params.value, 4),
      },
      {
        field: 'unitPrice',
        headerName: 'P. Unitario',
        width: 140,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' },
        valueFormatter: (params) =>
          params.data?.isChapter || !params.value
            ? ''
            : formatCOP(params.value),
      },
      {
        field: 'subtotal',
        headerName: 'Subtotal',
        width: 160,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' },
        cellClassRules: {
          'font-semibold bg-slate-50': (params) =>
            Boolean(params.data?.isChapter),
        },
        valueFormatter: (params) =>
          !params.value ? '' : formatCOP(params.value),
      },
    ] as ColDef[],
    []
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: false,
      resizable: true,
      suppressMovable: true,
      cellStyle: { fontSize: '13px' },
    }),
    []
  );

  const onGridReady = useCallback((_params: GridReadyEvent) => {}, []);

  const getRowStyle = useCallback(
    (params: RowClassParams<BudgetRow>): RowStyle | undefined =>
      params.data?.isChapter
        ? { background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }
        : undefined,
    []
  );

  return (
    <div
      className="ag-theme-alpine w-full overflow-hidden rounded-lg border border-gray-200"
      style={{ height }}
      role="region"
      aria-label="Grilla de presupuesto BOQ"
    >
      <AgGridReact<BudgetRow>
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        onGridReady={onGridReady}
        getRowStyle={getRowStyle}
        rowSelection="single"
        suppressCellFocus={false}
        enableCellTextSelection
        tooltipShowDelay={500}
        suppressRowClickSelection
        animateRows
        domLayout="normal"
      />
    </div>
  );
}
