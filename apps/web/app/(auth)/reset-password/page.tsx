/**
 * /reset-password — Pantalla de nueva contraseña tras flujo PKCE.
 *
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 * Contrato: docs/AUTH_RUNTIME_CONTRACT.md §4-6.
 *
 * Flujo:
 *  1. Usuario llega aquí desde /auth/callback?next=/reset-password
 *     (el callback ya intercambió el code por sesión → cookie activa).
 *  2. Usuario ingresa nueva contraseña + confirmación.
 *  3. Cliente browser llama supabase.auth.updateUser({ password }).
 *  4. Éxito → mensaje de confirmación + enlace a /login.
 *  5. Error → mensaje legible en español, sin stack técnico.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/auth/form-error';
import { FormSuccess } from '@/components/auth/form-success';
import {
  toReadableAuthError,
  isValidPasswordLength,
} from '@/components/auth/auth-helpers';
import { createClient } from '@/lib/supabase/client';

interface ResetState {
  password: string;
  confirm: string;
  error: string | null;
  success: string | null;
  loading: boolean;
}

export default function ResetPasswordPage() {
  const [form, setForm] = useState<ResetState>({
    password: '',
    confirm: '',
    error: null,
    success: null,
    loading: false,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
      error: null,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Validación mínima de UI.
    if (!isValidPasswordLength(form.password)) {
      setForm((prev) => ({
        ...prev,
        error: 'La contraseña debe tener al menos 8 caracteres.',
      }));
      return;
    }
    if (form.password !== form.confirm) {
      setForm((prev) => ({
        ...prev,
        error: 'Las contraseñas no coinciden. Verifica e intenta de nuevo.',
      }));
      return;
    }

    setForm((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: form.password,
      });

      if (error) {
        setForm((prev) => ({
          ...prev,
          loading: false,
          error: toReadableAuthError(error),
        }));
        return;
      }

      setForm((prev) => ({
        ...prev,
        loading: false,
        success:
          'Contraseña actualizada correctamente. Ahora puedes iniciar sesión con tu nueva contraseña.',
      }));
    } catch (err) {
      setForm((prev) => ({
        ...prev,
        loading: false,
        error: toReadableAuthError(err),
      }));
    }
  }

  const hasError = Boolean(form.error);

  return (
    <AuthCard
      title="Nueva contraseña"
      description="Establece una nueva contraseña para tu cuenta"
    >
      {form.success ? (
        <div className="space-y-4">
          <FormSuccess message={form.success} id="reset-success" />
          <p className="text-center text-sm text-gray-500">
            <Link
              href="/login"
              className="text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 rounded"
            >
              Ir al inicio de sesión
            </Link>
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Formulario de nueva contraseña"
        >
          <div className="space-y-4">
            {/* Nueva contraseña */}
            <div className="space-y-1.5">
              <Label htmlFor="password">Nueva contraseña</Label>
              <div className="relative">
                <Lock
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={form.password}
                  onChange={handleChange}
                  className="pl-9"
                  required
                  aria-required="true"
                  aria-describedby={hasError ? 'reset-error' : 'reset-hint'}
                  disabled={form.loading}
                />
              </div>
              <p id="reset-hint" className="text-xs text-gray-500">
                Usa al menos 8 caracteres.
              </p>
            </div>

            {/* Confirmación */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <div className="relative">
                <Lock
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
                  aria-hidden="true"
                />
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                  value={form.confirm}
                  onChange={handleChange}
                  className="pl-9"
                  required
                  aria-required="true"
                  aria-describedby={hasError ? 'reset-error' : undefined}
                  disabled={form.loading}
                />
              </div>
            </div>

            {/* Error */}
            <FormError id="reset-error" message={form.error} />

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={form.loading}
              aria-busy={form.loading}
            >
              {form.loading ? 'Guardando...' : 'Guardar nueva contraseña'}
            </Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
