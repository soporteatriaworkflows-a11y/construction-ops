/**
 * /quote — Home del asistente de cotización (QUOTING_ASSISTED_MODE_V1).
 *
 * Server Component. Punto de entrada de la capa guiada: CTA a "Nueva cotización",
 * breve explicación, proyectos recientes (read-model) y accesos a las vistas
 * existentes (Biblioteca APU, Presupuestos, Cantidades). No reemplaza nada.
 */
import Link from 'next/link';
import { Sparkles, FolderOpen, Calculator, FileSpreadsheet, Ruler } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getReadModel } from '@/server/read-model';
import { QuoteCompanionOpenButton } from '../_components/quote-companion-trigger';

export const dynamic = 'force-dynamic';

export default async function QuoteHomePage() {
  let projects: Awaited<ReturnType<ReturnType<typeof getReadModel>['listProjects']>> = [];
  try {
    const viewer = await resolveViewer();
    projects = await getReadModel().listProjects(viewer);
  } catch {
    projects = [];
  }
  const recent = projects.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Cotizar con asistente"
        description="Un flujo guiado paso a paso sobre tu sistema actual: proyecto, presupuesto, capítulos, APU, cantidades, precios, semáforo y exportación."
      />

      {/* Hero / CTA */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-iconic-soft-blue bg-brand-50/60 px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iconic-primary/10 text-iconic-primary">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-iconic-ink">Nueva cotización asistida</p>
            <p className="mt-0.5 max-w-xl text-xs text-gray-600">
              Te guiamos para no saltarte ningún paso. Cada paso te lleva a las pantallas que ya conoces;
              el workspace técnico y el detalle del presupuesto siguen disponibles para usuarios expertos.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuoteCompanionOpenButton />
          <Button asChild>
            <Link href="/quote/new">Empezar</Link>
          </Button>
        </div>
      </div>

      {/* Proyectos recientes */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Proyectos recientes</h2>
      {recent.length === 0 ? (
        <p className="mb-6 rounded-md border bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No hay proyectos todavía.{' '}
          <Link href="/quote/new" className="font-medium text-iconic-primary hover:underline">Crea o elige uno para empezar.</Link>
        </p>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((p) => (
            <Link
              key={p.id}
              href={`/quote/new?projectId=${p.id}`}
              className="rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <FolderOpen className="h-4 w-4 text-iconic-primary" aria-hidden="true" />
                <span className="truncate">{p.name}</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {p.estimateCount} presupuesto{p.estimateCount !== 1 ? 's' : ''} · {p.scopeCount} alcance{p.scopeCount !== 1 ? 's' : ''}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* Accesos a vistas existentes */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Atajos</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ShortcutLink href="/quote/new" icon={Sparkles} label="Nueva cotización" />
        <ShortcutLink href="/apu?view=cards" icon={Calculator} label="Biblioteca APU" />
        <ShortcutLink href="/estimates" icon={FileSpreadsheet} label="Presupuestos" />
        <ShortcutLink href="/quantities" icon={Ruler} label="Cantidades" />
      </div>
    </div>
  );
}

function ShortcutLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
      <Icon className="h-4 w-4 text-iconic-primary" aria-hidden={true} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
