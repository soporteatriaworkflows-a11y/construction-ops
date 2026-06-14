/**
 * new-schedule-form.tsx — Formulario de creación de cronograma (cliente).
 * SCHEDULE_FROM_BOQ_V1, Fase 4. Selección proyecto/versión + opciones + preview
 * (read-only) antes de crear. El servidor revalida todo (permisos/RLS/RPC).
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  previewScheduleAction,
  createScheduleAction,
  type PreviewActionResult,
} from './actions';
import type { ScheduleCreationProject } from '@/server/planning';

interface Props {
  projects: ScheduleCreationProject[];
}

function buildFormData(state: FormState): FormData {
  const fd = new FormData();
  fd.set('estimateVersionId', state.versionId);
  fd.set('scheduleName', state.name);
  fd.set('startDate', state.startDate);
  fd.set('includeChapters', String(state.includeChapters));
  fd.set('onlyPositiveQuantity', String(state.onlyPositiveQuantity));
  fd.set('includeItemsWithoutApu', String(state.includeItemsWithoutApu));
  fd.set('createChapterMilestones', String(state.createChapterMilestones));
  fd.set('minDurationDays', String(state.minDurationDays));
  fd.set('defaultCrewSize', state.defaultCrewSize);
  return fd;
}

interface FormState {
  projectId: string;
  versionId: string;
  name: string;
  startDate: string;
  includeChapters: boolean;
  onlyPositiveQuantity: boolean;
  includeItemsWithoutApu: boolean;
  createChapterMilestones: boolean;
  minDurationDays: number;
  defaultCrewSize: string;
}

export function NewScheduleForm({ projects }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [state, setState] = useState<FormState>({
    projectId: projects[0]?.projectId ?? '',
    versionId: projects[0]?.versions[0]?.versionId ?? '',
    name: '',
    startDate: today,
    includeChapters: true,
    onlyPositiveQuantity: true,
    includeItemsWithoutApu: true,
    createChapterMilestones: false,
    minDurationDays: 1,
    defaultCrewSize: '1',
  });
  const [preview, setPreview] = useState<PreviewActionResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const versions = useMemo(
    () => projects.find((p) => p.projectId === state.projectId)?.versions ?? [],
    [projects, state.projectId],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const onProjectChange = (projectId: string) => {
    const p = projects.find((x) => x.projectId === projectId);
    setState((s) => ({ ...s, projectId, versionId: p?.versions[0]?.versionId ?? '' }));
    setPreview(null);
  };

  const runPreview = () => {
    setCreateError(null);
    startTransition(async () => {
      const result = await previewScheduleAction(null, buildFormData(state));
      setPreview(result);
    });
  };

  const runCreate = () => {
    setCreateError(null);
    startTransition(async () => {
      const result = await createScheduleAction(null, buildFormData(state));
      if (result?.error) setCreateError(result.error);
      // Éxito ⇒ el server redirige; no hay retorno.
    });
  };

  if (projects.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No hay presupuestos disponibles. Crea un presupuesto con capítulos e ítems antes de generar un cronograma.
      </p>
    );
  }

  const canSubmit = state.versionId !== '' && state.name.trim() !== '' && state.startDate !== '';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="project">Proyecto</Label>
          <select
            id="project"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={state.projectId}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.projectName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="version">Presupuesto / versión</Label>
          <select
            id="version"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={state.versionId}
            onChange={(e) => {
              set('versionId', e.target.value);
              setPreview(null);
            }}
          >
            {versions.map((v) => (
              <option key={v.versionId} value={v.versionId}>
                Versión {v.versionNumber} ({v.status})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="name">Nombre del cronograma</Label>
          <Input
            id="name"
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Cronograma base"
          />
        </div>
        <div>
          <Label htmlFor="start">Fecha de inicio</Label>
          <Input
            id="start"
            type="date"
            value={state.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="minDur">Duración mínima por actividad (días)</Label>
          <Input
            id="minDur"
            type="number"
            min={1}
            value={state.minDurationDays}
            onChange={(e) => set('minDurationDays', Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div>
          <Label htmlFor="crew">Tamaño de cuadrilla por defecto</Label>
          <Input
            id="crew"
            type="number"
            min={1}
            step="0.5"
            value={state.defaultCrewSize}
            onChange={(e) => set('defaultCrewSize', e.target.value)}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Opciones</legend>
        <Checkbox label="Incluir capítulos como tareas resumen" checked={state.includeChapters} onChange={(v) => set('includeChapters', v)} />
        <Checkbox label="Solo ítems con cantidad mayor a 0" checked={state.onlyPositiveQuantity} onChange={(v) => set('onlyPositiveQuantity', v)} />
        <Checkbox label="Incluir ítems sin APU (duración manual)" checked={state.includeItemsWithoutApu} onChange={(v) => set('includeItemsWithoutApu', v)} />
        <Checkbox label="Crear hito de cierre por capítulo" checked={state.createChapterMilestones} onChange={(v) => set('createChapterMilestones', v)} />
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={runPreview} disabled={!canSubmit || isPending}>
          {isPending ? 'Calculando…' : 'Vista previa'}
        </Button>
        <Button type="button" onClick={runCreate} disabled={!canSubmit || isPending}>
          Crear cronograma
        </Button>
      </div>

      {createError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {createError}
        </p>
      )}

      {preview && !preview.ok && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {preview.error}
        </p>
      )}

      {preview && preview.ok && <PreviewPanel preview={preview.preview} />}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function PreviewPanel({ preview }: { preview: Extract<PreviewActionResult, { ok: true }>['preview'] }) {
  const { stats, warnings } = preview;
  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-sm font-semibold text-gray-800">Vista previa (no se ha creado nada)</h3>
      <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 sm:grid-cols-4">
        <Stat label="Capítulos" value={stats.chapterCount} />
        <Stat label="Actividades" value={stats.activityCount} />
        <Stat label="Con rendimiento APU" value={stats.activitiesWithApu} />
        <Stat label="Sin APU" value={stats.activitiesWithoutApu} />
        <Stat label="Sin rendimiento" value={stats.activitiesWithoutRendimiento} />
        <Stat label="Hitos" value={stats.milestoneCount} />
        <Stat label="Total tareas" value={stats.totalTasks} />
        <Stat label="Duración (días)" value={stats.scheduleSpanDays} />
      </div>
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">{warnings.length} advertencia(s):</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
            {warnings.length > 8 && <li>… y {warnings.length - 8} más</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
