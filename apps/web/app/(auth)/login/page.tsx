/**
 * /login — Pantalla de inicio de sesión.
 *
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 * Contrato: docs/AUTH_RUNTIME_CONTRACT.md §4-6.
 *
 * Flujo:
 *  1. Usuario ingresa email + contraseña.
 *  2. Cliente browser llama supabase.auth.signInWithPassword().
 *  3. Éxito → redirige a `next` sanitizado (fallback /dashboard).
 *  4. Error → muestra mensaje legible en español, sin stack técnico.
 *  5. Error de callback (code expirado, etc.) se muestra si viene en ?error=.
 */
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/auth/form-error';
import {
  toReadableAuthError,
  isValidEmailFormat,
  isValidPasswordLength,
} from '@/components/auth/auth-helpers';
import { sanitizeNext } from '@/server/auth/routes';
import { createClient } from '@/lib/supabase/client';

interface LoginState {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Error proveniente del callback de auth (ej. code expirado).
  const callbackError = searchParams.get('error');

  const [form, setForm] = useState<LoginState>({
    email: '',
    password: '',
    error: null,
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

    // Validación mínima de UI (la validación real ocurre en el backend).
    if (!isValidEmailFormat(form.email)) {
      setForm((prev) => ({
        ...prev,
        error: 'Ingresa un correo electrónico válido.',
      }));
      return;
    }
    if (!isValidPasswordLength(form.password)) {
      setForm((prev) => ({
        ...prev,
        error: 'La contraseña debe tener al menos 8 caracteres.',
      }));
      return;
    }

    setForm((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
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

      // Redirección segura usando sanitizeNext (prevención de open redirect).
      const next = sanitizeNext(searchParams.get('next'), '/dashboard');
      router.push(next);
    } catch (err) {
      setForm((prev) => ({
        ...prev,
        loading: false,
        error: toReadableAuthError(err),
      }));
    }
  }

  // Prioridad: error de formulario > error de callback.
  const displayError = form.error ?? callbackError ?? null;
  const hasError = Boolean(displayError);

  return (
    <AuthCard
      title="Inicio de sesión"
      description="Ingresa a tu cuenta de organización"
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label="Formulario de inicio de sesión"
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
                aria-describedby={hasError ? 'login-error' : undefined}
                disabled={form.loading}
              />
            </div>
          </div>

          {/* Campo contraseña */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 rounded"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative">
              <Lock
                className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
                aria-hidden="true"
              />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                className="pl-9"
                required
                aria-required="true"
                aria-describedby={hasError ? 'login-error' : undefined}
                disabled={form.loading}
              />
            </div>
          </div>

          {/* Error (formulario o proveniente del callback) */}
          <FormError id="login-error" message={displayError} />

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            disabled={form.loading}
            aria-busy={form.loading}
          >
            {form.loading ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
