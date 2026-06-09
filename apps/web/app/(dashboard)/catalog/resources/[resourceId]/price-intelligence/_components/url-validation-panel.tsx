/**
 * url-validation-panel.tsx — Panel de validación de URL pública (Fase 3B).
 * 'use client' — useActionState (React 19).
 * Propiedad: agent-pricing / agent-frontend-boq.
 *
 * Flujo: input URL → validar → mostrar propuesta → confirmar → observación pending.
 * NUNCA aprueba automáticamente. No modifica BOQ.
 */
'use client';

import { useActionState, useState } from 'react';
import { Loader2, ExternalLink, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  validatePublicUrlAction,
  confirmProposalAction,
} from '../actions';
import type {
  UrlValidationActionResult,
  ConfirmProposalActionResult,
} from '../actions';
import type { PriceValidationProposal } from '@/server/pricing';

const CONFIDENCE_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  high: { label: 'Alta', variant: 'success' },
  medium: { label: 'Media', variant: 'warning' },
  low: { label: 'Baja', variant: 'secondary' },
};

interface UrlValidationPanelProps {
  resourceId: string;
  resourceUnit: string;
}

export function UrlValidationPanel({ resourceId, resourceUnit }: UrlValidationPanelProps) {
  const [proposal, setProposal] = useState<PriceValidationProposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [validateState, validateAction, isValidating] = useActionState(
    async (prev: UrlValidationActionResult | null, fd: FormData): Promise<UrlValidationActionResult> => {
      setProposal(null);
      setConfirmed(false);
      const result = await validatePublicUrlAction(prev, fd);
      if (result.success && result.proposal) {
        setProposal(result.proposal);
      }
      return result;
    },
    null,
  );

  const [confirmState, confirmAction, isConfirming] = useActionState(
    async (prev: ConfirmProposalActionResult | null, fd: FormData): Promise<ConfirmProposalActionResult> => {
      const result = await confirmProposalAction(prev, fd);
      if (result.success) setConfirmed(true);
      return result;
    },
    null,
  );

  const conf = proposal ? (CONFIDENCE_CONFIG[proposal.confidence] ?? CONFIDENCE_CONFIG.low) : null;

  return (
    <div
      className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4"
      aria-label="Validar precio desde URL pública"
    >
      <div className="flex items-start gap-2">
        <ExternalLink className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Validar precio desde URL</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Pega una URL pública de producto para extraer el precio y crear una observación pendiente.
          </p>
        </div>
      </div>

      {/* Formulario de validación */}
      <form action={validateAction} noValidate aria-label="Formulario de validación de URL">
        <input type="hidden" name="resourceId" value={resourceId} />
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="url-validation-input" className="sr-only">
              URL pública del producto
            </Label>
            <Input
              id="url-validation-input"
              name="url"
              type="url"
              placeholder="https://www.homecenter.com.co/producto/cemento-gris-50kg"
              required
              disabled={isValidating}
              aria-label="URL pública del producto"
              className="text-sm"
            />
          </div>
          <Button
            type="submit"
            disabled={isValidating}
            size="sm"
            variant="outline"
            aria-busy={isValidating}
            aria-label="Consultar precio desde URL"
          >
            {isValidating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden="true" />
                Consultando…
              </>
            ) : (
              'Consultar'
            )}
          </Button>
        </div>
        {validateState?.error && !isValidating && (
          <p className="mt-2 text-xs text-red-700 flex items-start gap-1" role="alert">
            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            {validateState.error}
          </p>
        )}
      </form>

      {/* Propuesta de precio */}
      {proposal && !confirmed && (
        <div
          className="rounded-md border border-gray-200 bg-white p-4 space-y-3"
          aria-label="Propuesta de precio detectada"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">Propuesta detectada</span>
            {conf && (
              <span
                className="flex items-center gap-1.5 text-xs text-gray-500"
                aria-label={`Nivel de confianza: ${conf.label}`}
              >
                Confianza:&nbsp;
                <Badge variant={conf.variant}>{conf.label}</Badge>
              </span>
            )}
          </div>

          <dl className="space-y-1.5 text-sm">
            {proposal.title && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-xs text-gray-500">Título</dt>
                <dd className="text-gray-800 truncate max-w-sm">{proposal.title}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-xs text-gray-500">Precio detectado</dt>
              <dd className="font-semibold tabular-nums text-gray-900" aria-label="Precio detectado">
                {proposal.observedPrice} {proposal.currency}
              </dd>
            </div>
            {proposal.unit && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-xs text-gray-500">Unidad</dt>
                <dd>{proposal.unit}</dd>
              </div>
            )}
            {proposal.externalSku && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-xs text-gray-500">SKU</dt>
                <dd className="font-mono text-xs">{proposal.externalSku}</dd>
              </div>
            )}
            {proposal.externalReference && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-xs text-gray-500">Referencia</dt>
                <dd className="font-mono text-xs">{proposal.externalReference}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-xs text-gray-500">Método</dt>
              <dd className="text-xs">{proposal.extractionMethod}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-xs text-gray-500">Fuente</dt>
              <dd className="text-xs truncate max-w-sm">
                <a
                  href={proposal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-blue-600 hover:underline"
                  aria-label="Ver fuente original"
                >
                  {proposal.sourceUrl}
                </a>
              </dd>
            </div>
          </dl>

          {proposal.warnings.length > 0 && (
            <div
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 space-y-1"
              aria-label="Advertencias de extracción"
            >
              {proposal.warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Disclaimer obligatorio */}
          <p
            className="text-xs text-gray-500 border-t border-gray-100 pt-2"
            role="note"
            aria-label="Aviso de validación"
          >
            La validación web propone una observación. No modifica automáticamente presupuestos ni aprueba precios.
          </p>

          {/* Formulario de confirmación */}
          <form action={confirmAction} aria-label="Confirmar y crear observación pendiente">
            <input type="hidden" name="resourceId" value={resourceId} />
            <input type="hidden" name="resourceUnit" value={resourceUnit} />
            <input type="hidden" name="sourceUrl" value={proposal.sourceUrl} />
            <input type="hidden" name="title" value={proposal.title ?? ''} />
            <input type="hidden" name="externalReference" value={proposal.externalReference ?? ''} />
            <input type="hidden" name="externalSku" value={proposal.externalSku ?? ''} />
            <input type="hidden" name="observedPrice" value={proposal.observedPrice} />
            <input type="hidden" name="currency" value={proposal.currency} />
            <input type="hidden" name="unit" value={proposal.unit ?? ''} />
            <input type="hidden" name="extractedAt" value={proposal.extractedAt} />
            <input type="hidden" name="extractionMethod" value={proposal.extractionMethod} />
            <input type="hidden" name="confidence" value={proposal.confidence} />

            {confirmState?.error && (
              <p className="mb-2 text-xs text-red-700" role="alert">
                {confirmState.error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isConfirming}
              size="sm"
              aria-busy={isConfirming}
              aria-label="Crear observación pendiente"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden="true" />
                  Creando…
                </>
              ) : (
                'Crear observación pendiente'
              )}
            </Button>
          </form>
        </div>
      )}

      {/* Confirmación exitosa */}
      {confirmed && (
        <div
          className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2"
          role="status"
          aria-label="Observación creada exitosamente"
        >
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-green-800">
            Observación pendiente creada. Queda en espera de aprobación humana.
          </p>
        </div>
      )}
    </div>
  );
}
