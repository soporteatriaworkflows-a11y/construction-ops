/**
 * new-estimate-form.tsx — Client Component del formulario de creación de presupuesto (4B.3).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §7`.
 *
 * - `useActionState` (React 19) para el estado del server action.
 * - `scopeId` viaja en un input hidden y se VALIDA server-side (RLS).
 * - NUNCA envía organization_id, created_by, code, id, status ni project_id.
 */
'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/form-error';
import { createEstimateAction, type CreateEstimateResult } from '../actions';

const INITIAL_STATE: CreateEstimateResult | null = null;

export function NewEstimateForm({
  scopeId,
  backHref,
}: {
  scopeId: string;
  backHref: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createEstimateAction,
    INITIAL_STATE,
  );

  const fieldErrors = state?.fieldErrors ?? {};
  const generalError = state?.error;

  return (
    <form action={formAction} noValidate aria-label="Formulario de nuevo presupuesto">
      {/* scopeId validado server-side (RLS); no se confía en el navegador. */}
      <input type="hidden" name="scopeId" value={scopeId} />

      {generalError && (
        <div className="mb-4">
          <FormError id="form-general-error" message={generalError} />
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {/* Nombre */}
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Nombre del presupuesto{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            maxLength={160}
            placeholder="Ej. Presupuesto base"
            aria-required="true"
            aria-describedby={fieldErrors.name ? 'error-name' : undefined}
            aria-invalid={!!fieldErrors.name}
            disabled={isPending}
          />
          {fieldErrors.name && <FormError id="error-name" message={fieldErrors.name} />}
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Descripción (opcional)</Label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="Descripción breve del presupuesto..."
            disabled={isPending}
            aria-describedby={fieldErrors.description ? 'error-description' : undefined}
            aria-invalid={!!fieldErrors.description}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {fieldErrors.description && (
            <FormError id="error-description" message={fieldErrors.description} />
          )}
        </div>

        <p className="text-xs text-gray-400">
          Al crear el presupuesto se generará automáticamente su versión inicial{' '}
          <span className="font-mono">V01</span>.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          aria-describedby={generalError ? 'form-general-error' : undefined}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPending ? 'Creando...' : 'Crear presupuesto'}
        </Button>
        <Button asChild variant="outline">
          <Link href={backHref}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
