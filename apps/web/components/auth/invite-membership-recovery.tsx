/**
 * invite-membership-recovery.tsx — Recuperación de membresía (Client Component).
 *
 * Propiedad: agent-orchestrator (runtime auth). Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §4`.
 *
 * Red de seguridad para el caso real de V5.6.1E: un usuario Auth CONFIRMADO que
 * aterriza autenticado (p. ej. en `/dashboard`) SIN `profiles` porque el cierre
 * de la invitación no llegó a ejecutarse. En vez de dejarlo en el mensaje
 * "El usuario no tiene membresía." sin salida, este componente:
 *
 *  - lee el token de invitación persistido en ESTE navegador (su propio secreto,
 *    guardado por el formulario de aceptación antes del signUp);
 *  - si existe, finaliza la invitación con el RPC `accept_invitation` (autoridad
 *    única; NO escribe `profiles` directo) y recarga para que el viewer
 *    server-side vea la nueva membresía;
 *  - si no existe (otro dispositivo/navegador o storage limpiado), muestra una
 *    instrucción clara para reabrir el enlace de invitación original.
 *
 * Nunca se navega al panel con datos: la recarga a `/dashboard` sólo ocurre tras
 * un cierre confirmado por el RPC.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MailWarning, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  clearPendingInviteToken,
  finalizeInviteAcceptance,
  readPendingInviteToken,
} from '@/app/(auth)/invite/accept/finalize-invitation';

type Phase = 'checking' | 'finalizing' | 'error' | 'no-token';

export function InviteMembershipRecovery() {
  const startedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // setState diferido a un microtask (no síncrono en el cuerpo del effect).
    void Promise.resolve().then(async () => {
      const token = readPendingInviteToken();
      if (!token) {
        setPhase('no-token');
        return;
      }

      setPhase('finalizing');
      try {
        const supabase = createClient();
        const result = await finalizeInviteAcceptance(supabase, token);
        if (result.ok) {
          clearPendingInviteToken();
          // Recargar: el viewer server-side resolverá el nuevo `profiles`.
          window.location.assign('/dashboard');
          return;
        }
        setError(result.error);
        setPhase('error');
      } catch {
        setError('No se pudo finalizar la invitación. Intenta de nuevo.');
        setPhase('error');
      }
    });
  }, []);

  if (phase === 'checking' || phase === 'finalizing') {
    return (
      <RecoveryCard
        icon={<Loader2 className="h-5 w-5 animate-spin text-iconic-primary" aria-hidden="true" />}
        title="Finalizando invitación…"
        tone="info"
      >
        <p className="text-sm text-gray-600" role="status" aria-live="polite">
          Estamos activando tu acceso. Esto solo toma un momento.
        </p>
      </RecoveryCard>
    );
  }

  if (phase === 'error') {
    return (
      <RecoveryCard
        icon={<MailWarning className="h-5 w-5 text-red-600" aria-hidden="true" />}
        title="No pudimos activar tu acceso"
        tone="error"
      >
        <p className="text-sm text-red-700" role="alert" aria-live="assertive">
          {error}
        </p>
        <p className="text-sm text-gray-600">
          Vuelve a abrir el enlace de invitación original que recibiste por correo. Si
          el problema continúa, solicita una nueva invitación a la administración de tu
          organización.
        </p>
        <Link href="/login" className="text-sm font-medium text-iconic-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </RecoveryCard>
    );
  }

  // no-token: no hay forma segura de cerrar sin el token (no lookup por email en
  // cliente). Instrucción clara, sin dejar al usuario en un callejón sin salida.
  return (
    <RecoveryCard
      icon={<ShieldCheck className="h-5 w-5 text-amber-600" aria-hidden="true" />}
      title="Falta finalizar tu invitación"
      tone="warning"
    >
      <p className="text-sm text-gray-700">
        Tu cuenta existe, pero tu acceso a la organización aún no está activado. Para
        completarlo, vuelve a abrir el enlace de invitación original que recibiste por
        correo desde este mismo navegador.
      </p>
      <p className="text-sm text-gray-600">
        Si no encuentras el correo o el enlace expiró, solicita una nueva invitación a
        la administración de tu organización.
      </p>
      <Link href="/login" className="text-sm font-medium text-iconic-primary hover:underline">
        Volver a iniciar sesión
      </Link>
    </RecoveryCard>
  );
}

function RecoveryCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: 'info' | 'error' | 'warning';
  children: React.ReactNode;
}) {
  const ring =
    tone === 'error'
      ? 'border-red-200'
      : tone === 'warning'
        ? 'border-amber-200'
        : 'border-line';
  return (
    <div className="mx-auto max-w-lg py-10">
      <div className={`rounded-2xl border ${ring} bg-white p-6 shadow-iconic`}>
        <div className="mb-3 flex items-center gap-2">
          {icon}
          <h1 className="text-base font-semibold text-gray-900">{title}</h1>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}
