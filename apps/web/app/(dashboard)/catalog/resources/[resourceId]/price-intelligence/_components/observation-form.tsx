/**
 * observation-form.tsx — Client Component para registrar observaciones de precio (Fase 3A).
 * 'use client' — useActionState (React 19).
 * Propiedad: agent-frontend-boq.
 * NUNCA envía organization_id, created_by, approved_by.
 */
'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FormError } from '@/components/auth/form-error';
import { createObservationAction } from '../actions';
import type { ObservationActionResult } from '../actions';
import type { ProviderView } from '@/server/pricing';

const INITIAL_STATE: ObservationActionResult | null = null;

interface ObservationFormProps {
  resourceId: string;
  resourceUnit: string;
  providers: ProviderView[];
  onSuccess?: () => void;
}

export function ObservationForm({ resourceId, resourceUnit, providers }: ObservationFormProps) {
  const [state, formAction, isPending] = useActionState(createObservationAction, INITIAL_STATE);

  const fieldErrors = state?.fieldErrors ?? {};
  const generalError = state?.error;

  return (
    <form action={formAction} noValidate aria-label="Registrar observación de precio">
      <input type="hidden" name="resourceId" value={resourceId} />

      {generalError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {generalError}
        </div>
      )}

      {state?.success === true && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          Observación registrada correctamente. Queda pendiente de aprobación.
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="observedPrice">
              Precio observado (COP) <span className="text-red-500" aria-hidden="true">*</span>
            </Label>
            <Input
              id="observedPrice"
              name="observedPrice"
              type="number"
              min="0"
              step="0.01"
              required
              disabled={isPending}
              aria-invalid={!!fieldErrors.observedPrice}
              aria-describedby={fieldErrors.observedPrice ? 'error-price' : undefined}
            />
            {fieldErrors.observedPrice && <FormError id="error-price" message={fieldErrors.observedPrice} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="discountPercent">Descuento (%)</Label>
            <Input
              id="discountPercent"
              name="discountPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue="0"
              disabled={isPending}
              aria-invalid={!!fieldErrors.discountPercent}
            />
            {fieldErrors.discountPercent && <FormError id="error-discount" message={fieldErrors.discountPercent} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="unit">
              Unidad <span className="text-red-500" aria-hidden="true">*</span>
            </Label>
            <Input
              id="unit"
              name="unit"
              type="text"
              defaultValue={resourceUnit}
              required
              maxLength={50}
              disabled={isPending}
              aria-invalid={!!fieldErrors.unit}
            />
            {fieldErrors.unit && <FormError id="error-unit" message={fieldErrors.unit} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Moneda</Label>
            <Select id="currency" name="currency" defaultValue="COP" disabled={isPending}>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sourceType">
              Tipo de fuente <span className="text-red-500" aria-hidden="true">*</span>
            </Label>
            <Select id="sourceType" name="sourceType" defaultValue="manual" disabled={isPending}>
              <option value="manual">Manual</option>
              <option value="quotation">Cotización</option>
              <option value="invoice">Factura</option>
              <option value="public_web">Web pública</option>
              <option value="supplier_csv">CSV proveedor</option>
              <option value="official_feed">Feed oficial</option>
              <option value="official_api">API oficial</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Proveedor</Label>
            <Select id="supplierId" name="supplierId" defaultValue="" disabled={isPending}>
              <option value="">— Sin proveedor —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="observedAt">
              Fecha de observación <span className="text-red-500" aria-hidden="true">*</span>
            </Label>
            <Input
              id="observedAt"
              name="observedAt"
              type="datetime-local"
              required
              disabled={isPending}
              aria-invalid={!!fieldErrors.observedAt}
            />
            {fieldErrors.observedAt && <FormError id="error-observed" message={fieldErrors.observedAt} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="validUntil">Válido hasta (opcional)</Label>
            <Input
              id="validUntil"
              name="validUntil"
              type="datetime-local"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sourceReference">Referencia (URL, # cotización, etc.)</Label>
          <Input
            id="sourceReference"
            name="sourceReference"
            type="text"
            maxLength={500}
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={1000}
            disabled={isPending}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div className="mt-3">
        <Button type="submit" disabled={isPending} aria-busy={isPending} size="sm">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPending ? 'Registrando...' : 'Registrar observación'}
        </Button>
      </div>
    </form>
  );
}
