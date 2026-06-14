/**
 * /invite/accept — Aceptación de invitación (ruta pública).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §4`.
 *
 * Server Component:
 *  1. Lee el token de la query y consulta `peek_invitation` (por HASH) — NUNCA
 *     se persiste ni se loguea el token plano.
 *  2. Si la invitación está vigente, muestra el formulario de aceptación (el
 *     invitado define su contraseña). Si no, muestra un mensaje claro.
 *
 * La aceptación real (crear sesión + RPC accept_invitation) ocurre client-side
 * con el cliente Supabase del invitado (ver accept-form.tsx).
 */
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { hashToken } from '@/server/access';
import { AuthCard } from '@/components/auth/auth-card';
import { AcceptInvitationForm } from './_components/accept-form';
import { roleLabel } from '@/app/(dashboard)/settings/access/labels';

export const dynamic = 'force-dynamic';

interface PeekResult {
  status: 'pending' | 'expired' | 'revoked' | 'accepted' | 'invalid';
  email?: string;
  fullName?: string | null;
  role?: string;
  organizationName?: string;
  expiresAt?: string;
}

async function peek(token: string | undefined): Promise<PeekResult> {
  if (!token) return { status: 'invalid' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('peek_invitation', {
      p_token_hash: hashToken(token),
    });
    if (error || !data) return { status: 'invalid' };
    return data as PeekResult;
  } catch {
    return { status: 'invalid' };
  }
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await peek(token);

  if (result.status === 'pending' && token && result.email && result.role) {
    return (
      <AuthCard
        title="Aceptar invitación"
        description={`Te invitaron a ${result.organizationName ?? 'tu organización'} como ${roleLabel(result.role)}`}
      >
        <AcceptInvitationForm
          token={token}
          email={result.email}
          fullName={result.fullName ?? null}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Invitación" description="Estado de tu invitación">
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-600">{statusMessage(result.status)}</p>
        <Link
          href="/login"
          className="inline-block text-sm text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 rounded"
        >
          Ir al inicio de sesión
        </Link>
      </div>
    </AuthCard>
  );
}

function statusMessage(status: PeekResult['status']): string {
  switch (status) {
    case 'expired':
      return 'Esta invitación ha expirado. Solicita una nueva a la administración de tu organización.';
    case 'revoked':
      return 'Esta invitación fue revocada. Contacta a la administración de tu organización.';
    case 'accepted':
      return 'Esta invitación ya fue utilizada. Inicia sesión con tu cuenta.';
    default:
      return 'El enlace de invitación no es válido. Verifica que esté completo o solicita uno nuevo.';
  }
}
