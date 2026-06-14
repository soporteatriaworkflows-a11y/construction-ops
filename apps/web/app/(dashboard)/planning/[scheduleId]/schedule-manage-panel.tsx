/**
 * schedule-manage-panel.tsx — Edición del cronograma (cliente).
 * SCHEDULE_FROM_BOQ_V1, Fase 5. Editar avance/duración/cuadrilla de una tarea,
 * agregar dependencias (FS/SS/FF/SF + lag) y archivar. El servidor revalida
 * permisos/RLS y recalcula fechas.
 */
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateTaskAction, addDependencyAction, archiveScheduleAction } from './actions';

export interface EditableTask {
  id: string;
  wbsCode: string;
  name: string;
  taskType: string | null;
  isMilestone: boolean;
  progressPct: string;
  durationDays: string;
  responsible: string | null;
  crewLabel: string | null;
  crewSize: string | null;
}

interface Props {
  scheduleId: string;
  tasks: EditableTask[];
  isArchived: boolean;
}

const DEP_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;

export function ScheduleManagePanel({ scheduleId, tasks, isArchived }: Props) {
  const editable = tasks.filter((t) => t.taskType !== 'chapter');
  const activities = editable.filter((t) => !t.isMilestone);

  const [selectedTaskId, setSelectedTaskId] = useState(editable[0]?.id ?? '');
  const selected = editable.find((t) => t.id === selectedTaskId);
  const [progress, setProgress] = useState('');
  const [duration, setDuration] = useState('');
  const [responsible, setResponsible] = useState('');
  const [crew, setCrew] = useState('');

  const [predId, setPredId] = useState(activities[0]?.id ?? '');
  const [succId, setSuccId] = useState(activities[1]?.id ?? '');
  const [depType, setDepType] = useState<(typeof DEP_TYPES)[number]>('FS');
  const [lag, setLag] = useState('0');

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSelect = (id: string) => {
    setSelectedTaskId(id);
    const t = editable.find((x) => x.id === id);
    setProgress(t ? String(Math.round(Number(t.progressPct))) : '');
    setDuration(t ? String(Math.round(Number(t.durationDays))) : '');
    setResponsible(t?.responsible ?? '');
    setCrew(t?.crewLabel ?? '');
  };

  const saveTask = () => {
    if (!selected) return;
    setMsg(null);
    startTransition(async () => {
      const patch: Parameters<typeof updateTaskAction>[2] = {};
      if (progress !== '') patch.progressPct = Number(progress);
      if (duration !== '' && !selected.isMilestone) patch.durationDays = Number(duration);
      patch.responsible = responsible.trim() === '' ? null : responsible.trim();
      patch.crewLabel = crew.trim() === '' ? null : crew.trim();
      const r = await updateTaskAction(scheduleId, selected.id, patch);
      setMsg(r.ok ? { ok: true, text: 'Tarea actualizada.' } : { ok: false, text: r.error ?? 'Error' });
    });
  };

  const addDep = () => {
    setMsg(null);
    if (predId === succId) {
      setMsg({ ok: false, text: 'Selecciona dos tareas distintas.' });
      return;
    }
    startTransition(async () => {
      const r = await addDependencyAction(scheduleId, predId, succId, depType, Number(lag) || 0);
      setMsg(r.ok ? { ok: true, text: 'Dependencia agregada.' } : { ok: false, text: r.error ?? 'Error' });
    });
  };

  const archive = () => {
    if (!confirm('¿Archivar este cronograma? Dejará de estar activo (no se borra).')) return;
    setMsg(null);
    startTransition(async () => {
      const r = await archiveScheduleAction(scheduleId);
      setMsg(r.ok ? { ok: true, text: 'Cronograma archivado.' } : { ok: false, text: r.error ?? 'Error' });
    });
  };

  if (isArchived) {
    return (
      <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Este cronograma está archivado (solo lectura).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${msg.ok ? 'border border-green-200 bg-green-50 text-green-700' : 'border border-red-200 bg-red-50 text-red-700'}`}
          role="status"
        >
          {msg.text}
        </p>
      )}

      {/* Editar tarea */}
      <div className="rounded-md border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">Editar tarea</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="task">Tarea</Label>
            <select
              id="task"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={selectedTaskId}
              onChange={(e) => onSelect(e.target.value)}
            >
              {editable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.wbsCode} — {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="progress">Avance (%)</Label>
            <Input id="progress" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="duration">Duración (días)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={selected?.isMilestone}
            />
          </div>
          <div>
            <Label htmlFor="responsible">Responsable</Label>
            <Input id="responsible" value={responsible} onChange={(e) => setResponsible(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="crew">Cuadrilla</Label>
            <Input id="crew" value={crew} onChange={(e) => setCrew(e.target.value)} />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={saveTask} disabled={isPending || !selected}>
          Guardar tarea
        </Button>
      </div>

      {/* Agregar dependencia */}
      {activities.length >= 2 && (
        <div className="rounded-md border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Agregar dependencia</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pred">Predecesora</Label>
              <select id="pred" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={predId} onChange={(e) => setPredId(e.target.value)}>
                {activities.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.wbsCode} — {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="succ">Sucesora</Label>
              <select id="succ" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={succId} onChange={(e) => setSuccId(e.target.value)}>
                {activities.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.wbsCode} — {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="depType">Tipo</Label>
              <select id="depType" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={depType} onChange={(e) => setDepType(e.target.value as (typeof DEP_TYPES)[number])}>
                {DEP_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="lag">Holgura (días)</Label>
              <Input id="lag" type="number" value={lag} onChange={(e) => setLag(e.target.value)} />
            </div>
          </div>
          <Button className="mt-3" size="sm" variant="outline" onClick={addDep} disabled={isPending}>
            Agregar dependencia
          </Button>
        </div>
      )}

      <div>
        <Button size="sm" variant="outline" onClick={archive} disabled={isPending}>
          Archivar cronograma
        </Button>
      </div>
    </div>
  );
}
