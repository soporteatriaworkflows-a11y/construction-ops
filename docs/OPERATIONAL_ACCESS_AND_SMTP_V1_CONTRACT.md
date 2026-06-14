# OPERATIONAL_ACCESS_AND_SMTP_V1 — Contrato congelado

**Versión:** 1.0 (congelado)
**Fecha:** 2026-06-14
**Rama:** `feature/operational-access-smtp-v1`
**Base:** `origin/main = 877c60b`
**Propiedad:** agent-orchestrator
**Alcance:** `OPERATIONAL_ACCESS_LAYER_V1` + `SMTP_CORPORATIVO_V1`

Documento complementario de `docs/AUTH_CONTRACT.md`, `docs/AUTH_RUNTIME_CONTRACT.md`
y `docs/PROJECT_MASTER.md §6.1`. Ante conflicto de gobierno prevalecen los
documentos de Construction Ops; sobre la API de Next.js prevalece la doc
versionada local (`@AGENTS.md`).

---

## 0. Objetivo

Hacer la plataforma operable por un equipo real sin depender de una sola cuenta
admin técnica: invitar/crear usuarios desde la UI, asignar roles, recuperar
contraseña, preparar correos transaccionales y SMTP corporativo, y controlar
permisos por rol — todo server-side, en español, con branding ICONIC.

---

## 1. Modelo de usuarios (CONGELADO)

Se **reutiliza** el modelo existente; no se duplican conceptos.

- `organizations` (id, name, …) — sin cambios.
- `profiles` (id = `auth.users.id`, organization_id, full_name, email, role, …)
  — **fuente única de membresía y rol**. `role ∈
  {admin, gerencia, presupuestos, obra, compras, consulta}` (CHECK existente).
- Mapeo `profiles.role → ViewerRole` en `server/auth/role-map.ts` (fuente única,
  NO se modifica el mapeo): admin/presupuestos/compras→`internal`,
  gerencia→`management`, obra→`site`, consulta→`client`.

Un usuario **activo** = fila en `profiles` con `id = auth.users.id`. No hay tabla
`memberships` separada; `profiles` cumple esa función (1 usuario : 1 organización
en v1; multi-org queda **fuera de alcance**).

### Estados de acceso (derivados, no es una máquina de estados nueva)

| Estado | Definición |
|---|---|
| Activo | Existe `profiles` para el usuario en la org. |
| Invitación pendiente | Existe `organization_invitations` con `status='pending'` y no vencida. |
| Invitación vencida | `status='pending'` y `expires_at < now()`. |
| Revocado (invitación) | `organization_invitations.status='revoked'`. |
| Desactivado | **Diferido** (ver §11). No hay borrado físico de usuarios. |

---

## 2. Invitaciones (CONGELADO)

Tabla nueva **aditiva** `organization_invitations`:

```
id              uuid PK
organization_id uuid NOT NULL → organizations(id)
email           text NOT NULL            -- destinatario (lowercased)
role            text NOT NULL            -- rol propuesto (mismo CHECK que profiles.role)
token_hash      text NOT NULL UNIQUE     -- SHA-256 del token; NUNCA el token plano
status          text NOT NULL DEFAULT 'pending'  -- pending|accepted|revoked|expired
invited_by      uuid NOT NULL            -- profiles.id del actor (server-side)
message         text NULL                -- mensaje opcional del invitador
expires_at      timestamptz NOT NULL     -- now() + INVITE_TTL (default 7 días)
accepted_at     timestamptz NULL
accepted_by     uuid NULL                -- auth.users.id que aceptó
revoked_at      timestamptz NULL
revoked_by      uuid NULL
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```

Reglas:
- El **token plano** se genera server-side (32 bytes aleatorios, base64url), se
  envía por email / se muestra como fallback dev, y **solo se guarda su hash**.
- Un token vencido / usado / revocado → rechazo con mensaje claro.
- `UNIQUE(organization_id, email) WHERE status='pending'` (índice parcial): una
  sola invitación pendiente por email/org. Reenviar rota token+expiración.
- No se puede invitar a un email que ya es `profiles` activo de la org.

---

