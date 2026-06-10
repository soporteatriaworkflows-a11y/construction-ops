/**
 * resource-form.tsx — Client Component para crear recursos (Bootstrap CTAs).
 * 'use client' — maneja estado del formulario con useActionState (React 19).
 * Propiedad: agent-frontend-boq.
 * NUNCA envia organization_id, created_by ni id.
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
import { createResourceAction } from '../../../actions';
import type { ResourceActionResult } from '../../../actions';

const INITIAL_STATE: ResourceActionResult | null = null;

export function ResourceForm() {
  const [state, formAction, isPending] = useActionState(
    createResourceAction,
    INITIAL_STATE,
  );

  const fieldErrors = state?.fieldErrors ?? {};
  const generalError = state?.error;

  return (
    <form
      action={formAction}
      noValidate
      aria-label="Formulario de nuevo recurso"
    >
      {generalError && (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {generalError}
        </div>
      )}

      {state?.success === true && (
        <div
          className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
          role="status"
        >
          Recurso creado correctamente.
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="code">
            Codigo{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="code"
            name="code"
            type="text"
            required
            maxLength={40}
            placeholder="MAT-001"
            disabled={isPending}
            aria-invalid={!!fieldErrors.code}
            aria-describedby={fieldErrors.code ? 'error-code' : undefined}
          />
          {fieldErrors.code && (
            <FormError id="error-code" message={fieldErrors.code} />
          )}
          <p className="text-xs text-gray-400">
            Maximo 40 caracteres. Solo letras, numeros, puntos, guiones y guiones bajos.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">
            Nombre{' '}
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
            disabled={isPending}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'error-name' : undefined}
          />
          {fieldErrors.name && (
            <FormError id="error-name" message={fieldErrors.name} />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="resourceType">
            Tipo de recurso{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </Label>
          <Select
            id="resourceType"
            name="resourceType"
            defaultValue="material"
            disabled={isPending}
            aria-invalid={!!fieldErrors.resourceType}
            aria-describedby={
              fieldErrors.resourceType ? 'error-resourceType' : undefined
            }
          >
            <option value="material">Material</option>
            <option value="labor">Mano de obra</option>
            <option value="equipment">Equipo</option>
            <option value="tool">Herramienta</option>
            <option value="subcontract">Subcontrato</option>
            <option value="other">Otro</option>
          </Select>
          {fieldErrors.resourceType && (
            <FormError
              id="error-resourceType"
              message={fieldErrors.resourceType}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="unit">
            Unidad{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="unit"
            name="unit"
            type="text"
            required
            maxLength={20}
            placeholder="m², kg, ml, und..."
            disabled={isPending}
            aria-invalid={!!fieldErrors.unit}
            aria-describedby={fieldErrors.unit ? 'error-unit' : undefined}
          />
          {fieldErrors.unit && (
            <FormError id="error-unit" message={fieldErrors.unit} />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={isPending} aria-busy={isPending}>
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {isPending ? 'Guardando...' : 'Crear recurso'}
        </Button>
        <Link href="/catalog">
          <Button type="button" variant="outline" disabled={isPending}>
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
