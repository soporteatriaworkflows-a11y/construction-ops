/**
 * apu-library-cards.tsx — Componentes de presentación de la vista TARJETAS de la
 * Biblioteca APU (APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1). Server-safe (sin estado
 * cliente): los filtros son un GET form, igual que el workspace técnico. No
 * recalculan finanzas; consumen el read-model/helpers puros.
 */
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCOP } from '@/lib/utils/format';
import type { ApuLibraryItem } from '@/lib/apu-library/types';
import {
  computeApuCompleteness,
  editableCapabilities,
  type ApuCompletenessState,
  type ApuIssue,
} from '@/lib/apu-library/completeness';
import { APU_CATEGORIES } from '@/lib/apu-library/category';

const STATE_STYLE: Record<ApuCompletenessState, { cls: string }> = {
  ready: { cls: 'bg-green-100 text-green-700' },
  review: { cls: 'bg-amber-100 text-amber-700' },
  incomplete: { cls: 'bg-red-100 text-red-700' },
  archived: { cls: 'bg-gray-200 text-gray-600' },
};

export function ApuCompletenessBadge({ state, label }: { state: ApuCompletenessState; label: string }) {
  return <Badge variant="secondary" className={STATE_STYLE[state].cls}>{label}</Badge>;
}

const SEV_STYLE: Record<ApuIssue['severity'], string> = {
  critical: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-gray-400',
};

export function ApuIssueList({ issues, max = 3 }: { issues: ApuIssue[]; max?: number }) {
  if (issues.length === 0) {
    return <p className="text-[11px] text-green-600">Sin pendientes</p>;
  }
  const shown = issues.slice(0, max);
  return (
    <ul className="space-y-0.5">
      {shown.map((i) => (
        <li key={i.code} className={`text-[11px] ${SEV_STYLE[i.severity]}`}>
          {i.severity === 'critical' ? '● ' : i.severity === 'warning' ? '▲ ' : '· '}
          {i.message}
        </li>
      ))}
      {issues.length > max && <li className="text-[11px] text-gray-400">+{issues.length - max} más…</li>}
    </ul>
  );
}

export function ApuActivityCard({ item, canMutate }: { item: ApuLibraryItem; canMutate: boolean }) {
  const completeness = computeApuCompleteness(item);
  const caps = editableCapabilities(item);
  const tc = item.typeCounts;

  return (
    <div className="flex flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/apu/${item.id}`} className="block truncate font-semibold text-gray-900 hover:text-blue-700">
            {item.name}
          </Link>
          <p className="mt-0.5 text-xs text-gray-400">
            <span className="font-mono">{item.code}</span> · {item.unit} · {item.category ?? 'Sin categoría'}
          </p>
        </div>
        <ApuCompletenessBadge state={completeness.state} label={completeness.label} />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-xs text-gray-400">Precio unitario</span>
        <span className="text-lg font-bold tabular-nums text-blue-700">{formatCOP(item.unitCost)}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-gray-500">
        <span className="rounded bg-gray-100 px-1.5 py-0.5">{item.componentCount} comp.</span>
        {tc && tc.material > 0 && <span className="rounded bg-gray-100 px-1.5 py-0.5">{tc.material} material</span>}
        {tc && tc.labor > 0 && <span className="rounded bg-gray-100 px-1.5 py-0.5">{tc.labor} M.O.</span>}
        {tc && (tc.equipment + tc.tool) > 0 && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5">{tc.equipment + tc.tool} equipo/herr.</span>
        )}
        {item.boqLinked && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">Vinculado BOQ</span>}
      </div>

      {caps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {caps.map((c) => (
            <span key={c} className="rounded-full bg-iconic-soft-blue/20 px-1.5 py-0.5 text-[10px] font-medium text-iconic-primary ring-1 ring-inset ring-iconic-soft-blue/40">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 min-h-[2.5rem] border-t pt-2">
        <ApuIssueList issues={completeness.issues} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={`/apu/${item.id}`}>Abrir</Link>
        </Button>
        {canMutate ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/apu/${item.id}?tab=componentes`}>Editar componentes</Link>
          </Button>
        ) : (
          <span className="text-[11px] text-gray-400">Solo lectura</span>
        )}
        <span
          className="cursor-not-allowed text-[11px] text-gray-300"
          title="Vincular a BOQ desde tarjetas — disponible en próxima oleada"
        >
          Vincular a BOQ ·{' '}
          <span className="italic">próxima oleada</span>
        </span>
      </div>
    </div>
  );
}

export interface LibraryFilterValues {
  q: string;
  category: string;
  unit: string;
  completeness: string;
  size: number;
  showArchived: boolean;
}

const COMPLETENESS_OPTS = [
  { value: '', label: 'Todos los estados' },
  { value: 'ready', label: 'Listo para usar' },
  { value: 'review', label: 'Requiere revisión' },
  { value: 'incomplete', label: 'Incompleto' },
  { value: 'archived', label: 'Archivado' },
];

export function ApuLibraryFilters({ values, units }: { values: LibraryFilterValues; units: string[] }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-md border bg-gray-50/50 p-3">
      <input type="hidden" name="view" value="cards" />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Buscar actividad</span>
        <input type="search" name="q" defaultValue={values.q} placeholder="Nombre, código, recurso…" className="h-9 w-60 rounded-md border border-gray-300 px-3 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Categoría</span>
        <select name="category" defaultValue={values.category} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
          <option value="">Todas</option>
          {APU_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Unidad</span>
        <select name="unit" defaultValue={values.unit} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
          <option value="">Todas</option>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Estado</span>
        <select name="completeness" defaultValue={values.completeness} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
          {COMPLETENESS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-xs font-medium text-gray-500">
        <input type="checkbox" name="archived" value="1" defaultChecked={values.showArchived} /> Incluir archivados
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Por página</span>
        <select name="size" defaultValue={String(values.size)} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
          {[25, 50, 100].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <Button type="submit" size="sm">Aplicar</Button>
    </form>
  );
}

export function ApuLibraryToolbar({ activeView, canMutate }: { activeView: 'cards' | 'workspace'; canMutate: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-1 rounded-md border bg-white p-1 text-sm w-fit">
      <Link
        href="/apu?view=cards"
        className={`rounded px-3 py-1.5 font-medium ${activeView === 'cards' ? 'bg-iconic-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        Tarjetas
      </Link>
      <Link
        href="/apu"
        className={`rounded px-3 py-1.5 font-medium ${activeView === 'workspace' ? 'bg-iconic-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        Workspace técnico
      </Link>
    </div>
  );
}
