---
name: project-toolchain-env
description: Quirks del entorno de desarrollo Windows para el toolchain pnpm/Corepack de Construction Ops
metadata:
  type: project
---

Entorno de desarrollo (Windows) y cómo operar el gestor de paquetes.

**Hechos clave:**
- Node v24.13.0, npm 11.6.2, corepack 0.34.5. pnpm fijado en **11.5.0**
  vía Corepack (`packageManager: pnpm@11.5.0` en package.json raíz).
- `corepack enable pnpm` **falla con EPERM** porque intenta escribir el
  shim en `C:\Program Files\nodejs` (requiere admin).

**Why:** el usuario no ejecuta como admin; no se debe cambiar Node global.

**How to apply:** para tener `pnpm` en PATH sin admin, usar:
`corepack prepare pnpm@latest-11 --activate` y luego
`corepack enable --install-directory "$(npm config get prefix)" pnpm`
(el dir global de npm del usuario sí está en PATH y es escribible).
Alternativamente invocar siempre `corepack pnpm ...`.

- pnpm 11 ignora build scripts por defecto. La clave de aprobación
  **vigente en pnpm 11 es `allowBuilds`** (mapa `pkg: true|false`), NO
  `onlyBuiltDependencies` (legacy). Verificado en el dist de pnpm 11.5.0
  (`allowBuilds` 91 ocurrencias vs `onlyBuiltDependencies` 2). En
  `pnpm-workspace.yaml`: `allowBuilds: { esbuild: true, sharp: true,
  unrs-resolver: true }`. Si tras `pnpm install` aparece
  `ERR_PNPM_IGNORED_BUILDS`, ejecutar `corepack pnpm rebuild <pkgs>`.
  (sharp lo añade Next 16 para optimización de imágenes.)

- Validaciones de merge: `pnpm run typecheck|lint|test|build` (raíz
  delega a `apps/web`). Validador de agentes:
  `powershell.exe -ExecutionPolicy Bypass -File "scripts/validate-claude-agents.ps1"`
  (usar comillas/forward-slashes; `.\` se rompe vía bash).

**Supabase local + RLS runtime (Oleada 1.5):**
- Supabase CLI = devDep raíz `supabase` (MIT). Invocar `corepack pnpm exec
  supabase ...`. SOLO local: prohibido `supabase link` / `db push` / remoto.
- Flujo: `supabase start` → `supabase db reset` (aplica 11 migraciones + 2
  seeds) → harness RLS `pnpm --filter web exec tsx ../../scripts/rls-runtime/run.ts`
  → `supabase stop`. El harness usa el pkg `postgres` (vive en apps/web), por eso
  se corre con `--filter web` (mismo patrón que `gm:import`).
- Técnica RLS: conectar como `postgres` (superusuario, ignora RLS) y dentro de tx
  `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', json, true)`;
  el helper `app.current_org()` lee `organization_id` del claim. Mutaciones en tx
  con ROLLBACK. Los seeds crean 1 sola org; el harness crea una 2.ª org para
  probar aislamiento cross-org.
- **Riesgo conocido (resuelto una vez)**: `supabase start`/`docker pull` pueden
  fallar con `io.containerd...meta.db: input/output error` (content store de
  Docker Desktop corrupto; NO es falta de espacio). Fix: reiniciar Docker Desktop
  y, si persiste, *Troubleshoot → Clean / Purge data*. Tras la reparación el flujo
  corre limpio (B-003 cerrado 2026-05-30: RLS runtime 21/21 PASS).
- **`realtime` unhealthy en Windows**: el contenedor `realtime` suele quedar
  *unhealthy* y aborta `supabase start`. El harness RLS solo necesita el `db`, así
  que arrancar con `-x realtime,studio,storage-api,imgproxy,edge-runtime,logflare,
  mailpit,vector`. (Nombres válidos de `-x`: edge-runtime, gotrue, imgproxy, kong,
  logflare, mailpit, postgres-meta, postgrest, realtime, storage-api, studio,
  supavisor, vector — NO existen `storage`/`functions`/`inbucket`/`analytics`.)
- **Seeds locales**: `supabase db reset` NO carga `supabase/seeds/*.sql` por
  defecto (busca `supabase/seed.sql`). Hay que declararlos en `config.toml`:
  `[db.seed] enabled = true; sql_paths = ["./seeds/0001_*.sql", "./seeds/0002_*.sql"]`.
- **FK auth.users**: en el stack Supabase local el esquema `auth` existe, así que
  la migración de `profiles` activa el FK `profiles_id_auth_users_fk`. Cualquier
  seed/harness que inserte `profiles` debe crear primero la fila en `auth.users`
  (guardado por presencia del esquema `auth` para no romper Postgres puro).
