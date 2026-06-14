/**
 * read-repository.ts — LISTADO de miembros / invitaciones / bitácora.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §7-8`.
 *
 * El listado va por el READ-MODEL (drizzle, conexión privilegiada + filtro
 * EXPLÍCITO por organización), porque la política RLS de `profiles` es
 * self-only (anti-recursión 4B.1) y un cliente RLS-bound solo vería la propia
 * fila. El aislamiento por organización lo garantiza el `WHERE organization_id`
 * explícito + las pruebas de read-model isolation — igual que el resto de
 * listados del read-model.
 *
 * En modo `fixture` (dev/tests) se devuelven datos sembrados sin tocar la base.
 * El listado NUNCA expone `token_hash`.
 */
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { Uuid } from '@/lib/contracts/read-model';
import type { ProfileRole } from '@/server/auth/types';
import type { InvitationStatus, InvitationView, MemberView } from './types';

function resolveSource(): 'db' | 'fixture' {
  return process.env.READ_MODEL_SOURCE === 'db' ? 'db' : 'fixture';
}

/** Estado efectivo: una invitación 'pending' vencida se reporta 'expired'. */
export function effectiveInvitationStatus(
  status: InvitationStatus,
  expiresAt: string,
  now: Date = new Date(),
): InvitationStatus {
  if (status === 'pending' && new Date(expiresAt).getTime() < now.getTime()) {
    return 'expired';
  }
  return status;
}

export async function listMembers(organizationId: Uuid): Promise<MemberView[]> {
  if (resolveSource() === 'fixture') return fixtureMembers();
  const rows = await db
    .select({
      id: schema.profiles.id,
      fullName: schema.profiles.fullName,
      email: schema.profiles.email,
      role: schema.profiles.role,
      createdAt: schema.profiles.createdAt,
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.organizationId, organizationId))
    .orderBy(schema.profiles.createdAt);

  return rows.map((r) => ({
    userId: r.id,
    fullName: r.fullName,
    email: r.email,
    role: r.role as ProfileRole,
    createdAt: toIso(r.createdAt),
  }));
}

export async function listInvitations(
  organizationId: Uuid,
): Promise<InvitationView[]> {
  if (resolveSource() === 'fixture') return fixtureInvitations();
  const rows = await db
    .select({
      id: schema.organizationInvitations.id,
      email: schema.organizationInvitations.email,
      fullName: schema.organizationInvitations.fullName,
      role: schema.organizationInvitations.role,
      status: schema.organizationInvitations.status,
      createdAt: schema.organizationInvitations.createdAt,
      expiresAt: schema.organizationInvitations.expiresAt,
      acceptedAt: schema.organizationInvitations.acceptedAt,
      revokedAt: schema.organizationInvitations.revokedAt,
    })
    .from(schema.organizationInvitations)
    .where(eq(schema.organizationInvitations.organizationId, organizationId))
    .orderBy(desc(schema.organizationInvitations.createdAt));

  return rows.map((r) => toInvitationView({
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    role: r.role as ProfileRole,
    status: r.status as InvitationStatus,
    invitedAt: toIso(r.createdAt),
    expiresAt: toIso(r.expiresAt),
    acceptedAt: r.acceptedAt ? toIso(r.acceptedAt) : null,
    revokedAt: r.revokedAt ? toIso(r.revokedAt) : null,
  }));
}

/** Cuenta invitaciones pendientes (no vencidas) — utilidad de UI. */
export async function countPendingInvitations(
  organizationId: Uuid,
): Promise<number> {
  const all = await listInvitations(organizationId);
  return all.filter((i) => i.effectiveStatus === 'pending').length;
}

/** Nombre de la organización (para plantillas de email). Fixture: ICONIC. */
export async function getOrganizationName(organizationId: Uuid): Promise<string> {
  if (resolveSource() === 'fixture') return 'Grupo ICONIC';
  const rows = await db
    .select({ name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  return rows[0]?.name ?? 'tu organización';
}

function toInvitationView(v: Omit<InvitationView, 'effectiveStatus'>): InvitationView {
  return { ...v, effectiveStatus: effectiveInvitationStatus(v.status, v.expiresAt) };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/* --------------------------------------------------------------------------
 * Fixtures (modo dev/tests) — datos sembrados, sin base de datos.
 * ------------------------------------------------------------------------ */

function fixtureMembers(): MemberView[] {
  return [
    {
      userId: '00000000-0000-0000-0000-0000000000b1',
      fullName: 'Administrador ICONIC',
      email: 'admin@iconic.test',
      role: 'admin',
      createdAt: '2026-05-30T09:00:00.000Z',
    },
    {
      userId: '00000000-0000-0000-0000-0000000000b2',
      fullName: 'Gerencia ICONIC',
      email: 'gerencia@iconic.test',
      role: 'gerencia',
      createdAt: '2026-06-01T09:00:00.000Z',
    },
    {
      userId: '00000000-0000-0000-0000-0000000000b3',
      fullName: 'Presupuestos ICONIC',
      email: 'presupuestos@iconic.test',
      role: 'presupuestos',
      createdAt: '2026-06-02T09:00:00.000Z',
    },
  ];
}

function fixtureInvitations(): InvitationView[] {
  const inOneWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  return [
    toInvitationView({
      id: '00000000-0000-0000-0000-0000000000e1',
      email: 'obra@iconic.test',
      fullName: 'Residente de Obra',
      role: 'obra',
      status: 'pending',
      invitedAt: '2026-06-13T09:00:00.000Z',
      expiresAt: inOneWeek,
      acceptedAt: null,
      revokedAt: null,
    }),
  ];
}
