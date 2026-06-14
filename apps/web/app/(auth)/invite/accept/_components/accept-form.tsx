/**
 * accept-form.tsx — Formulario de aceptación de invitación (Client Component).
 *
 * Flujo (cliente Supabase del invitado):
 *  1. El invitado define su contraseña.
 *  2. signUp({ email, password }); si ya existe, signInWithPassword.
 *  3. Con la sesión activa, llama a la RPC `accept_invitation` (RLS-bound,
 *     authenticated). El token se hashea con Web Crypto (SHA-256) — el token
 *     plano NUNCA se envía a la base, solo su hash, igual que en el servidor.
 *  4. Éxito → al panel. Errores → mensaje claro en español.
 *
 * Si el proyecto Supabase exige confirmación de correo, signUp no crea sesión:
 * se informa al invitado que confirme su correo (fallback documentado).
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/form-error';
import { FormSuccess } from '@/components/auth/form-success';
import { isValidPasswordLength } from '@/components/auth/auth-helpers';
import { createClient } from '@/lib/supabase/client';

/** SHA-256 hex con Web Crypto (equivalente a node:crypto sha256 hex). */
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const ACCEPT_ERRORS: Record<string, string> = {
  invitation_invalid: 'La invitación no es válida.',
  invitation_revoked: 'Esta invitación fue revocada.',
  invitation_used: 'Esta invitación ya fue utilizada.',
  invitation_expired: 'Esta invitación ha expirado. Solicita una nueva.',
  email_mismatch: 'El correo de tu cuenta no coincide con el de la invitación.',
  already_member: 'Ya eres miembro de una organización.',
  no_session: 'No se pudo iniciar tu sesión. Intenta de nuevo.',
};

function mapAcceptError(message: string | undefined): string {
  const raw = (message ?? '').toLowerCase();
  for (const [key, msg] of Object.entries(ACCEPT_ERRORS)) {
    if (raw.includes(key)) return msg;
  }
  return 'No se pudo aceptar la invitación. Intenta de nuevo.';
}

interface FormState {
  password: string;
  confirm: string;
  fullName: string;
  error: string | null;
  success: string | null;
  loading: boolean;
}

export function AcceptInvitationForm({
  token,
  email,
  fullName,
}: {
  token: string;
  email: string;
  fullName: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    password: '',
    confirm: '',
    fullName: fullName ?? '',
    error: null,
    success: null,
    loading: false,
  });

  function change(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value, error: null }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidPasswordLength(form.password)) {
      setForm((p) => ({ ...p, error: 'La contraseña debe tener al menos 8 caracteres.' }));
      return;
    }
    if (form.password !== form.confirm) {
      setForm((p) => ({ ...p, error: 'Las contraseñas no coinciden.' }));
      return;
    }
    setForm((p) => ({ ...p, loading: true, error: null }));

    try {
      const supabase = createClient();

      // 1) Crear la cuenta (o iniciar sesión si ya existe).
      const signUp = await supabase.auth.signUp({ email, password: form.password });
      let hasSession = Boolean(signUp.data.session);

      if (signUp.error) {
        const already = signUp.error.message.toLowerCase().includes('already');
        if (!already) {
          setForm((p) => ({ ...p, loading: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' }));
          return;
        }
        const signIn = await supabase.auth.signInWithPassword({ email, password: form.password });
        if (signIn.error || !signIn.data.session) {
          setForm((p) => ({
            ...p,
            loading: false,
            error: 'Ya existe una cuenta con este correo. Verifica tu contraseña.',
          }));
          return;
        }
        hasSession = true;
      }

      if (!hasSession) {
        // Confirmación de correo activa: no hay sesión inmediata.
        setForm((p) => ({
          ...p,
          loading: false,
          success:
            'Te enviamos un correo para confirmar tu cuenta. Confírmalo y vuelve a abrir este enlace para finalizar.',
        }));
        return;
      }

      // 2) Aceptar la invitación con la sesión activa.
      const tokenHash = await sha256Hex(token);
      const { error } = await supabase.rpc('accept_invitation', {
        p_token_hash: tokenHash,
        p_email: email,
        p_full_name: form.fullName.trim() || null,
      });
      if (error) {
        setForm((p) => ({ ...p, loading: false, error: mapAcceptError(error.message) }));
        return;
      }

      setForm((p) => ({ ...p, loading: false, success: 'Acceso activado. Redirigiendo…' }));
      router.replace('/dashboard');
    } catch {
      setForm((p) => ({ ...p, loading: false, error: 'Ocurrió un error inesperado. Intenta de nuevo.' }));
    }
  }

  if (form.success) {
    return <FormSuccess id="accept-success" message={form.success} />;
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Formulario de aceptación de invitación" className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Correo</Label>
        <Input id="invite-email" type="email" value={email} readOnly disabled className="bg-gray-50" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nombre</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          value={form.fullName}
          onChange={change}
          maxLength={120}
          placeholder="Tu nombre completo"
          disabled={form.loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
        <div className="relative">
          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={change}
            className="pl-9"
            placeholder="Mínimo 8 caracteres"
            required
            disabled={form.loading}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <div className="relative">
          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={change}
            className="pl-9"
            placeholder="Repite la contraseña"
            required
            disabled={form.loading}
          />
        </div>
      </div>

      <FormError id="accept-error" message={form.error} />

      <Button type="submit" className="w-full" disabled={form.loading} aria-busy={form.loading}>
        {form.loading ? 'Activando…' : 'Aceptar y activar acceso'}
      </Button>
    </form>
  );
}
