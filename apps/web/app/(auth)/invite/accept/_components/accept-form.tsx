/**
 * accept-form.tsx — Formulario de aceptación de invitación (Client Component).
 *
 * Flujo (cliente Supabase del invitado):
 *  1. El invitado define su contraseña.
 *  2. Se PERSISTE el token en su navegador (para sobrevivir al ida-y-vuelta de
 *     confirmación de correo aunque la URL lo pierda — ver finalize-invitation).
 *  3. signUp({ email, password }); si ya existe, signInWithPassword.
 *  4. Con la sesión activa, `finalizeInviteAcceptance` llama al RPC
 *     `accept_invitation` (autoridad única; el token se hashea con Web Crypto —
 *     el token plano NUNCA se envía a la base, solo su hash).
 *  5. Éxito → al panel (la membresía ya existe). Errores → mensaje claro.
 *
 * Si el proyecto Supabase exige confirmación de correo, signUp redirige de vuelta
 * al enlace de invitación; además el token queda persistido, de modo que la
 * recuperación de membresía puede cerrar la invitación aunque el usuario aterrice
 * autenticado en otra ruta (deny-by-default: nunca se navega al panel sin cierre).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/form-error';
import { FormSuccess } from '@/components/auth/form-success';
import { isValidPasswordLength } from '@/components/auth/auth-helpers';
import { createClient } from '@/lib/supabase/client';
import {
  ACCESS_ACTIVATED_MESSAGE,
  AUTO_ACCEPT_MESSAGE,
  CONFIRM_EMAIL_RETURN_MESSAGE,
  buildInviteConfirmationRedirect,
  isAlreadyRegisteredMessage,
} from '../invite-accept-flow';
import {
  clearPendingInviteToken,
  finalizeInviteAcceptance,
  storePendingInviteToken,
} from '../finalize-invitation';

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
  autoAccept = false,
}: {
  token: string;
  email: string;
  fullName: string | null;
  autoAccept?: boolean;
}) {
  const router = useRouter();
  const autoStartedRef = useRef(false);
  const [form, setForm] = useState<FormState>({
    password: '',
    confirm: '',
    fullName: fullName ?? '',
    error: null,
    success: null,
    loading: false,
  });

  const acceptWithActiveSession = useCallback(async (currentFullName: string) => {
    const supabase = createClient();
    // `finalizeInviteAcceptance` centraliza la higiene del token: limpia en éxito
    // y en error terminal (invitación usada/expirada/mismatch/inválida); conserva
    // solo en errores recuperables (acotado por el TTL). Aquí no se limpia aparte.
    const result = await finalizeInviteAcceptance(supabase, token, currentFullName);
    if (!result.ok) return result.error;
    return null;
  }, [token]);

  useEffect(() => {
    if (!autoAccept || autoStartedRef.current) return;
    autoStartedRef.current = true;

    void Promise.resolve()
      .then(() => {
        setForm((p) => ({ ...p, loading: true, error: null, success: AUTO_ACCEPT_MESSAGE }));
        return acceptWithActiveSession(form.fullName);
      })
      .then((error) => {
        if (error) {
          setForm((p) => ({ ...p, loading: false, success: null, error }));
          return;
        }
        setForm((p) => ({ ...p, loading: false, success: ACCESS_ACTIVATED_MESSAGE }));
        router.replace('/dashboard');
      })
      .catch(() => {
        setForm((p) => ({
          ...p,
          loading: false,
          success: null,
          error: 'Ocurrió un error inesperado. Intenta de nuevo.',
        }));
      });
  }, [acceptWithActiveSession, autoAccept, form.fullName, router]);

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

      // 0) Persistir el token en ESTE navegador antes de crear la cuenta. Así el
      //    cierre sobrevive al ida-y-vuelta de confirmación de correo aunque la
      //    URL de retorno pierda el token (recuperación de membresía lo usa).
      storePendingInviteToken(token);

      // 1) Crear la cuenta (o iniciar sesión si ya existe).
      const signUp = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: buildInviteConfirmationRedirect(window.location.origin, token),
        },
      });
      let hasSession = Boolean(signUp.data.session);

      if (signUp.error) {
        const already = isAlreadyRegisteredMessage(signUp.error.message);
        if (!already) {
          // Fallo terminal de creación de cuenta: el flujo no continúa con este
          // token → higiene, se limpia el token persistido.
          clearPendingInviteToken();
          setForm((p) => ({ ...p, loading: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' }));
          return;
        }
        const signIn = await supabase.auth.signInWithPassword({ email, password: form.password });
        if (signIn.error || !signIn.data.session) {
          // Recuperable (contraseña incorrecta): se conserva el token (el reintento
          // lo re-guarda de todos modos y el TTL lo acota) para no bloquear el cierre.
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
          success: CONFIRM_EMAIL_RETURN_MESSAGE,
        }));
        return;
      }

      // 2) Aceptar la invitación con la sesión activa.
      const error = await acceptWithActiveSession(form.fullName);
      if (error) {
        setForm((p) => ({ ...p, loading: false, error }));
        return;
      }

      setForm((p) => ({ ...p, loading: false, success: ACCESS_ACTIVATED_MESSAGE }));
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
        {form.loading ? 'Activando...' : 'Aceptar y activar acceso'}
      </Button>
    </form>
  );
}
