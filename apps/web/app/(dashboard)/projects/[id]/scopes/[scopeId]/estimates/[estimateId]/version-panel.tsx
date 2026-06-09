/**
 * version-panel.tsx — Listado de versiones + emitir/clonar (4E.3A). Client.
 *
 * Muestra cada versión (número, estado, total) y, según el estado de la versión
 * activa, ofrece "Emitir versión" (draft, con confirmación: vuelve inmutable) o
 * "Crear nueva versión" (issued → nueva draft). Tras la acción, refresca la vista.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, FileCheck2, GitBranchPlus, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/auth/form-error';
import { formatCOP } from '@/lib/utils/format';
import { formatVersionLabel } from '../../estimate-format';
import type { EstimateVersionSummary } from '@/lib/estimates/version-types';
import { issueVersionAction, cloneVersionAction, type VersionActionResult } from './version-actions';

const LOCKED = ['approved', 'issued', 'archived'];

function StatusBadge({ status }: { status: string }) {
  if (status === 'issued') return <Badge variant="success">Emitida</Badge>;
  if (status === 'approved') return <Badge variant="success">Aprobada</Badge>;
  if (status === 'archived') return <Badge variant="outline">Archivada</Badge>;
  if (status === 'review') return <Badge variant="secondary">En revisión</Badge>;
  return <Badge variant="secondary">Borrador</Badge>;
}

export function VersionPanel({
  estimateId,
  versions,
  canManage,
  compareHref,
}: {
  estimateId: string;
  versions: EstimateVersionSummary[];
  canManage: boolean;
  compareHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = versions.find((v) => v.isActive) ?? null;
  const activeDraft = !!active && !LOCKED.includes(active.status);
  const activeIssued = active?.status === 'issued';

  function act(kind: 'issue' | 'clone') {
    if (pending) return;
    if (kind === 'issue' && !window.confirm('¿Emitir esta versión? Quedará INMUTABLE (no podrá editarse ni archivarse). Podrás crear una nueva versión a partir de ella.')) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('estimateId', estimateId);
      const res: VersionActionResult = kind === 'issue' ? await issueVersionAction(fd) : await cloneVersionAction(fd);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <span className="text-sm font-semibold text-gray-900">Versiones</span>
        <div className="flex items-center gap-2">
          {versions.length >= 2 && (
            <Button asChild size="sm" variant="outline">
              <Link href={compareHref}>
                <GitCompare className="h-4 w-4" aria-hidden="true" />
                Comparar versiones
              </Link>
            </Button>
          )}
          {canManage && (
            <>
            {activeDraft && (
              <Button type="button" size="sm" onClick={() => act('issue')} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                Emitir versión
              </Button>
            )}
            {activeIssued && (
              <Button type="button" size="sm" variant="outline" onClick={() => act('clone')} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GitBranchPlus className="h-4 w-4" aria-hidden="true" />}
                Crear nueva versión
              </Button>
            )}
            </>
          )}
        </div>
      </div>
      {error && <div className="px-4 pt-3"><FormError id="version-error" message={error} /></div>}
      <table className="w-full text-sm" aria-label="Versiones del presupuesto">
        <thead className="bg-gray-50 text-left text-xs text-gray-500">
          <tr>
            <th className="px-4 py-2 font-medium">Versión</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 text-right font-medium">Total general</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {versions.map((v) => (
            <tr key={v.id} className={v.isActive ? 'bg-blue-50/40' : ''}>
              <td className="px-4 py-2 font-medium text-gray-900">
                {formatVersionLabel(v.versionNumber)}
                {v.isActive && <span className="ml-1.5 text-[10px] font-medium text-blue-700">activa</span>}
                {v.sourceVersionId && <span className="ml-1.5 text-[10px] text-gray-400">clonada</span>}
              </td>
              <td className="px-4 py-2"><StatusBadge status={v.status} /></td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">{formatCOP(v.grandTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
