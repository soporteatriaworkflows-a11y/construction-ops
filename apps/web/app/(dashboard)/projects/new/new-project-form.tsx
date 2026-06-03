/**
 * new-project-form.tsx — Client Component del formulario de creación de proyecto.
 *
 * Propiedad: agent-frontend-boq. Oleada 4B.1.
 *
 * - Usa `useActionState` (React 19) para manejar el estado del server action.
 * - Validación mínima client-side (nombre y ciudad obligatorios).
 * - NUNCA envía organization_id, created_by, code, id ni role.
 * - Mensajes de error sanitizados (vienen del servidor).
 * - Accesible: aria-describedby, role="alert", focus management.
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
import { createProjectAction } from '../actions';
import type { CreateProjectResult } from '../actions';

const INITIAL_STATE: CreateProjectResult | null = null;

export function NewProjectForm() {
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
    INITIAL_STATE,
  );

  const fieldErrors = state?.fieldErrors ?? {};
  const generalError = state?.error;

  return (
    <form action={formAction} noValidate aria-label="Formulario de nuevo proyecto">
      {/* Error general (auth, modo, inesperado) */}
      {generalError && (
        <div className="mb-4">
          <FormError id="form-general-error" message={generalError} />
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {/* Nombre del proyecto */}
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Nombre del proyecto{' '}
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
            placeholder="Ej. Torre Norte — Primer piso"
            aria-required="true"
            aria-describedby={fieldErrors.name ? 'error-name' : undefined}
            aria-invalid={!!fieldErrors.name}
            disabled={isPending}
          />
          {fieldErrors.name && (
            <FormError id="error-name" message={fieldErrors.name} />
          )}
        </div>

        {/* Ciudad */}
        <div className="space-y-1.5">
          <Label htmlFor="city">
            Ciudad{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="city"
            name="city"
            type="text"
            required
            maxLength={120}
            placeholder="Ej. Bogotá"
            aria-required="true"
            aria-describedby={fieldErrors.city ? 'error-city' : undefined}
            aria-invalid={!!fieldErrors.city}
            disabled={isPending}
          />
          {fieldErrors.city && (
            <FormError id="error-city" message={fieldErrors.city} />
          )}
        </div>

        {/* Descripción (opcional) */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Descripción (opcional)</Label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="Descripción breve del proyecto..."
            disabled={isPending}
            aria-describedby={
              fieldErrors.description ? 'error-description' : undefined
            }
            aria-invalid={!!fieldErrors.description}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {fieldErrors.description && (
            <FormError id="error-description" message={fieldErrors.description} />
          )}
        </div>

        {/* Estado inicial — forzado a 'active'; select solo para transparencia UI */}
        {/*
          En 4B.1 solo 'active' es válido. Se muestra el select por transparencia
          pero el valor efectivo lo fuerza el servidor. El campo se ignora server-side
          si llega un valor distinto de 'active' (la action lo sobreescribe).
          Si en oleadas futuras se agregan más estados iniciales, se expande aquí.
        */}
        <div className="space-y-1.5">
          <Label htmlFor="initialStatus">Estado inicial</Label>
          <Select
            id="initialStatus"
            name="initialStatus"
            defaultValue="active"
            disabled={isPending}
            aria-describedby="help-status"
          >
            <option value="active">Activo</option>
          </Select>
          <p id="help-status" className="text-xs text-gray-400">
            En la versión actual, los proyectos se crean siempre como Activos.
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-4 flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          aria-describedby={generalError ? 'form-general-error' : undefined}
        >
          {isPending && (
            <Loader2
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            />
          )}
          {isPending ? 'Creando...' : 'Crear proyecto'}
        </Button>
        <Link href="/projects">
          <Button type="button" variant="outline" disabled={isPending}>
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
