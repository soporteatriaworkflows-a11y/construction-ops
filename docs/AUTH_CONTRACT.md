# AUTH_CONTRACT — Autenticación, sesión y RLS por identidad (Oleada 4A)

> **Contrato congelado v1 para Oleada 4A — cambios únicamente mediante
> `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad de evolución: `agent-orchestrator`. Implementación DB/RLS:
> `agent-db-rls` (microfase 4A.1). Wiring de sesión/UI: 4A.2 (no en esta fase).
> Fecha de congelación: 2026-06-01.

Define los **modos de operación**, el **viewer autenticado**, los **roles** y su
mapeo, la **matriz ruta×rol**, las **rutas públicas/protegidas** y las
**variables de entorno** de la autenticación de Construction Ops. Se apoya en el
modelo existente (`organizations`, `profiles`) **sin duplicar tablas**.

---

## 0. Estado existente reutilizado (auditoría 4A.1)

- **`profiles`** (`apps/web/lib/db/schema.ts`, migración `…090100`): `id =
  auth.users.id` (PK), `organization_id` **NOT NULL** (FK a `organizations`),
  `full_name`, `email`, `role` (CHECK `admin|gerencia|presupuestos|obra|compras|
  consulta`). FK a `auth.users` creada condicionalmente (si existe el esquema
  `auth`). **Es la fuente única de membresía e identidad.**
- **Membresía**: **single-org** (un usuario ↔ una organización vía
  `profiles.organization_id`). Multi-org **NO** está en alcance v1.
- **Helpers** (`…090000`): `app.current_org()` lee el claim JWT
  `organization_id`; `app.current_role()` lee el claim `user_role`. **0**
  políticas usan `auth.uid()` hoy (RLS dirigido por claims custom del JWT demo).
- **`proxy.ts`**: stub pass-through (sin auth). Se cableará en 4A.2.
- **Read-model**: `ViewerContext { organizationId, role: ViewerRole }`, resuelto
  server-side. `getDemoViewer()` provee viewer demo para `fixture`.

**Regla de no-duplicación**: 4A.1 **reutiliza `profiles`** como membresía y NO
crea tablas equivalentes nuevas. Cualquier capacidad multi-org futura se
solicita por INTEGRATION_REQUESTS.

---

## 1. Modos explícitos

### `APP_AUTH_MODE`
- `demo` — viewer demo server-side (`getDemoViewer`); **solo** desarrollo, tests
  y demo sanitizada.
- `supabase` — sesión real de Supabase Auth; **obligatorio** para operación real.

### `READ_MODEL_SOURCE`
- `fixture` — read-model respaldado por el golden master sanitizado.
- `db` — read-model contra PostgreSQL real (RLS por identidad).

### Reglas de combinación
| `APP_AUTH_MODE` | `READ_MODEL_SOURCE` | Uso |
|---|---|---|
| `demo` | `fixture` | ✅ desarrollo/tests/demo sanitizada |
| `supabase` | `db` | ✅ operación real |
| `supabase` | `fixture` | ⚠️ solo dev de auth (no datos reales) |
| `demo` | `db` | ❌ prohibido |

- **Prohibido el fallback silencioso** de `supabase`→`demo` o `db`→`fixture`. Si
  el modo real no puede inicializarse, **error explícito** (no degradar a demo).
- Se **registra** (log) el modo activo al arrancar.
- **Producción real NO puede operar con `APP_AUTH_MODE=demo`** ni
  `READ_MODEL_SOURCE=fixture`.

---

## 2. Viewer autenticado

```ts
/** Viewer real, resuelto SOLO server-side desde la sesión. */
export interface AuthenticatedViewer {
  userId: Uuid;          // = auth.uid() (profiles.id)
  profileId: Uuid;       // = profiles.id (== userId en este modelo)
  organizationId: Uuid;  // = profiles.organization_id (membresía)
  role: ViewerRole;      // derivado del profile (ver §3)
  email?: string;
}
```

### Reglas
- Se resuelve **únicamente server-side** a partir de una **sesión válida**
  (cookie SSR). Nunca en el navegador.
- `organizationId` se deriva de la **membresía autorizada** (`profiles` por
  `auth.uid()`), **nunca** de un `organizationId` enviado por el navegador ni de
  query params.
- `role` se deriva del `profiles.role` (mapeo §3), no de input del cliente.
- Si **no hay sesión** o **no hay membresía** (`profiles` ausente para el
  `auth.uid()`): **deny by default** (sin viewer, sin datos).
- En modo `supabase`+`db`, el `ViewerContext` del read-model se construye desde
  el `AuthenticatedViewer` (sustituye a `getDemoViewer`).

### Helpers SQL (objetivo 4A.1, propiedad `agent-db-rls`)
- `app.current_org()` y `app.current_role()` deben resolver, **en modo real**,
  desde `auth.uid()` → `profiles`, **manteniendo compatibilidad** con el harness
  demo (claims JWT). Patrón sugerido (no normativo): `COALESCE(claim_jwt,
  lookup_por_auth_uid)`. **Deny by default** cuando ambos son NULL.
- RLS sigue siendo la **barrera real**: el guard de UI/route **no** la reemplaza.

---

## 3. Roles

### Roles del read-model (`ViewerRole`, congelados — fuente de proyección)
`client` · `site` · `management` · `internal`.

### Roles de `profiles` (DB, ya existentes)
`admin` · `gerencia` · `presupuestos` · `obra` · `compras` · `consulta`.

### Mapeo congelado `profiles.role` → `ViewerRole` (v1)
| `profiles.role` | `ViewerRole` | Racional |
|---|---|---|
| `admin` | `management` | Gestión total + financiero |
| `gerencia` | `management` | Visión financiera/gerencial |
| `presupuestos` | `internal` | Técnico interno (APU/BOQ/trazabilidad) |
| `compras` | `internal` | Proveedores/SKU/compras (interno) |
| `obra` | `site` | Ejecución/cronograma sin precios de compra |
| `consulta` | `client` | Solo lectura, proyección más restrictiva |

> Mapeo **frozen v1**; ajustable solo vía INTEGRATION_REQUESTS. La proyección de
> privacidad por `ViewerRole` ya existe (read-model + exports).

### Matriz mínima ruta×rol (acceso de lectura)
| Ruta | client | site | management | internal |
|---|:---:|:---:|:---:|:---:|
| `/dashboard` | ❌ | ✅ | ✅ | ✅ |
| `/projects` | ✅ | ✅ | ✅ | ✅ |
| `/estimates` | ✅ | ✅ | ✅ | ✅ |
| `/apu` | ❌ | ✅ | ✅ | ✅ |
| `/catalog` | ❌ | ✅ | ✅ | ✅ |
| `/quantities` | ❌ | ✅ | ✅ | ✅ |
| `/planning` | ✅ʳ | ✅ | ✅ | ✅ |
| `/api/exports` | ✅ᵖ | ✅ᵖ | ✅ᵖ | ✅ᵖ |

- ✅ʳ `client` ve `/planning` con proyección restringida (sin holguras/ruta
  crítica/avance financiero — ya implementado).
- ✅ᵖ `/api/exports` valida **perfil×formato** (EXPORT_PROFILES_CONTRACT) además
  del rol; cada perfil recibe solo su whitelist.
- **El guard visual NO reemplaza RLS**: toda fila se filtra por
  `organization_id` y, donde aplica, por rol, en la base.

---

## 4. Rutas públicas (futuras, 4A.2)
`/login` · `/forgot-password` · `/reset-password` · `/auth/callback`.

## 5. Rutas protegidas
`/dashboard` · `/projects` · `/estimates` · `/apu` · `/catalog` ·
`/quantities` · `/planning` · `/api/exports`.

> El cableado de protección (`proxy.ts` + redirecciones + viewer real) es de la
> **microfase 4A.2**, no de 4A.1.

---

## 6. Variables de entorno (solo placeholders en `.env.example`)

```
APP_AUTH_MODE=demo                       # demo | supabase
NEXT_PUBLIC_SUPABASE_URL=                # URL del proyecto Supabase (local/real)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=    # clave publishable/anon (pública)
```

### Reglas de seguridad
- **No** publicar valores reales en el repo. **No** versionar `.env.local`.
- **Nunca** usar `service_role` en el frontend ni exponerla como
  `NEXT_PUBLIC_*`. (Si se necesitara server-side, sería una var **no** pública,
  fuera de esta fase.)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` es pública por diseño (anon/publishable),
  pero **no** sustituye a RLS: la seguridad real es RLS por identidad.
