/**
 * invite-form.tsx — Formulario "Invitar usuario" (Client Component).
 *
 * - useActionState (React 19). Validación mínima de email en cliente.
 * - El rol se elige SOLO de la lista permitida (assignableRoles del actor).
 * - Si no hay envío real de correo, muestra el enlace de invitación (fallback
 *   controlado) para compartirlo manualmente.
 */
'use client';

import { useActionState, useState } from 'react';
import { Loader2, UserPlus, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FormError } from '@/components/auth/form-error';
import { FormSuccess } from '@/components/auth/form-success';
import { inviteUserAction, type AccessActionResult } from '../actions';
import { roleLabel } from '../labels';

const INITIAL: AccessActionResult | null = null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteForm({ assignableRoles }: { assignableRoles: string[] }) {
  const [state, formAction, isPending] = useActionState(inviteUserAction, INITIAL);
  const [emailError, setEmailError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement)?.value ?? '';
    if (!EMAIL_RE.test(email.trim())) {
      e.preventDefault();
      setEmailError('Ingresa un correo electrónico válido.');
      return;
    }
    setEmailError(null);
  }

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      aria-label="Formulario de invitación de usuario"
      className="space-y-4"
    >
      {state?.error && <FormError id="invite-error" message={state.error} />}
      {state?.success && state.message && (
        <FormSuccess id="invite-success" message={state.message} />
      )}
      {state?.success && state.inviteLink && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">Sin envío de correo configurado</p>
            <p className="mb-1">Comparte este enlace de invitación de forma segura:</p>
            <code className="block break-all rounded bg-white/70 px-2 py-1 text-xs text-amber-900">
              {state.inviteLink}
            </code>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="email">
            Correo electrónico <span className="text-red-500" aria-hidden="true">*</span>
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="persona@constructora.co"
            disabled={isPending}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'invite-email-error' : undefined}
          />
          {emailError && <FormError id="invite-email-error" message={emailError} />}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nombre (opcional)</Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            maxLength={120}
            placeholder="Ej. María Pérez"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role">
            Rol <span className="text-red-500" aria-hidden="true">*</span>
          </Label>
          <Select id="role" name="role" required disabled={isPending} defaultValue="">
            <option value="" disabled>
              Selecciona un rol
            </option>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="message">Mensaje (opcional)</Label>
          <textarea
            id="message"
            name="message"
            rows={2}
            maxLength={500}
            placeholder="Mensaje breve para la persona invitada…"
            disabled={isPending}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending} aria-busy={isPending}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? 'Enviando…' : 'Invitar usuario'}
      </Button>
    </form>
  );
}
