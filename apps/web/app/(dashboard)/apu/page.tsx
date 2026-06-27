/**
 * /apu — Biblioteca APU compacta (APU_LIBRARY_OPERATIONAL_UX_V1).
 *
 * Server Component. Encabezado con métricas + tabla compacta con búsqueda,
 * filtros, ordenamiento y paginación server-side (GET form; sin scroll infinito
 * como única navegación). NO despliega componentes en la vista principal.
 * Consume `getApuLibrary` (compone read-model + reconciliación, sin recalcular
 * finanzas). Acciones de mutación solo para management/internal.
 */
import Link from 'next/link';
import { Calculator, FileSpreadsheet, GitMerge, Link2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { OperationsHeader } from '@/components/shared/operations-header';
import { KpiCard, KpiBand } from '@/components/shared/kpi-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCOP } from '@/lib/utils/format';
import { getApuLibrary } from '@/server/apu-library/service';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type {
  ApuLibraryFilter,
  ApuLibraryItem,
  ApuLibraryResult,
  ApuLibrarySort,
} from '@/lib/apu-library/types';
import { ApuResourceBadge } from './_components/apu-resource-badge';
import {
  ApuActivityCard,
  ApuLibraryFilters,
  ApuLibraryToolbar,
} from './_components/apu-library-cards';

export const dynamic = 'force-dynamic';

const FILTERS: { value: ApuLibraryFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'linked', label: 'Vinculadas BOQ' },
  { value: 'unlinked', label: 'Sin vínculo BOQ' },
  { value: 'complete', label: 'Completas' },
  { value: 'with_suggestions', label: 'Con sugerencias' },
  { value: 'unresolved', label: 'Sin resolver' },
  { value: 'ambiguous', label: 'Ambiguas' },
  { value: 'archived', label: 'Archivadas' },
];

const SORTS: { value: ApuLibrarySort; label: string }[] = [
  { value: 'code', label: 'Código' },
  { value: 'name', label: 'Descripción' },
  { value: 'cost', label: 'Costo' },
  { value: 'components', label: 'Nº componentes' },
  { value: 'warnings', label: 'Advertencias' },
];

const PAGE_SIZES = [25, 50, 100];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(v: string | string[] | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;
}

