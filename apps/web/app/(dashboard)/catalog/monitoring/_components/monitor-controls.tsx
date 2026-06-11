/**
 * monitor-controls.tsx — Controles cliente del monitoreo (Fase 4A).
 * 'use client'. Solo se renderizan a roles autorizados (decisión server-side).
 */
'use client';

import { useActionState } from 'react';
import { Loader2, Play, Pause, PlayCircle, RefreshCw, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createMonitorTargetAction,
  toggleMonitorTargetAction,
  updateMonitorCadenceAction,
  runMonitorNowAction,
} from '../actions';
import type { MonitorActionResult } from '../actions';

const INITIAL: MonitorActionResult | null = null;

const CADENCE_OPTIONS = [
  { value: 1, label: 'Diaria (1 día)' },
  { value: 7, label: 'Semanal (7 días)' },
  { value: 15, label: 'Quincenal (15 días)' },
  { value: 30, label: 'Mensual (30 días)' },
];

/** Formulario «Monitorear esta fuente» (crea el target explícito). */
export function EnableMonitoringForm({
  resourceId,
  defaultUrl,
}: {
  resourceId: string;
  defaultUrl?: string;
}) {
  const [state, formAction, isPending] = useActionState(createMonitorTargetAction, INITIAL);

  return (
    <form action={formAction} className="space-y-3" aria-label="Monitorear esta fuente">
      <input type="hidden" name="resourceId" value={resourceId} />
      <div>
        <label htmlFor="monitor-source-url" className="mb-1 block text-xs font-medium text-gray-600">
          URL pública de la fuente <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="monitor-source-url"
          name="sourceUrl"
          type="url"
          required
          defaultValue={defaultUrl ?? ''}
          placeholder="https://proveedor.com/producto"
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary disabled:opacity-50"
          aria-invalid={!!state?.fieldErrors?.sourceUrl}
        />
        {state?.fieldErrors?.sourceUrl && (
          <p className="mt-1 text-xs text-red-600" role="alert">{state.fieldErrors.sourceUrl}</p>
        )}
      </div>
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="monitor-cadence" className="mb-1 block text-xs font-medium text-gray-600">
            Frecuencia
          </label>
          <select
            id="monitor-cadence"
            name="cadenceDays"
            defaultValue="7"
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary disabled:opacity-50"
          >
            {CADENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {state?.fieldErrors?.cadenceDays && (
            <p className="mt-1 text-xs text-red-600" role="alert">{state.fieldErrors.cadenceDays}</p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={isPending} aria-busy={isPending}>
          {isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <Radar className="h-3.5 w-3.5" aria-hidden="true" />}
          {isPending ? 'Habilitando…' : 'Monitorear esta fuente'}
        </Button>
      </div>
      {state?.error && (
        <p className="text-xs text-red-600" role="alert">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-emerald-700" role="status">
          Monitoreo habilitado. La fuente se revisará automáticamente según la frecuencia.
        </p>
      )}
    </form>
  );
}

/** Pausar / reanudar un target. */
export function TargetToggleButton({
  targetId,
  enabled,
  resourceId,
}: {
  targetId: string;
  enabled: boolean;
  resourceId?: string;
}) {
  const [state, formAction, isPending] = useActionState(toggleMonitorTargetAction, INITIAL);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
      {resourceId && <input type="hidden" name="resourceId" value={resourceId} />}
      {state?.error && (
        <span className="mr-2 text-xs text-red-600" role="alert">{state.error}</span>
      )}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-busy={isPending}
        title={enabled ? 'Pausar monitoreo' : 'Reanudar monitoreo'}
      >
        {isPending
          ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          : enabled
            ? <Pause className="h-3 w-3" aria-hidden="true" />
            : <Play className="h-3 w-3" aria-hidden="true" />}
        {enabled ? 'Pausar' : 'Reanudar'}
      </Button>
    </form>
  );
}

/** Selector de frecuencia de un target existente (submit on change). */
export function CadenceForm({
  targetId,
  cadenceDays,
  resourceId,
}: {
  targetId: string;
  cadenceDays: number;
  resourceId?: string;
}) {
  const [state, formAction, isPending] = useActionState(updateMonitorCadenceAction, INITIAL);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="targetId" value={targetId} />
      {resourceId && <input type="hidden" name="resourceId" value={resourceId} />}
      <select
        name="cadenceDays"
        defaultValue={String(cadenceDays)}
        disabled={isPending}
        aria-label="Frecuencia de revisión"
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary disabled:opacity-50"
      >
        {CADENCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="ghost" disabled={isPending} aria-busy={isPending} className="text-xs">
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : 'Guardar'}
      </Button>
      {state?.error && <span className="text-xs text-red-600" role="alert">{state.error}</span>}
    </form>
  );
}

/** «Revisar ahora» (target individual) o «Ejecutar revisión ahora» (org). */
export function RunNowButton({
  targetId,
  resourceId,
  label,
}: {
  targetId?: string;
  resourceId?: string;
  label?: string;
}) {
  const [state, formAction, isPending] = useActionState(runMonitorNowAction, INITIAL);
  const text = label ?? (targetId ? 'Revisar ahora' : 'Ejecutar revisión ahora');

  return (
    <form action={formAction} className="inline">
      {targetId && <input type="hidden" name="targetId" value={targetId} />}
      {resourceId && <input type="hidden" name="resourceId" value={resourceId} />}
      <span className="inline-flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={isPending} aria-busy={isPending}>
          {isPending
            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            : targetId
              ? <RefreshCw className="h-3 w-3" aria-hidden="true" />
              : <PlayCircle className="h-3 w-3" aria-hidden="true" />}
          {isPending ? 'Revisando…' : text}
        </Button>
        {state?.error && <span className="text-xs text-red-600" role="alert">{state.error}</span>}
        {state?.success && state.runSummary && (
          <span className="text-xs text-emerald-700" role="status">
            Revisados {state.runSummary.checked}: {state.runSummary.unchanged} sin cambio,{' '}
            {state.runSummary.pendingCreated + state.runSummary.changed} con cambio,{' '}
            {state.runSummary.failed} con error.
          </span>
        )}
      </span>
    </form>
  );
}
