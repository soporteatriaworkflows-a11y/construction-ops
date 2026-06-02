/**
 * /forgot-password — Pantalla de recuperación de contraseña.
 *
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 * Contrato: docs/AUTH_RUNTIME_CONTRACT.md §4-6.
 *
 * Flujo:
 *  1. Usuario ingresa correo.
 *  2. Cliente browser llama supabase.auth.resetPasswordForEmail().
 *  3. Se muestra SIEMPRE el mismo mensaje neutral (no revela si el correo existe).
 *  4. Nunca mostrar "correo no encontrado" ni diferencias entre correo válido/inválido.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/auth/form-error';
import { FormSuccess } from '@/components/auth/form-success';
import {
  FORGOT_PASSWORD_NEUTRAL_MSG,
  isValidEmailFormat,
} from '@/components/auth/auth-helpers';
import { createClient } from '@/lib/supabase/client';

interface ForgotState {
  email: string;
  error: string | null;
  success: string | null;
  loading: boolean;
}

/** URL de callback para el flujo PKCE de restablecimiento de contraseña. */
function buildResetRedirectUrl(): string {
  // NEXT_PUBLIC_APP_URL viene de las vars de entorno del build.
  // En desarrollo se usa localhost:3000.
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/auth/callback?next=/reset-password`;
}

export default function ForgotPasswordPage() {
  const [form, setForm] = useState<ForgotState>({
    email: '',
    error: null,
    success: null,
    loading: false,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
      error: null,
      success: null,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Validación mínima de UI.
    if (!isValidEmailFormat(form.email)) {
      setForm((prev) => ({
        ...prev,
        error: 'Ingresa un correo electrónico válido.',
      }));
      return;
    }

    setForm((prev) => ({ ...prev, loading: true, error: null, success: null }));

    try {
      const supabase = createClient();
      // Llamada a Supabase — el resultado NO diferencia si el correo existe.
      await supabase.auth.resetPasswordForEmail(form.email.trim(), {
        redirectTo: buildResetRedirectUrl(),
      });
    } catch {
      // Ignoramos el error real para no revelar si el correo existe.
      // El mensaje siempre es neutral.
    }

    // SIEMPRE mostramos el mismo mensaje neutral (no revelar existencia del correo).
    setForm((prev) => ({
      ...prev,
      loading: false,
      success: FORGOT_PASSWORD_NEUTRAL_MSG,
    }));
  }

  const hasError = Boolean(form.error);

  return (
    <AuthCard
      title="Recuperar contraseña"
      description="Ingresa tu correo para recibir un enlace de recuperación"
    >
      {form.success ? (
        <div className="space-y-4">
          <FormSuccess message={form.success} id="forgot-success" />
          <p className="text-center text-sm text-gray-500">
            <Link
              href="/login"
              className="text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 rounded"
            >
              Volver al inicio de sesión
            </Link>
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Formulario de recuperación de contraseña"
        >
          <div className="space-y-4">
            {/* Campo correo */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <div className="relative">
                <Mail
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@constructora.co"
                  value={form.email}
                  onChange={handleChange}
                  className="pl-9"
                  required
                  aria-required="true"
                  aria-describedby={hasError ? 'forgot-error' : undefined}
                  disabled={form.loading}
                />
              </div>
            </div>

            {/* Error de validación UI (correo con formato inválido) */}
            <FormError id="forgot-error" message={form.error} />

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={form.loading}
              aria-busy={form.loading}
            >
              {form.loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </Button>

            <p className="text-center text-sm text-gray-500">
              <Link
                href="/login"
                className="text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 rounded"
              >
                Volver al inicio de sesión
              </Link>
            </p>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