export default async function ApuPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(str(sp.page, '1'), 10) || 1);
  const pageSize = Number.parseInt(str(sp.size, '25'), 10) || 25;
  const search = str(sp.q);
  const filter = (str(sp.filter, 'all') as ApuLibraryFilter) || 'all';
  const sort = (str(sp.sort, 'code') as ApuLibrarySort) || 'code';
  const origin = str(sp.origin) || null;
  // APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1: vista tarjetas (convive con workspace).
  const view: 'cards' | 'workspace' = str(sp.view) === 'cards' ? 'cards' : 'workspace';
  const category = str(sp.category);
  const unit = str(sp.unit);
  const completeness = str(sp.completeness);
  const cardsArchived = str(sp.archived) === '1';

  let result: ApuLibraryResult | null = null;
  let error: string | null = null;
  let canMutate = false;

  try {
    const viewer = await resolveViewer();
    canMutate = isCreationModeEnabled() && ['management', 'internal'].includes(viewer.role);
    result = await getApuLibrary(viewer as AuthenticatedViewer, {
      page,
      pageSize,
      search,
      filter,
      sort,
      origin,
      unit: view === 'cards' ? unit : null,
      category: view === 'cards' ? category : null,
      completeness: view === 'cards' ? completeness : null,
      showArchived: view === 'cards' ? cardsArchived : filter === 'archived',
    });
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar la biblioteca APU';
  }

  const actions = (
    <div className="flex gap-2">
      {canMutate && (
        <Button size="sm" asChild>
          <Link href="/apu/new">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Nuevo APU
          </Link>
        </Button>
      )}
      {canMutate && (
        <Button size="sm" variant="outline" asChild>
          <Link href="/apu/reconciliation">
            <GitMerge className="mr-1 h-4 w-4" aria-hidden="true" />
            Reconciliar recursos
          </Link>
        </Button>
      )}
      {canMutate && (
        <Button size="sm" variant="outline" asChild>
          <Link href="/apu/import">
            <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />
            Importar APU
          </Link>
        </Button>
      )}
    </div>
  );

  if (error) {
    return (
      <div>
        <PageHeader title="Biblioteca de APU" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          Error al cargar la biblioteca APU: {error}
        </div>
      </div>
    );
  }

  if (!result || result.stats.totalApus === 0) {
    return (
      <div>
        <PageHeader title="Biblioteca de APU" actions={canMutate ? actions : undefined} />
        <EmptyState
          icon={Calculator}
          title="Sin plantillas APU"
          description={
            canMutate
              ? 'Crea un APU manualmente a partir de recursos del catálogo, o importa la hoja APU del workbook del proyecto.'
              : 'Las plantillas APU se crean desde el proceso de importación del presupuesto.'
          }
          action={
            canMutate ? (
              <div className="flex gap-2">
                <Button size="sm" asChild>
                  <Link href="/apu/new">Nuevo APU</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/apu/import">Importar APU</Link>
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { items, stats, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / result.pageSize));

  // Vista TARJETAS: actividades reutilizables (convive con el workspace técnico).
  if (view === 'cards') {
    return (
      <div>
        <OperationsHeader
          eyebrow="APU"
          title="Biblioteca reutilizable"
          subtitle="Actividades reutilizables para cotizar proyectos."
          stat={{ label: 'Actividades', value: String(stats.totalApus) }}
          actions={actions}
        />
        <KpiBand className="mb-4">
          <KpiCard label="Actividades" value={stats.totalApus} />
          <KpiCard label="Componentes" value={stats.totalComponents} />
          <KpiCard label="Vinculadas BOQ" value={stats.linkedToBoq} tone={stats.linkedToBoq > 0 ? 'ok' : 'default'} />
          <KpiCard label="Completas" value={stats.complete} tone="ok" href="/apu?view=cards&completeness=ready" hint="Listas para usar" />
          <KpiCard label="Con pendientes" value={stats.withPending} tone={stats.withPending > 0 ? 'warn' : 'default'} href="/apu?view=cards&completeness=review" hint="Requieren revisión" />
          <KpiCard label="Sin resolver" value={stats.withUnresolved} tone={stats.withUnresolved > 0 ? 'danger' : 'default'} href="/apu?view=cards&completeness=incomplete" hint="Incompletas" />
        </KpiBand>
        <ApuLibraryToolbar activeView="cards" canMutate={canMutate} />
        <ApuLibraryFilters
          values={{ q: search, category, unit, completeness, size: result.pageSize, showArchived: cardsArchived }}
          units={result.units ?? []}
        />
        {items.length === 0 ? (
          <div className="rounded-md border bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            No hay actividades que coincidan con los filtros.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <ApuActivityCard key={item.id} item={item} canMutate={canMutate} />
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>{total} actividad{total !== 1 ? 'es' : ''} · página {result.page} de {totalPages}</span>
          <div className="flex gap-2">
            <PageLink sp={sp} page={result.page - 1} disabled={result.page <= 1} label="Anterior" />
            <PageLink sp={sp} page={result.page + 1} disabled={result.page >= totalPages} label="Siguiente" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <OperationsHeader
        eyebrow="APU"
        title="Biblioteca reutilizable"
        subtitle="Análisis de Precios Unitarios reutilizables por proyecto"
        stat={{ label: 'Actividades', value: String(stats.totalApus) }}
        actions={actions}
      />
      <ApuLibraryToolbar activeView="workspace" canMutate={canMutate} />

      {/* Métricas de encabezado */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="APU" value={stats.totalApus} />
        <Stat label="Componentes" value={stats.totalComponents} />
        <Stat label="Vinculadas BOQ" value={stats.linkedToBoq} />
        <Stat label="Completas" value={stats.complete} tone="green" />
        <Stat label="Con pendientes" value={stats.withPending} tone="amber" />
        <Stat label="Sin resolver" value={stats.withUnresolved} tone="red" />
      </div>

      {/* Búsqueda + filtros + orden (GET, server-side) */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-md border bg-gray-50/50 p-3 dark:border-line dark:bg-surface-soft">
        <Field label="Buscar">
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Código, descripción, componente, recurso…"
            className="h-9 w-64 rounded-md border border-gray-300 px-3 text-sm"
          />
        </Field>
        <Field label="Filtro">
          <select name="filter" defaultValue={filter} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Ordenar">
          <select name="sort" defaultValue={sort} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        {result.origins.length > 0 && (
          <Field label="Origen">
            <select name="origin" defaultValue={origin ?? ''} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
              <option value="">Todos</option>
              {result.origins.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Por página">
          <select name="size" defaultValue={String(result.pageSize)} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Button type="submit" size="sm">Aplicar</Button>
      </form>

      {/* Tabla compacta */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Actividad</th>
              <th className="px-3 py-2 font-medium">Unidad</th>
              <th className="px-3 py-2 font-medium text-right">Comp.</th>
              <th className="px-3 py-2 font-medium text-right">Costo unitario</th>
              <th className="px-3 py-2 font-medium">BOQ</th>
              <th className="px-3 py-2 font-medium">Recursos</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Origen</th>
              <th className="px-3 py-2 font-medium text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ApuRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
        <span>
          {total} resultado{total !== 1 ? 's' : ''} · página {result.page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <PageLink sp={sp} page={result.page - 1} disabled={result.page <= 1} label="Anterior" />
          <PageLink sp={sp} page={result.page + 1} disabled={result.page >= totalPages} label="Siguiente" />
        </div>
      </div>
    </div>
  );
}

function ApuRow({ item }: { item: ApuLibraryItem }) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-gray-50/50 dark:border-line dark:hover:bg-surface-muted">
      <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.code}</td>
      <td className="px-3 py-2">
        <Link href={`/apu/${item.id}`} className="font-medium text-gray-900 hover:text-blue-700">
          {item.name}
        </Link>
      </td>
      <td className="px-3 py-2 text-gray-600">{item.unit}</td>
      <td className="px-3 py-2 text-right tabular-nums">{item.componentCount}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums text-blue-700">
        {formatCOP(item.unitCost)}
      </td>
      <td className="px-3 py-2">
        {item.boqLinked ? (
          <Badge variant="secondary" className="gap-1">
            <Link2 className="h-3 w-3" /> Sí
          </Badge>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <ApuResourceBadge status={item.resourceStatus} />
      </td>
      <td className="px-3 py-2">
        {item.archivedAt ? (
          <Badge variant="secondary" className="bg-red-100 text-red-700">Archivado</Badge>
        ) : item.isIncomplete ? (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700">Incompleto</Badge>
        ) : (
          <span className="text-xs text-gray-400">Activo</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{item.origin}</td>
      <td className="px-3 py-2 text-right">
        <Link href={`/apu/${item.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-900">
          Abrir
        </Link>
      </td>
    </tr>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' }) {
  const toneClass =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-700'
          : 'text-gray-900';
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function PageLink({
  sp,
  page,
  disabled,
  label,
}: {
  sp: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-md border px-3 py-1 text-gray-300">{label}</span>
    );
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') params.set(k, v);
  }
  params.set('page', String(page));
  return (
    <Link
      href={`/apu?${params.toString()}`}
      className="rounded-md border px-3 py-1 text-blue-700 hover:bg-blue-50"
    >
      {label}
    </Link>
  );
}
