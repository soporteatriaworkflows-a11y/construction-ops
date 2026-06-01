# AUTH_RUNTIME_CONTRACT — Runtime SSR, viewer real, Proxy y guards (Oleada 4A.2)

> **Contrato congelado v1 para Oleada 4A.2 — cambios únicamente mediante
> `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad de evolución: `agent-orchestrator`. Runtime SSR/Proxy/viewer:
> orquestador. UI de acceso: `agent-frontend-boq`. Base DB/RLS: 4A.1
> (`docs/AUTH_CONTRACT.md`). Fecha de congelación: 2026-06-01.

Suplemento de runtime sobre `docs/AUTH_CONTRACT.md`. Define la sesión SSR, el
viewer autenticado, el Proxy (protección de rutas), las redirecciones y la
protección de `/api/exports`. **Sin remoto, sin Vercel, sin `service_role` en
frontend.**

---

## 1. Modos válidos

`APP_AUTH_MODE` ∈ `demo` | `supabase`. `READ_MODEL_SOURCE` ∈ `fixture` | `db`.

| `APP_AUTH_MODE` | `READ_MODEL_SOURCE` | Uso |
|---|---|---|
| `demo` | `fixture` | ✅ demo sanitizada / desarrollo |
| `supabase` | `fixture` | ✅ **temporal**: smoke local de auth con datos sanitizados |
| `supabase` | `db` | ✅ operación real futura |
| `demo` | `db` | ❌ prohibido |

- **Sin fallback silencioso**. Combinación inválida ⇒ **error explícito**.
- Se **registra** (log) el modo activo al arrancar.
- Producción real futura **no** puede operar con `APP_AUTH_MODE=demo`.

---

## 2. Variables (solo placeholders en `.env.example`)

```
APP_AUTH_MODE=demo                       # demo | supabase
READ_MODEL_SOURCE=fixture                # fixture | db
NEXT_PUBLIC_SUPABASE_URL=                # URL Supabase (local/real)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=    # clave publishable/anon (PÚBLICA)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Prohibido: `SUPABASE_SERVICE_ROLE_KEY` en frontend / como `NEXT_PUBLIC_*`; claves
remotas reales; contraseñas/tokens en repo; `.env.local` versionado.

---

## 3. Mapeo `profiles.role` → `ViewerRole` (congelado v1 — runtime)

| `profiles.role` | `ViewerRole` |
|---|---|
| `admin` | `internal` |
| `presupuestos` | `internal` |
| `compras` | `internal` |
| `gerencia` | `management` |
| `obra` | `site` |
| `consulta` | `client` |

> **Refina** el mapeo de `AUTH_CONTRACT` (admin pasa de `management` a `internal`
> = acceso técnico completo). Esta tabla es la **fuente única** del role-map en
> runtime (`apps/web/server/auth/role-map.ts`).
>
> Reglas: **menor privilegio por defecto**; rol desconocido o sin membresía ⇒
> **deny** (no viewer). Organización y rol se derivan **server-side** desde la
> sesión válida + `profiles` (`auth.uid()`); **nunca** desde query params,
> formularios ni navegador.

---

## 4. Rutas públicas
`/login` · `/forgot-password` · `/reset-password` · `/auth/callback` · assets
estáticos necesarios.

## 5. Rutas protegidas
`/dashboard` · `/projects` · `/estimates` · `/apu` · `/catalog` · `/quantities` ·
`/planning` · `/api/exports`.

---

## 6. Redirecciones

**Modo `supabase`**:
- `/` sin sesión → `/login`.
- `/` con sesión → `/dashboard`.
- ruta protegida sin sesión → `/login?next=<ruta-sanitizada>`.
- `/login` con sesión → `/dashboard`.
- logout → `/login`.

**Modo `demo`**:
- demo fixture operativa; `/` → `/dashboard`; sin requerir cookies Supabase.

**Sanitización de `next`**: solo rutas **internas** (empiezan con `/`, no `//`,
no `/\`, sin esquema/host). Cualquier otro valor ⇒ se ignora (→ `/dashboard`).
**Prevención de open redirect** obligatoria.

---

## 7. Seguridad SSR oficial (obligatorio)

- Usar **`@supabase/ssr`** (`createBrowserClient` / `createServerClient`).
- Clientes **browser** y **server** separados.
- Cookies mediante **`getAll()` + `setAll()`**. **PROHIBIDO** `get()`/`set()`/
  `remove()` (adaptadores antiguos) y **`@supabase/auth-helpers-nextjs`**.
- En el Proxy, validar con **`supabase.auth.getClaims()`**. **PROHIBIDO** usar
  **`supabase.auth.getSession()`** como barrera de seguridad server-side.
- **No** confiar solo en la existencia de una cookie.
- El Proxy **refresca tokens** y **propaga cookies** al request y al response.

---

## 8. Protección de `/api/exports`

**Modo `supabase`**:
- Exige **viewer autenticado** (deny-by-default sin sesión/membresía).
- El **perfil efectivo** lo deriva el servidor desde el `ViewerRole` del viewer.
- Un `profile` solicitado por query **no puede escalar**: solo se acepta si es
  **igual o menos privilegiado** que el `ViewerRole` autenticado (orden de
  privilegio: `internal` > `management` > `site` > `client`). En otro caso →
  **deny / se ignora** y se usa el del viewer.
- Nunca permitir escalamiento por query param.

**Modo `demo`**:
- Mantener fixture sanitizado (sin datos reales); no activar remoto.

---

## 9. Archivos del runtime (ownership orquestador)

- `apps/web/lib/supabase/client.ts` — `createBrowserClient` (publishable).
- `apps/web/lib/supabase/server.ts` — `createServerClient` (cookies SSR RSC).
- `apps/web/lib/supabase/proxy.ts` — cliente para el Proxy (cookies req/res).
- `apps/web/server/auth/{types,errors,role-map,session,resolve-viewer,index}.ts`.
- `apps/web/proxy.ts` — Proxy con guard + refresh + redirecciones.
- Ajuste mínimo: `apps/web/app/page.tsx` (redirección raíz),
  `apps/web/server/read-model/` (selector de viewer por modo),
  `apps/web/app/api/exports/route.ts` (guard + anti-escalamiento).

**UI (4A.2, `agent-frontend-boq`)**: `apps/web/app/(auth)/`,
`apps/web/components/auth/`, `apps/web/tests/unit/auth-ui/`,
`apps/web/app/(auth)/actions.ts` (acciones server mínimas).

---

## 10. Fuera de alcance (4A.2)

Supabase remoto, `supabase link`/`db push`, deploy, Vercel, `READ_MODEL_SOURCE=db`
en runtime de la app (default `fixture`), multi-org, creación de proyectos (4B).