## 3. Roles y permisos (CONGELADO)

Capacidad derivada del `ViewerRole` resuelto server-side (deny-by-default):

| Capacidad | internal | management | site | client |
|---|---|---|---|---|
| Ver gestión de accesos | sólo `admin`* | Sí | No | No |
| Invitar usuario | sólo `admin`* | Sí | No | No |
| Reenviar/Revocar invitación | sólo `admin`* | Sí | No | No |
| Cambiar rol de otro usuario | sólo `admin`* | Sí (no a `admin`) | No | No |

\* `internal` agrupa admin/presupuestos/compras. **Solo `profiles.role='admin'`**
(no todo `internal`) gestiona usuarios. `presupuestos`/`compras`/`obra`/`consulta`
**no** gestionan accesos. `gerencia` (management) sí gestiona, pero **no puede
crear ni elevar a `admin`** (solo otro admin asigna `admin`).

Guards no negociables:
- `organizationId` SIEMPRE server-side (`resolveAuthenticatedViewer()`),
  NUNCA del navegador.
- `actorUserId` server-side.
- `role` asignado validado contra lista permitida server-side.
- **Nadie puede elevar su propio rol** (actor ≠ destinatario para subir
  privilegio; y management no asigna `admin`).
- `site`/`client` no crean usuarios ni ven la sección.
- Cross-org bloqueado por RLS + verificación explícita en el dominio.

---

## 4. Recuperación de contraseña (CONGELADO — ya implementado)

Se **reutiliza** el flujo existente (Oleada 4A.2), basado en Supabase Auth PKCE:
- `/forgot-password` → `supabase.auth.resetPasswordForEmail()` con `redirectTo`
  `…/auth/callback?next=/reset-password`. Mensaje **neutral** (no revela si el
  email existe).
- `/auth/callback` → `exchangeCodeForSession`, `sanitizeNext` (anti open-redirect).
- `/reset-password` → `supabase.auth.updateUser({ password })`.
- Link «¿Olvidaste tu contraseña?» presente en `/login`.

No se reinventa criptografía. El **envío** del correo de reset lo hace Supabase
Auth con el SMTP configurado en el panel de Supabase (ver §6).

---

## 5. Plantillas de email (CONGELADO)

Fuente de verdad en repo (`server/email/templates.ts`), español + ICONIC:
1. **Invitación** — asunto, cuerpo, link `/invite/accept?token=…`, expiración.
2. **Recuperación de contraseña** — texto canónico para pegar en el panel de
   Supabase Auth (la plantilla nativa de Supabase es la que se envía).
3. **Invitación reenviada** — variante con token nuevo.
4. **Acceso revocado** (opcional/diferido) — notificación.

Cada plantilla expone `{ subject, html, text }` puros y testeables. **Ningún
secreto ni token** se registra en logs.

---

## 6. SMTP corporativo (CONGELADO)

Dos planos:

1. **Correos de Supabase Auth** (reset de contraseña, confirmaciones): el SMTP
   corporativo se configura en **el panel de Supabase** (Auth → SMTP Settings).
   Esto NO se versiona ni se setea por esta rama. Se **documentan** las variables
   que el operador deberá configurar allí.
2. **Correos propios de la app** (invitaciones): abstracción `EmailProvider`:
   - `LogEmailProvider` — **default en dev/test**: captura/loguea metadatos
     (NO el token, NO el body sensible) y **no envía nada real**.
   - `SmtpEmailProvider` — selección solo si TODAS las `SMTP_*` están presentes;
     usa `nodemailer` cargado por **import dinámico opcional** (no es dependencia
     dura del build). Si falta la dependencia o la config, cae a `LogEmailProvider`
     con advertencia controlada (fallback documentado).
   - `factory` `resolveEmailProvider()` lee env; sin env → Log.

Variables requeridas (a configurar DESPUÉS, nunca en repo, nunca remoto por esta
rama):

