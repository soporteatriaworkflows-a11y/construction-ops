/**
 * observation-review-buttons.tsx — Botones aprobar/rechazar para observaciones (Fase 3A).
 * 'use client'. Solo visible a admin/gerencia (server-rendered condicionalmente).
 */
'use client';

import { useActionState, useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approveObservationAction, rejectObservationAction } from '../actions';
import type { ObservationActionResult } from '../actions';

interface ReviewButtonsProps {
  observationId: string;
  resourceId: string;
}

const INITIAL: ObservationActionResult | null = null;

export function ApproveButton({ observationId, resourceId }: ReviewButtonsProps) {
  const [state, formAction, isPending] = useActionState(approveObservationAction, INITIAL);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="observationId" value={observationId} />
      <input type="hidden" name="resourceId" value={resourceId} />
      {state?.error && (
        <span className="mr-2 text-xs text-red-600" role="alert">{state.error}</span>
      )}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-busy={isPending}
        className="border-green-300 text-green-700 hover:bg-green-50"
      >
        {isPending
          ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          : <CheckCircle className="h-3 w-3" aria-hidden="true" />
        }
        {isPending ? 'Aprobando...' : 'Aprobar'}
      </Button>
    </form>
  );
}

export function RejectButton({ observationId, resourceId }: ReviewButtonsProps) {
  const [state, formAction, isPending] = useActionState(rejectObservationAction, INITIAL);
  const [showReason, setShowReason] = useState(false);

  if (!showReason) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowReason(true)}
        className="border-red-300 text-red-700 hover:bg-red-50"
      >
        <XCircle className="h-3 w-3" aria-hidden="true" />
        Rechazar
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-start gap-2 mt-1">
      <input type="hidden" name="observationId" value={observationId} />
      <input type="hidden" name="resourceId" value={resourceId} />
      <div className="flex-1">
        <textarea
          name="rejectionReason"
          rows={2}
          required
          placeholder="Motivo del rechazo (obligatorio)..."
          className="w-full rounded-md border border-red-200 bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
          disabled={isPending}
          aria-label="Motivo del rechazo"
          aria-invalid={!!state?.fieldErrors?.rejectionReason}
        />
        {state?.fieldErrors?.rejectionReason && (
          <span className="text-xs text-red-600">{state.fieldErrors.rejectionReason}</span>
        )}
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isPending}
          className="border-red-300 text-red-700 hover:bg-red-50"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
          {isPending ? 'Rechazando...' : 'Confirmar'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setShowReason(false)}
          disabled={isPending}
          className="text-xs"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
