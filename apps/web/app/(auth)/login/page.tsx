/**
 * Pantalla de login — mock Oleada 1.
 * "use client" requerido por estado de formulario.
 * Propiedad: agent-frontend-boq.
 */
'use client';

import { useState } from 'react';
import { Building2, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface LoginFormState {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
}

export default function LoginPage() {
  const [form, setForm] = useState<LoginFormState>({
    email: '',
    password: '',
    error: null,
    loading: false,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value, error: null }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Validación básica de UI — la validación real ocurre en el backend.
    if (!form.email.trim() || !form.email.includes('@')) {
      setForm((prev) => ({ ...prev, error: 'Ingresa un correo electrónico válido.' }));
      return;
    }
    if (form.password.length < 6) {
      setForm((prev) => ({ ...prev, error: 'La contraseña debe tener al menos 6 caracteres.' }));
      return;
    }

    // Oleada 1 — mock: simula carga sin conectar al backend real.
    setForm((prev) => ({ ...prev, loading: true, error: null }));
    setTimeout(() => {
      setForm((prev) => ({
        ...prev,
        loading: false,
        error: 'Autenticación no disponible en modo mock. Oleada 2 conectará Supabase Auth.',
      }));
    }, 800);
  }

  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <div className="mb-3 flex justify-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-white"
            aria-hidden="true"
          >
            <Building2 className="h-6 w-6" />
          </div>
        </div>
        <CardTitle className="text-2xl">Construction Ops</CardTitle>
        <CardDescription>Ingresa a tu cuenta de organización</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate aria-label="Formulario de inicio de sesión">
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
                  aria-describedby={form.error ? 'login-error' : undefined}
                />
              </div>
            </div>

            {/* Campo contraseña */}
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
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
                  aria-describedby={form.error ? 'login-error' : undefined}
                />
              </div>
            </div>

            {/* Error */}
            {form.error && (
              <div
                id="login-error"
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {form.error}
              </div>
            )}

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

        {/* Aviso mock */}
        <p className="mt-4 text-center text-xs text-gray-400">
          Modo mock — Oleada 1. Conectar Supabase Auth en Oleada 2.
        </p>
      </CardContent>
    </Card>
  );
}