```
SMTP_HOST
SMTP_PORT            (587 STARTTLS | 465 SSL)
SMTP_USER
SMTP_PASSWORD        (SOLO en el entorno de despliegue; jamás en repo)
SMTP_FROM            (ej. "ICONIC Ops <no-responder@iconic.example>")
SMTP_SECURE          (true para 465; false para 587)
APP_PUBLIC_URL       (= NEXT_PUBLIC_APP_URL; base para links de invitación)
EMAIL_PROVIDER       (opcional: log|smtp; default auto por presencia de SMTP_*)
INVITE_TTL_HOURS     (opcional; default 168 = 7 días)
```

En desarrollo y tests: **emails se capturan/loguean sin envío real**. No se
hardcodean secretos. No se modifican variables remotas.

---

## 7. Seguridad (CONGELADO)

- `service_role` NUNCA llega al cliente. Las operaciones de acceso usan el cliente
  RLS-bound del usuario salvo dos excepciones controladas server-side:
  - **Listar miembros de la org**: RPC `SECURITY DEFINER` `list_org_members()` que
    devuelve SOLO filas de `app.current_org()` (no recursiva; sustituye al SELECT
    self-only sin debilitar aislamiento).
  - **Crear/aceptar invitación**: RPCs `SECURITY DEFINER` con verificación interna
    de org + rol del actor.
- Anti open-redirect: `sanitizeNext` ya existente.
- Tokens: solo hash en DB; comparación por hash; un solo uso.
- Sin `permissionMode: bypassPermissions`. Sin AGPL. Sin `ag-grid-enterprise`.

---

## 8. RLS (CONGELADO)

- `organization_invitations`: `ENABLE` + `FORCE`.
  - SELECT: `organization_id = app.current_org()` (miembros ven invitaciones de su
    org).
  - INSERT/UPDATE/DELETE: restringido vía RPC `SECURITY DEFINER` (admin/gerencia);
    no se exponen políticas de escritura directa a roles de baja confianza.
- `profiles`: se **mantiene** `profiles_self_select` (anti-recursión). El listado
  de miembros pasa por la RPC `list_org_members()` (no se reintroduce SELECT
  org-wide recursivo).
- `access_audit_log` (si se crea): `ENABLE`+`FORCE`, SELECT por org.
- Preflight FORCE count se incrementa según tablas nuevas (documentado en QA).

---

## 9. Auditoría (CONGELADO — mínima aditiva)

Tabla `access_audit_log` (aditiva) o reuso de patrón existente:
```
id, organization_id, actor_user_id, action, target_email|target_user_id,
metadata jsonb, created_at
```
Acciones: `invite_created`, `invite_resent`, `invite_revoked`, `invite_accepted`,
`role_changed`. **Nunca** se loguean tokens ni contraseñas. `password_reset_requested`
queda **diferido** (lo gestiona Supabase Auth; sin datos sensibles en nuestra app).

---

## 10. No envío real en tests (CONGELADO)

- Tests y dev usan `LogEmailProvider` (captura en memoria). Aserciones sobre
  `subject`/`body` renderizados, NUNCA envío real.
- Ausencia de SMTP en producción ⇒ error controlado/ fallback documentado
  (Log + warning), nunca crash silencioso.

---

## 11. Rollout seguro (CONGELADO)

1. Merge a main (autorización aparte; NO en esta rama).
2. `supabase db push` de las migraciones aditivas (NO en esta rama).
3. Configurar SMTP corporativo en panel Supabase (auth) + env `SMTP_*` en Vercel
   (auth invitaciones propias).
4. Crear primer `admin` real (ya existe en producción).
5. Verificación visual autenticada de `/settings/access`.

**Desactivar acceso** (suspender un usuario activo sin borrarlo) se **difiere**:
requiere columna `profiles.status` o tabla de suspensión + ajuste de
`resolveAuthenticatedViewer`. Se documenta como deuda `ACCESS_DEACTIVATION_V1`.

---

## 12. Fuera de alcance (CONGELADO)

multi-Supabase por cliente · SSO empresarial · MFA obligatorio · chat ·
cronograma · billing · firma digital · edición avanzada APU · desactivación de
usuario activo (diferido) · paginación real de listados.

---

## 13. Variables requeridas (resumen)

Ver §6. Se agregan a `.env.example` (documentadas, vacías). Ninguna se setea de
forma remota por esta rama.
