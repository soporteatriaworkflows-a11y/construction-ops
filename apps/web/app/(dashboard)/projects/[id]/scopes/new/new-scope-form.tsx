/**
 * new-scope-form.tsx — Client Component del formulario de creación de alcance (4B.2).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §7`.
 *
 * - `useActionState` (React 19) para el estado del server action.
 * - `projectId` viaja en un input hidden y se VALIDA server-side (RLS).
 * - NUNCA envía organization_id, created_by, code, id ni status.
 * - Mensajes de error sanitizados (vienen del servidor).
 */
'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FormError } from '@/components/auth/form-error';
import { createScopeAction, type CreateScopeResult } from '../actions';
import { SCOPE_TYPES, DEFAULT_SCOPE_TYPE } from '@/lib/scopes/scope-types';
import { SCOPE_TYPE_LABELS } from '../../scope-labels';

const INITIAL_STATE: CreateScopeResult | null = null;

export function NewScopeForm({ projectId }: { projectId: string }) {
  const [state, formAction, isPending] = useActionState(
    createScopeAction,
    INITIAL_STATE,
  );

  const fieldErrors = state?.fieldErrors ?? {};
  const generalError = state?.error;
  const backHref = `/projects/${projectId}`;

  return (
    <form action={formAction} noValidate aria-label="Formulario de nuevo alcance">
      {/* projectId validado server-side (RLS); no se confía en el navegador. */}
      <input type="hidden" name="projectId" value={projectId} />

      {generalError && (
        <div className="mb-4">
          <FormError id="form-general-error" message={generalError} />
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {/* Nombre */}
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Nombre del alcance{' '}
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
            placeholder="Ej. Primer piso"
            aria-required="true"
            aria-describedby={fieldErrors.name ? 'error-name' : undefined}
            aria-invalid={!!fieldErrors.name}
            disabled={isPending}
          />
          {fieldErrors.name && <FormError id="error-name" message={fieldErrors.name} />}
        </div>

        {/* Tipo de alcance */}
        <div className="space-y-1.5">
          <Label htmlFor="scopeType">
            Tipo de alcance{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </Label>
          <Select
            id="scopeType"
            name="scopeType"
            defaultValue={DEFAULT_SCOPE_TYPE}
            disabled={isPending}
            aria-describedby={fieldErrors.scopeType ? 'error-scopeType' : undefined}
            aria-invalid={!!fieldErrors.scopeType}
          >
            {SCOPE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SCOPE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          {fieldErrors.scopeType && (
            <FormError id="error-scopeType" message={fieldErrors.scopeType} />
          )}
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Descripción (opcional)</Label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="Descripción breve del alcance..."
            disabled={isPending}
            aria-describedby={fieldErrors.description ? 'error-description' : undefined}
            aria-invalid={!!fieldErrors.description}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {fieldErrors.description && (
            <FormError id="error-description" message={fieldErrors.description} />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          aria-describedby={generalError ? 'form-general-error' : undefined}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPending ? 'Creando...' : 'Crear alcance'}
        </Button>
        <Button asChild variant="outline">
          <Link href={backHref}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