- `READ_MODEL_SOURCE` permanece en `fixture` por defecto; **no** se cambia a `db`
  en producción en esta microfase.

---

## 7. Alcance de 4A.1 (esta microfase) vs fuera de alcance

**En 4A.1 (`agent-db-rls`)**: membresía mínima por `profiles` (reutilizada),
helpers SQL que resuelven identidad real (`auth.uid()`→`profiles`) con
compatibilidad demo, seeds locales sanitizados con `auth.users`, **RLS runtime**
(previo 32/32 + nuevos tests auth), deny-by-default.

**Fuera de 4A.1** (reservado a 4A.2+): browser/server Supabase clients, sesión
SSR por cookies, `proxy.ts`, viewer real cableado, login/logout/reset UI,
`/auth/callback`, cambio a `READ_MODEL_SOURCE=db` en runtime de la app.

**Nunca en esta oleada**: Supabase remoto, `supabase link`, `db push`, deploy,
cambios en Vercel, `service_role` en frontend, secretos en repo, multi-org.

---

## Estado de implementación (4A.1 — DB/RLS integrado en `integration/wave-4a-auth-local`)

- **Helpers SQL implementados** (migración `20260601090000_auth_identity_helpers.sql`,
  merge `adeafbe`): `app._jwt_claims()`, `app._auth_uid()`, `app._profile_org(uid)`,
  `app._profile_role(uid)` (SECURITY DEFINER, search_path fijo), `app.current_org()`,
  `app.current_role()`, `app.current_org_user()`. Resolución `auth.uid()`→`profiles`
  con COALESCE a claims demo; **deny-by-default**. Reutiliza `profiles` single-org;
  **sin tablas nuevas**.
- **RLS runtime 47/47 PASS** (32 previos compat + 15 auth). Validado solo en local
  (Supabase Docker); **sin remoto**.
- **Pendiente (4A.2)**: clientes browser/server, sesión SSR por cookies, `proxy.ts`,
  viewer real (sustituir `getDemoViewer` en modo `supabase`), rutas públicas/UI.
  `READ_MODEL_SOURCE=fixture` por defecto (sin cambio a `db` en runtime aún).
