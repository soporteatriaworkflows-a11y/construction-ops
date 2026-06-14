'use client';

/**
 * sync-panel.tsx — Preview obligatorio + confirmación del sync Cantidad → BOQ.
 * Propiedad: agent-frontend-boq.
 *
 * El preview es READ-ONLY (no escribe). La escritura ocurre solo al confirmar.
 * Las filas bloqueadas (versión emitida, sin APU, sin capítulo) no se envían.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import {
  buildSyncPreviewAction,
  confirmSyncAction,
  loadChaptersAction,
} from '../../../actions';
import type { SyncPreviewSummary, VersionStatus } from '@/server/quantity-workspace';

interface GroupLine {
  workspaceLineId: string;
  description: string;
  resultNet: string;
  resultUnit: string;
  apuTemplateId: string | null;
  boqItemId: string | null;
}

interface Props {
  group: { id: string; name: string; resultUnit: string; lines: GroupLine[] };
  versions: Array<{ versionId: string; label: string; status: string }>;
}

const WARNING_LABELS: Record<string, string> = {
  version_locked: 'Versión emitida (no editable)',
  no_apu: 'Sin APU vinculado',
  apu_incomplete: 'APU incompleto',
  no_chapter: 'Falta capítulo destino',
  linked_item_missing: 'El ítem vinculado ya no existe',
};

export function SyncPanel({ group, versions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [versionId, setVersionId] = useState(versions[0]?.versionId ?? '');
  const [chapters, setChapters] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [chapterId, setChapterId] = useState('');
  const [summary, setSummary] = useState<SyncPreviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const selectedVersion = versions.find((v) => v.versionId === versionId);
  const versionStatus = (selectedVersion?.status ?? 'draft') as VersionStatus;

  function onVersionChange(id: string) {
    setVersionId(id);
    setSummary(null);
    setChapterId('');
    if (!id) return;
    startTransition(async () => {
      const res = await loadChaptersAction(id);
      if (res.ok) {
        setChapters(res.chapters);
        setChapterId(res.chapters[0]?.id ?? '');
      } else {
        setError(res.error);
      }
    });
  }

  function preview() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await buildSyncPreviewAction({
        versionId,
        versionStatus,
        chapterId: chapterId || null,
        lines: group.lines.map((l) => ({
          workspaceLineId: l.workspaceLineId,
          description: l.description,
          resultNet: l.resultNet,
          resultUnit: l.resultUnit,
          apuTemplateId: l.apuTemplateId,
          boqItemId: l.boqItemId,
        })),
      });
      if (res.ok) setSummary(res.summary);
      else setError(res.error);
    });
  }

  function confirm() {
    if (!summary) return;
    setError(null);
    const rows = summary.rows
      .filter((r) => !r.blocked && (r.action === 'create' || r.action === 'update'))
      .map((r) => ({
        workspaceLineId: r.workspaceLineId,
        action: r.action as 'create' | 'update',
        boqItemId: r.boqItemId,
        apuTemplateId: r.apuTemplateId,
        chapterId: r.chapterId,
        quantity: r.quantityAfter,
      }));
    if (rows.length === 0) {
      setError('No hay líneas válidas para enviar.');
      return;
    }
    startTransition(async () => {
      const res = await confirmSyncAction({ versionId, rows });
      if (res.ok) {
        setDone(`Listo: ${res.created} creadas, ${res.updated} actualizadas.`);
        setSummary(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        No hay versiones de presupuesto editables. Crea o abre un presupuesto en estado borrador/revisión.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {done && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700" role="status">
          {done}
        </div>
      )}

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="version">Versión destino (editable)</Label>
            <Select id="version" value={versionId} onChange={(e) => onVersionChange(e.target.value)}>
              <option value="">Selecciona…</option>
              {versions.map((v) => (
                <option key={v.versionId} value={v.versionId}>{v.label} ({v.status})</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="chapter">Capítulo (para ítems nuevos)</Label>
            <Select id="chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
              <option value="">Sin capítulo</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={preview} disabled={pending || !versionId}>
              {pending ? 'Calculando…' : 'Previsualizar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardContent className="pt-4">
            {summary.versionLocked && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                La versión seleccionada está emitida: no se puede modificar (snapshots inmutables).
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Preview de sincronización">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="pb-2 text-left font-medium">Cantidad</th>
                    <th className="pb-2 text-center font-medium">Acción</th>
                    <th className="pb-2 text-right font-medium">Antes</th>
                    <th className="pb-2 text-right font-medium">Después</th>
                    <th className="pb-2 text-right font-medium">Δ</th>
                    <th className="pb-2 text-left font-medium">Advertencias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summary.rows.map((r) => (
                    <tr key={r.workspaceLineId} className={r.blocked ? 'opacity-60' : ''}>
                      <td className="py-1.5 text-gray-700">{r.description || '—'}</td>
                      <td className="py-1.5 text-center">
                        <Badge variant={r.blocked ? 'destructive' : r.action === 'update' ? 'warning' : 'success'}>
                          {r.blocked ? 'bloqueada' : r.action === 'update' ? 'actualizar' : 'crear'}
                        </Badge>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-gray-500">{formatNumber(r.quantityBefore, 4)}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">{formatNumber(r.quantityAfter, 4)}</td>
                      <td className="py-1.5 text-right tabular-nums text-blue-700">{formatNumber(r.difference, 4)}</td>
                      <td className="py-1.5 text-xs text-amber-700">
                        {r.warnings.map((w) => WARNING_LABELS[w] ?? w).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {summary.creates} crear · {summary.updates} actualizar · {summary.blockedCount} bloqueadas
              </span>
              <Button
                type="button"
                onClick={confirm}
                disabled={pending || summary.versionLocked || summary.creates + summary.updates === 0}
              >
                Confirmar envío
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
