/**
 * schedule-status-badge.tsx — Badge de estado de tarea del cronograma.
 *
 * Propiedad: agent-planning. Server-safe (sin estado de cliente). Mapea el
 * `ScheduleTaskStatus` a una variante del `Badge` compartido.
 */

import { Badge } from '@/components/ui/badge';
import type { ScheduleTaskStatus } from '@/modules/planning';

/** Etiquetas es-CO de los estados de tarea. */
export const SCHEDULE_TASK_STATUS_LABELS: Record<ScheduleTaskStatus, string> = {
  not_started: 'Sin iniciar',
  in_progress: 'En progreso',
  completed: 'Completada',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
};

const STATUS_VARIANTS: Record<
  ScheduleTaskStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  not_started: 'secondary',
  in_progress: 'default',
  completed: 'success',
  blocked: 'warning',
  cancelled: 'outline',
};

interface ScheduleStatusBadgeProps {
  status: ScheduleTaskStatus;
}

export function ScheduleStatusBadge({ status }: ScheduleStatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {SCHEDULE_TASK_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
