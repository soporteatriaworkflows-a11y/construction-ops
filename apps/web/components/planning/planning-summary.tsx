/**
 * planning-summary.tsx — Tarjetas de resumen del cronograma (Oleada 3B).
 *
 * Propiedad: agent-planning. Server-safe. Muestra avance físico agregado,
 * fechas/duración de proyecto (ruta crítica) y conteo de hitos. La tarjeta de
 * ruta crítica SÓLO se renderiza cuando hay datos (roles autorizados).
 */

import { Activity, CalendarRange, Flag, AlertTriangle } from 'lucide-react';
import type { CriticalPathSummary } from '@/modules/planning';
import { formatDate, formatNumber } from '@/lib/utils/format';

interface PlanningSummaryProps {
  physicalProgressPct: string;
  milestoneCount: number;
  delayCount: number;
  /** 🔒 sólo roles autorizados; `undefined` para `client`. */
  criticalPath?: CriticalPathSummary;
}

interface CardProps {
  title: string;
  value: string;
  description?: string;
  icon: React.ReactNode;
  iconBg: string;
  valueColor?: string;
}

function Card({ title, value, description, icon, iconBg, valueColor }: CardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className={`mt-1 text-2xl font-bold ${valueColor ?? 'text-gray-900'}`}>
            {value}
          </p>
          {description && (
            <p className="mt-0.5 text-xs text-gray-400">{description}</p>
          )}
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

export function PlanningSummary({
  physicalProgressPct,
  milestoneCount,
  delayCount,
  criticalPath,
}: PlanningSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        title="Avance físico"
        value={`${formatNumber(physicalProgressPct, 1)}%`}
        description="Ponderado por duración"
        valueColor="text-blue-700"
        icon={<Activity className="h-4 w-4 text-blue-700" />}
        iconBg="bg-blue-50"
      />
      {criticalPath && (
        <Card
          title="Duración del proyecto"
          value={`${formatNumber(criticalPath.durationDays, 0)} d`}
          description={`${formatDate(criticalPath.projectStart)} → ${formatDate(criticalPath.projectEnd)}`}
          icon={<CalendarRange className="h-4 w-4 text-green-700" />}
          iconBg="bg-green-50"
        />
      )}
      <Card
        title="Hitos"
        value={String(milestoneCount)}
        description="Puntos de control"
        icon={<Flag className="h-4 w-4 text-purple-700" />}
        iconBg="bg-purple-50"
      />
      <Card
        title="Tareas atrasadas"
        value={String(delayCount)}
        description="Sobre umbral de atraso"
        valueColor={delayCount > 0 ? 'text-red-700' : 'text-gray-900'}
        icon={<AlertTriangle className="h-4 w-4 text-amber-700" />}
        iconBg="bg-amber-50"
      />
    </div>
  );
}
