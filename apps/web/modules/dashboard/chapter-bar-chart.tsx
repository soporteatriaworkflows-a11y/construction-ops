'use client';
/**
 * ChapterBarChart — gráfico de barras de distribución por capítulo.
 * Propiedad: agent-dashboard.
 *
 * Usa Recharts (MIT). Muestra subtotal por capítulo.
 * CERO cálculo financiero: los valores llegan como DecimalString ya calculados.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ChapterDistributionSlice } from '@/lib/contracts/read-model';
import { formatCOP, formatPct } from '@/lib/utils/format';

// Rampa ICONIC (navy → azul → cian). Coherente con la marca, sin arcoíris genérico.
const COLORS = [
  '#005DD6', // iconic primary
  '#00B8FF', // cyan
  '#013E97', // deep blue
  '#1E7FE0', // brand-400
  '#020148', // ink
  '#5AA6F0', // brand-300
  '#0050BC', // brand-600
  '#34557A', // graphite-blue
  '#9FCBF5', // brand-200
  '#012E73', // brand-800
  '#7CC4F7',
  '#1B1F3E', // graphite
  '#0E5AA8',
  '#C7DCED', // soft-blue
];

interface ChartDataPoint {
  name: string;
  subtotal: number;
  share: number;
  fullName: string;
}

interface ChapterBarChartProps {
  /** Datos de distribución por capítulo */
  data: ChapterDistributionSlice[];
  /** Altura del gráfico en px */
  height?: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Record<string, unknown>[] }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const item = entry?.payload as ChartDataPoint;
  if (!item) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-md text-sm max-w-56">
      <p className="font-semibold text-gray-800 mb-1 leading-tight">{item.fullName}</p>
      <p className="text-gray-700">
        <span className="font-medium">Subtotal:</span>{' '}
        <span className="tabular-nums">{formatCOP(String(item.subtotal))}</span>
      </p>
      <p className="text-gray-500">
        <span className="font-medium">Participación:</span>{' '}
        <span className="tabular-nums">{formatPct(String(item.share))}</span>
      </p>
    </div>
  );
}

export function ChapterBarChart({ data, height = 300 }: ChapterBarChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex h-[300px] items-center justify-center text-sm text-gray-400"
        role="status"
        aria-label="Sin datos de capítulos"
      >
        Sin datos de capítulos
      </div>
    );
  }

  const chartData: ChartDataPoint[] = data.map((slice) => ({
    name: slice.code,
    subtotal: parseFloat(slice.subtotal),
    share: parseFloat(slice.share),
    fullName: `${slice.code} ${slice.name}`,
  }));

  return (
    <div aria-label="Distribución de costos directos por capítulo">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 8, bottom: 24 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={48}
          />
          <YAxis
            tickFormatter={(v: number) =>
              new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                notation: 'compact',
                maximumFractionDigits: 0,
              }).format(v)
            }
            tick={{ fontSize: 11, fill: '#6b7280' }}
            width={72}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="subtotal" radius={[3, 3, 0, 0]} name="Subtotal">
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
