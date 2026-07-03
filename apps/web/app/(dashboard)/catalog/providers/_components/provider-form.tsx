/**
 * provider-form.tsx — Client Component para crear/editar proveedores (Fase 3A).
 * 'use client' — maneja estado del formulario con useActionState (React 19).
 * Propiedad: agent-frontend-boq.
 * NUNCA envía organization_id, created_by ni id.
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
import { createProviderAction, updateProviderAction } from '../actions';
import type { ProviderActionResult } from '../actions';
import type { ProviderView } from '@/server/pricing';

const INITIAL_STATE: ProviderActionResult | null = null;

interface ProviderFormProps {
  mode: 'create' | 'edit';
  provider?: ProviderView;
}

export function ProviderForm({ mode, provider }: ProviderFormProps) {
  const action = mode === 'edit' ? updateProviderAction : createProviderAction;
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);

  const fieldErrors = state?.fieldErrors ?? {};
  const generalError = state?.error;

  return (
    <form action={formAction} noValidate aria-label={`Formulario de ${mode === 'edit' ? 'edición' : 'nuevo'} proveedor`}>
      {mode === 'edit' && provider && (
        <input type="hidden" name="providerId" value={provider.id} />
      )}

      {generalError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {generalError}
        </div>
      )}

      {state?.success === true && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          {mode === 'create' ? 'Proveedor creado correctamente.' : 'Proveedor actualizado.'}
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Nombre <span className="text-red-500" aria-hidden="true">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            maxLength={200}
            defaultValue={provider?.name ?? ''}
            disabled={isPending}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'error-name' : undefined}
          />
          {fieldErrors.name && <FormError id="error-name" message={fieldErrors.name} />}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplierType">Tipo de proveedor</Label>
          {/* V5.6.6A: el update no admite cambiar el tipo (ProviderUpdateInput
              no lo incluye); en edición se muestra deshabilitado para no
              simular una edición que la action ignoraría. */}
          <Select
            id="supplierType"
            name="supplierType"
            defaultValue={provider?.supplierType ?? 'vendor'}
            disabled={isPending || mode === 'edit'}
          >
            <option value="vendor">Proveedor (vendor)</option>
            <option value="distributor">Distribuidor</option>
            <option value="manufacturer">Fabricante</option>
            <option value="subcontractor">Subcontratista</option>
            <option value="other">Otro</option>
          </Select>
          {mode === 'edit' && (
            <p className="text-xs text-gray-400">El tipo no puede cambiarse después de crear el proveedor.</p>
          )}
        </div>

        {mode === 'edit' && (
          <div className="space-y-1.5">
            <Label htmlFor="active">Estado</Label>
            {/* Sin este campo, la action interpretaría active=true en cada
                edición y reactivaría proveedores inactivos silenciosamente. */}
            <Select id="active" name="active" defaultValue={String(provider?.active ?? true)} disabled={isPending}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="websiteUrl">Sitio web (URL)</Label>
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            maxLength={500}
            placeholder="https://www.proveedor.com"
            defaultValue={provider?.websiteUrl ?? ''}
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="defaultDiscountPercent">
            Descuento por defecto (%)
          </Label>
          <Input
            id="defaultDiscountPercent"
            name="defaultDiscountPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={provider?.defaultDiscountPercent ?? '0'}
            disabled={isPending}
            aria-invalid={!!fieldErrors.defaultDiscountPercent}
            aria-describedby={fieldErrors.defaultDiscountPercent ? 'error-discount' : undefined}
          />
          {fieldErrors.defaultDiscountPercent && (
            <FormError id="error-discount" message={fieldErrors.defaultDiscountPercent} />
          )}
          <p className="text-xs text-gray-400">0–100. Se aplica como descuento sugerido al registrar observaciones.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas internas</Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={provider?.notes ?? ''}
            disabled={isPending}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={isPending} aria-busy={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPending ? 'Guardando...' : mode === 'create' ? 'Crear proveedor' : 'Guardar cambios'}
        </Button>
        <Link href="/catalog/providers">
          <Button type="button" variant="outline" disabled={isPending}>Cancelar</Button>
        </Link>
      </div>
    </form>
  );
}
