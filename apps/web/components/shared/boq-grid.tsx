/**
 * BoqGrid — grilla AG Grid Community para el BOQ.
 * "use client" requerido porque AG Grid necesita el DOM.
 * NUNCA importar de ag-grid-enterprise.
 * Propiedad: agent-frontend-boq.
 *
 * Este componente SOLO renderiza datos que ya vienen calculados.
 * NO realiza cálculos financieros.
 */
'use client';

import { useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridReadyEvent,
  CellValueChangedEvent,
  RowClassParams,
  RowStyle,
} from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type { BoqItem, Chapter } from '@/lib/utils/types';
import { formatCOP, formatNumber } from '@/lib/utils/format';

// Registrar solo módulos Community
ModuleRegistry.registerModules([AllCommunityModule]);

// ---------------------------------------------------------------------------
// Tipo de fila (flatten chapters + items para el grid)
// ---------------------------------------------------------------------------

interface BoqRow {
  id: string;
  isChapter: boolean;
  code: string;
  description: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  subtotal: string | null;
  notes: string | null;
  // nivel de indentación para CSS
  level: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRows(chapters: Chapter[], items: BoqItem[]): BoqRow[] {
  const rows: BoqRow[] = [];
  const sortedChapters = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const chapter of sortedChapters) {
    // Fila de capítulo
    rows.push({
      id: `chapter-${chapter.id}`,
      isChapter: true,
      code: chapter.code,
      description: chapter.name,
      unit: null,
      quantity: null,
      unitPrice: null,
      subtotal: null,
      notes: null,
      level: 0,
    });

    // Items del capítulo
    const chapterItems = items
      .filter((i) => i.chapterId === chapter.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const item of chapterItems) {
      rows.push({
        id: item.id,
        isChapter: false,
        code: item.code,
        description: item.descriptionSnapshot,
        unit: item.unitSnapshot,
        quantity: item.quantitySnapshot,
        unitPrice: item.unitPriceSnapshot,
        subtotal: item.subtotal,
        notes: item.notes ?? null,
        level: 1,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface BoqGridProps {
  chapters: Chapter[];
  items: BoqItem[];
  /** Callback cuando se edita una nota (único campo editable en mock) */
  onNotesChange?: (itemId: string, notes: string) => void;
  /** Altura del grid en px; por defecto 480 */
  height?: number;
}

export function BoqGrid({
  chapters,
  items,
  onNotesChange,
  height = 480,
}: BoqGridProps) {
  const gridRef = useRef<AgGridReact<BoqRow>>(null);

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
        minWidth: 280,
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
        width: 100,
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
        width: 130,
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
        width: 150,
        headerClass: 'ag-right-aligned-header',
        cellStyle: { textAlign: 'right' },
        cellClassRules: {
          'font-semibold bg-slate-50': (params) =>
            Boolean(params.data?.isChapter),
        },
        valueFormatter: (params) =>
          !params.value ? '' : formatCOP(params.value),
      },
      {
        field: 'notes',
        headerName: 'Notas',
        width: 180,
        editable: (params) => !params.data?.isChapter,
        cellStyle: { color: '#6b7280' },
        valueFormatter: (params) =>
          params.data?.isChapter ? '' : (params.value ?? ''),
      },
      // Cast: AG Grid v35 infiere una unión incompatible para arrays de ColDef
      // con `cellClassRules` heterogéneos. Los defs son válidos en runtime.
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

  const onGridReady = useCallback((_params: GridReadyEvent) => {
    // Auto-size futuro si necesario
  }, []);

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<BoqRow>) => {
      if (event.colDef.field === 'notes' && event.data && !event.data.isChapter) {
        onNotesChange?.(event.data.id, event.newValue ?? '');
      }
    },
    [onNotesChange]
  );

  const getRowStyle = useCallback(
    (params: RowClassParams<BoqRow>): RowStyle | undefined =>
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
      <AgGridReact<BoqRow>
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        onGridReady={onGridReady}
        onCellValueChanged={onCellValueChanged}
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
