/**
 * manual-takeoffs-section.tsx — Lista + creación de takeoffs MANUALES (F3).
 *
 * Los takeoffs manuales viven en localStorage del navegador (mock/local, sin
 * DB/Supabase — ver `lib/steel/manual-store.ts`). Client component porque el
 * estado es 100% local; se hidrata tras el mount para no divergir del SSR.
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SurfaceCard } from '@/components/shared/surface-card';
import { InlineCallout } from '@/components/shared/inline-callout';
import {
  ensureDemoIntakeTakeoff,
  newManualTakeoffId,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';
import { loadManualTakeoffs } from '@/lib/steel/manual-store';
import { openManualTakeoff } from '@/lib/steel/open-takeoff';
import { useManualTakeoffs, writeManualTakeoffs } from '@/lib/steel/use-manual-takeoffs';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

export function ManualTakeoffsSection() {
  const router = useRouter();
  const { takeoffs, hydrated } = useManualTakeoffs();
  const [name, setName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [scopeLabel, setScopeLabel] = useState('');
  const [opening, setOpening] = useState(false);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const record: ManualTakeoffRecord = {
      id: newManualTakeoffId(),
      name: trimmedName,
      projectName: projectName.trim() || 'Sin proyecto',
      scopeLabel: scopeLabel.trim() || 'Sin alcance',
      status: 'draft',
      createdAt: new Date().toISOString().slice(0, 10),
      lines: [],
    };
    // Siempre sobre el store fresco (no el snapshot renderizado): evita pisar
    // lo guardado si el click llega antes de que la vista termine de hidratar.
    writeManualTakeoffs([...loadManualTakeoffs(), record]);
    setOpening(true);
    openManualTakeoff((href) => router.push(href), record.id);
  }

  function handleTryIntake() {
    const ensured = ensureDemoIntakeTakeoff(loadManualTakeoffs());
    if (ensured.created) writeManualTakeoffs(ensured.records);
    setOpening(true);
    openManualTakeoff((href) => router.push(href), ensured.id);
  }

  function handleDelete(id: string) {
    const target = takeoffs.find((t) => t.id === id);
    if (!target) return;
    if (!window.confirm(`¿Eliminar el takeoff local "${target.name}"? Solo existe en este navegador.`)) return;
    writeManualTakeoffs(loadManualTakeoffs().filter((t) => t.id !== id));
  }

  return (
    <section aria-label="Takeoffs manuales locales" className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-iconic-graphite/60">
        Takeoffs manuales (locales)
      </h2>
      <InlineCallout tone="info" className="mb-3">
        Flujo F3: se crean y guardan solo en este navegador (localStorage), sin base de datos. Las
        líneas se interpretan y calculan con el dominio real de F1.
      </InlineCallout>

      <SurfaceCard variant="action" className="mb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-iconic-ink">
              <FileText className="h-4 w-4 text-iconic-primary" aria-hidden="true" />
              Lectura asistida desde PDF/plano (F6A)
            </h3>
            <p className="mt-1 text-xs text-iconic-graphite/60">
              Pega texto de un plano y conviértelo en candidatos revisables. Lectura asistida
              preliminar: no reemplaza revisión técnica ni aprueba cantidades automáticamente.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={handleTryIntake} disabled={opening}>
            {opening ? 'Abriendo demo…' : 'Probar lectura asistida desde PDF/plano'}
          </Button>
        </div>
      </SurfaceCard>

      <SurfaceCard variant="status" className="mb-4">
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="manual-takeoff-name">Nombre del takeoff</Label>
            <Input
              id="manual-takeoff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Refuerzo cimentación — Etapa 1"
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="manual-takeoff-project">Proyecto (referencia)</Label>
            <Input
              id="manual-takeoff-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Ej: Proyecto Alfa"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="manual-takeoff-scope">Alcance (torre/piso/frente)</Label>
            <Input
              id="manual-takeoff-scope"
              value={scopeLabel}
              onChange={(e) => setScopeLabel(e.target.value)}
              placeholder="Ej: Torre A / Piso 1"
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={!name.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo takeoff manual
          </Button>
        </form>
      </SurfaceCard>

      {!hydrated ? (
        <p className="text-xs text-iconic-graphite/50">
          Leyendo takeoffs guardados en este navegador… Si este mensaje no desaparece, recarga la
          página sin caché (Ctrl+Shift+R): suele deberse a una versión anterior abierta en la
          pestaña.
        </p>
      ) : takeoffs.length === 0 ? (
        <p className="text-xs text-iconic-graphite/50">
          Aún no hay takeoffs manuales en este navegador. Crea el primero con el formulario.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {takeoffs.map((takeoff) => (
            <SurfaceCard key={takeoff.id} variant="action" className="p-0">
              <Link href={`/steel/takeoffs/${takeoff.id}`} className="block p-4 pb-2">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-iconic-ink">{takeoff.name}</h3>
                  <SteelStatusBadge kind="takeoff" status={takeoff.status} />
                </div>
                <p className="text-xs text-iconic-graphite/60">
                  {takeoff.projectName} · {takeoff.scopeLabel}
                </p>
                <p className="mt-2 text-xs text-iconic-graphite/50">
                  {takeoff.lines.length} líneas · creado {takeoff.createdAt} · local
                </p>
              </Link>
              <div className="flex justify-end px-4 pb-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(takeoff.id)}
                  aria-label={`Eliminar takeoff ${takeoff.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Eliminar
                </Button>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}
    </section>
  );
}
