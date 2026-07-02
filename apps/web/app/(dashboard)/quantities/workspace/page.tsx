/**
 * page.tsx — Mediciones de cantidades (creación manual).
 * Server Component. Lista los grupos de workspace de los alcances del proyecto.
 * Propiedad: agent-frontend-boq. NO recalcula resultados (vienen del read-model).
 */
import Link from 'next/link';
import { Hash, Plus, Link2, ArrowRightLeft } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import type { WorkspaceGroupView } from '@/lib/contracts/read-model';
import { QuantitiesShell } from '../_components/quantities-shell';

export const dynamic = 'force-dynamic';

export default async function QuantityWorkspacePage() {
  const rm = getReadModel();
  let groups: WorkspaceGroupView[] = [];
  let canCreate = false;
  let error: string | null = null;

  try {
    const viewer = await resolveViewer();
    canCreate = isCreationModeEnabled() && ['management', 'internal'].includes(viewer.role);
    groups = await rm.listWorkspaceGroups(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar mediciones';
  }

  const newCta = (
    <Button asChild size="sm">
      <Link href="/quantities/workspace/new">
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Nueva medición
      </Link>
    </Button>
  );

  const actions = (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/quantities?tab=imports">Memorias importadas</Link>
      </Button>
      {canCreate ? newCta : null}
    </div>
  );

  if (error) {
    return (
      <QuantitiesShell activeTab="measurements" actions={actions}>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          Error: {error}
        </div>
      </QuantitiesShell>
    );
  }

  return (
    <QuantitiesShell activeTab="measurements" stat={{ label: 'Mediciones', value: String(groups.length) }} actions={actions}>
      {groups.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="Sin mediciones"
          description={
            canCreate
              ? 'Crea una medición para revisar bruto/neto y enviarla al presupuesto con preview.'
              : 'No hay mediciones visibles para tu rol. Cuando el equipo de presupuestos cree grupos, aparecerán aquí sin mostrar acciones de creación.'
          }
          action={canCreate ? newCta : undefined}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const linkedCount = group.lines.filter((l) => l.boqItemId).length;
            return (
              <Card key={group.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline">{group.code}</Badge>
                        {group.templateKind === 'mixed_wall' && <Badge variant="secondary">Muro mixto</Badge>}
                        <span className="text-xs text-gray-400">
                          {[group.floor, group.module, group.space, group.element].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <CardTitle className="text-base">{group.name}</CardTitle>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Neto ({group.resultUnit})</div>
                      <div className="tabular-nums text-lg font-bold text-blue-700">{formatNumber(group.totalNet, 4)}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {group.lines.length === 0 ? (
                    <p className="text-sm italic text-gray-400">Sin líneas de medición.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" aria-label={`Líneas de ${group.name}`}>
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-500">
                            <th className="pb-2 text-left font-medium">Descripción</th>
                            <th className="pb-2 text-left font-medium">Cálculo</th>
                            <th className="pb-2 text-right font-medium">Bruto</th>
                            <th className="pb-2 text-right font-medium">Neto</th>
                            <th className="pb-2 text-center font-medium">BOQ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {group.lines.map((line) => (
                            <tr key={line.id} className="hover:bg-gray-50">
                              <td className="py-1.5 text-gray-700">{line.description || '—'}</td>
                              <td className="py-1.5 text-xs text-gray-400">{line.formulaType}</td>
                              <td className="py-1.5 text-right tabular-nums text-gray-500">{formatNumber(line.resultGross, 4)}</td>
                              <td className="py-1.5 text-right font-medium tabular-nums text-gray-900">
                                {formatNumber(line.resultNet, 4)} {line.resultUnit}
                              </td>
                              <td className="py-1.5 text-center">
                                {line.boqItemId ? (
                                  <Link2 className="mx-auto h-4 w-4 text-green-600" aria-label="Vinculado a BOQ" />
                                ) : line.apuTemplateId ? (
                                  <span className="text-xs text-amber-600">APU listo</span>
                                ) : (
                                  <span className="text-xs text-gray-300">sin APU</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {linkedCount} de {group.lines.length} líneas vinculadas al presupuesto
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/quantities/workspace/${group.id}/sync`}>
                        <ArrowRightLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Enviar al presupuesto
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </QuantitiesShell>
  );
}
