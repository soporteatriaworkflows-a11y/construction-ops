'use client';
/**
 * ChapterPieChart — gráfico de torta de distribución por capítulo.
 * Propiedad: agent-dashboard.
 *
 * Usa Recharts (MIT). Muestra los top capítulos con su participación.
 * CERO cálculo financiero: los valores llegan como DecimalString ya calculados.
 */

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChapterDistributionSlice } from '@/lib/contracts/read-model';
import { formatCOP, formatPct } from '@/lib/utils/format';

const COLORS = [
  '#1d4ed8',
  '#15803d',
  '#b45309',
  '#7c3aed',
  '#be185d',
  '#0891b2',
  '#c2410c',
];

interface PieDataPoint {
  name: string;
  value: number;
  share: number;
  fullName: string;
}

interface ChapterPieChartProps {
  /** Usar solo los top N (default 7 para no saturar). */
  data: ChapterDistributionSlice[];
  topN?: number;
  height?: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Record<string, unknown>[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload as PieDataPoint | undefined;
  if (!item) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-md text-sm max-w-56">
      <p className="font-semibold text-gray-800 mb-1 leading-tight">{item.fullName}</p>
      <p className="text-gray-700">
        <span className="font-medium">Subtotal:</span>{' '}
        <span className="tabular-nums">{formatCOP(String(item.value))}</span>
      </p>
      <p className="text-gray-500">
        <span className="font-medium">Participación:</span>{' '}
        <span className="tabular-nums">{formatPct(String(item.share))}</span>
      </p>
    </div>
  );
}

function CustomLegend({ payload }: { payload?: { color?: string; value?: string | number }[] }) {
  if (!payload) return null;
  return (
    <ul className="flex flex-col gap-1 text-xs text-gray-600 mt-2">
      {payload.map((entry, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="truncate max-w-[180px]">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChapterPieChart({ data, topN = 7, height = 280 }: ChapterPieChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-gray-400"
        style={{ height }}
        role="status"
        aria-label="Sin datos de distribución"
      >
        Sin datos de distribución
      </div>
    );
  }

  // Tomar los top N capítulos por subtotal; agrupar el resto en "Otros"
  const sorted = [...data].sort((a, b) => parseFloat(b.subtotal) - parseFloat(a.subtotal));
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);

  const pieData: PieDataPoint[] = top.map((slice) => ({
    name: slice.code,
    value: parseFloat(slice.subtotal),
    share: parseFloat(slice.share),
    fullName: `${slice.code} ${slice.name}`,
  }));

  if (rest.length > 0) {
    const othersValue = rest.reduce((acc, s) => acc + parseFloat(s.subtotal), 0);
    const othersShare = rest.reduce((acc, s) => acc + parseFloat(s.share), 0);
    pieData.push({
      name: 'Otros',
      value: othersValue,
      share: othersShare,
      fullName: `Otros (${rest.length} capítulos)`,
    });
  }

  return (
    <div aria-label="Participación de capítulos en costos directos">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={pieData}
            cx="40%"
            cy="50%"
            outerRadius={height / 2 - 20}
            dataKey="value"
            nameKey="fullName"
            stroke="none"
          >
            {pieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            content={<CustomLegend />}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
