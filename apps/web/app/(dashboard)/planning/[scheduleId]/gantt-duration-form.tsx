/**
 * gantt-duration-form.tsx — Edición controlada de duración desde el panel del
 * Gantt (P2B3). SOLO presentación + llamada a la action existente.
 *
 * Reusa `updateTaskAction(scheduleId, taskId, { durationDays })` (SCHEDULE_
 * FROM_BOQ_V1 Fase 5): el servidor valida duración >= 1, re-verifica el
 * permiso ESTRUCTURAL (admin/gerencia/presupuestos; RPC/RLS detrás), recalcula
 * fecha fin y dependencias, y revalida la página. Una tarea por vez; nada de
 * edición masiva, costos, precios, AIU, BOQ/APU ni rendimientos.
 *
 * El montaje de este formulario lo gatea la shell (`canEditDuration`): los
 * roles sin permiso estructural (consulta, obra, compras) NUNCA lo ven — para
 * ellos la duración queda solo lectura en el panel, sin mensajes agresivos.
 */
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateTaskAction } from './actions';
import type { WorkspaceTask } from './schedule-workspace-filter';

interface Props {
  scheduleId: string;
  /** Actividad seleccionada (la shell excluye capítulos e hitos). */
  task: WorkspaceTask;
}

export function GanttDurationForm({ scheduleId, task }: Props) {
  const [duration, setDuration] = useState(() => {
    const current = Math.round(Number(task.plannedDurationDays));
    return String(Number.isFinite(current) && current >= 1 ? current : 1);
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = Number(duration);
  const valid = Number.isInteger(parsed) && parsed >= 1;

  const save = () => {
    if (!valid || isPending) return;
    setMsg(null);
    startTransition(async () => {
      const r = await updateTaskAction(scheduleId, task.id, { durationDays: parsed });
      setMsg(
        r.ok
          ? { ok: true, text: 'Duración actualizada. Fechas recalculadas.' }
          : { ok: false, text: r.error ?? 'No se pudo guardar la duración.' },
      );
    });
  };

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold text-gray-900">Editar duración</p>
      <div>
        <Label htmlFor="ganttDurationDays" className="mb-1 block text-xs font-medium text-gray-600">
          Duración en días
        </Label>
        <Input
          id="ganttDurationDays"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-28"
        />
        {!valid && (
          <p className="mt-1 text-xs text-red-600">Ingresa un número entero de días (mínimo 1).</p>
        )}
      </div>
      <Button type="button" size="sm" onClick={save} disabled={!valid || isPending}>
        {isPending ? 'Guardando…' : 'Guardar duración'}
      </Button>
      <p className="text-xs text-gray-500">
        Al guardar, la fecha fin y las tareas dependientes se recalculan en el servidor.
      </p>
      {msg && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-xs ${
            msg.ok
              ? 'border border-green-200 bg-green-50 text-green-800'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
