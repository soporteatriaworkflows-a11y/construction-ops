# 05 — Supabase / PostgreSQL / RLS / Auth / Storage

## 5.1 Inventario

- **Migraciones:** 20 (`20260530090000` … `20260605120000`).
- **Seeds:** 4 (`0001`–`0004`; demo org, catálogo, planning, org B / sin-membresía).
- **Edge Functions:** ninguna (`supabase/functions/.gitkeep`).
- **Storage buckets:** ninguno (sin `storage.*` en migraciones ni en código fuente).
- **Tablas con RLS:** 24 (ENABLE) / **24 con FORCE ROW LEVEL SECURITY**.
- **Funciones SECURITY DEFINER:** `app._auth_uid`, `app._profile_org`/`current_org`
  (helpers de identidad) + relacionadas.
- **RPCs:** `create_estimate_with_initial_version` (SECURITY INVOKER),
  `import_boq_into_version` (SECURITY INVOKER).
- **Harness RLS runtime:** `scripts/rls-runtime/run.ts` con **93 `check()`**.

### Tablas con FORCE RLS (24)
`organizations, profiles, projects, project_scopes, resources, labor_roles,
suppliers, supplier_products, price_observations, pricing_rules, apu_templates,
apu_components, apu_calculation_snapshots, estimates, estimate_versions, chapters,
boq_items, indirect_cost_rules, quantity_groups, quantity_lines, schedule_tasks,
task_dependencies, progress_entries, resource_assignments`.

## 5.2 RLS y autorización

| Control | Estado | Evidencia |
|---|---|---|
| RLS ENABLE en tablas multitenant | ✅ 24 | `grep ENABLE ROW LEVEL SECURITY` = 24 |
| FORCE RLS (incluye al owner de tabla) | ✅ 24 | `grep FORCE ROW LEVEL SECURITY` = 24 únicas |
| `anon` deny-by-default | ✅ | sin policies para `anon`; sin `GRANT ... TO anon` |
| RPCs revocados de PUBLIC/anon, grant solo authenticated | ✅ | mig. `…140000`, `…130000` |
| SECURITY DEFINER con `search_path` fijo | ✅ | `SET search_path = public, pg_temp` |
| Aislamiento por organización | ✅ a nivel SQL | policies leen `app.current_org()` |
| Datos sensibles (precios/descuentos) fuera de exports cliente | ✅ | contrato exports + tests |

### Hallazgo arquitectónico clave (H-01)
La **escritura** usa el cliente `@supabase/ssr` server (`lib/supabase/server.ts`)
con el **JWT del usuario** → rol `authenticated` → **RLS aplica** (defensa real).

La **lectura del read-model** (`server/read-model/drizzle-repository.ts`) usa una
**conexión estática `DATABASE_URL`** (`lib/db/index.ts`, postgres.js) y **no fija
contexto RLS** por petición (0 coincidencias de `set role` / `set_config` /
`request.jwt.claims`). La aislación depende del filtro aplicativo
`WHERE organization_id = viewer.organizationId`. Si `DATABASE_URL` usa un rol
privilegiado (owner/`service_role`/`postgres`), **RLS no protege las lecturas** y
cualquier omisión del filtro cruza tenants. → **Validar el rol de `DATABASE_URL`**
(doc `14`) y, en remediación, conectar el read-model como `authenticated` con el
JWT o migrar lecturas al cliente RLS-bound.

## 5.3 Auth

| Aspecto | Observación | Estado |
|---|---|---|
| Validación de sesión | `auth.getClaims()` (no `getSession()`) en `proxy.ts` | ✅ |
| Deny-by-default rutas protegidas | redirección `/login?next=` sanitizado | ✅ |
| Open redirect | `sanitizeNext()` con fallback seguro | ✅ |
| Cookies | `@supabase/ssr` getAll/setAll (HttpOnly/SameSite/Secure por defecto) | ✅ |
| `resolveAuthenticatedViewer` | org/rol derivados de `profiles` server-side; nunca del cliente | ✅ |
| Recuperación/cambio de contraseña | páginas `/forgot-password`, `/reset-password` | ✅ presentes |
| Tablas propias con `password`/`secret` | **No** existen (sin columnas de credenciales propias) | ✅ |
| signup / email confirmation / MFA / rate-limit / SMTP prod | en panel Supabase | ⏳ MANUAL |
| JWT expiry / refresh / redirect URLs | en panel Supabase | ⏳ MANUAL |
| Leaked-password protection / CAPTCHA | en panel Supabase | ⏳ MANUAL |

`config.toml` local es mínimo (`site_url=localhost:3000`); la configuración real de
Auth de producción vive en el panel Supabase → validación manual (doc `14`).

## 5.4 Matriz de autorización (estado + casos)

Los siguientes casos están cubiertos por el harness `scripts/rls-runtime/run.ts`
(93 checks; **ejecución pendiente** de validación local con Docker — no ejecutada
en esta fase read-only para no levantar servicios/datos):

| Recurso | Rol | Operación | Esperado | Estado |
|---|---|---|---|---|
| tablas org A | anónimo | SELECT | denegado | cubierto (harness) — ⏳ ejecutar |
| recursos org B | usuario A | SELECT/UPDATE/DELETE cruzado | denegado | cubierto — ⏳ ejecutar |
| `indirect_cost_rules` versión propia | usuario A | INSERT/UPDATE | permitido | cubierto — ⏳ ejecutar |
| versión emitida (approved) | usuario A | INSERT AIU | denegado (locked) | cubierto — ⏳ ejecutar |
| `import_boq_into_version` | authenticated | EXECUTE | permitido; anon denegado | cubierto — ⏳ ejecutar |
| read-model (Drizzle) | usuario A | SELECT org B | **depende de filtro app, no de RLS** | **H-01** |

> Nota: el harness valida RLS a nivel de **base** (rol no privilegiado). No valida
> el camino del read-model con conexión estática (H-01), que es lógica de app.

## 5.5 Regresión vs antecedente

- Antecedente: 32/32 PASS, 24 tablas FORCE.
- Actual (estático): **24 tablas FORCE** (vigente), harness ampliado a **93 checks**
  (projects/scopes/estimates/import/AIU/planning). **Sin regresión** aparente en
  cobertura estática; la ejecución empírica queda como validación manual.

## 5.6 Hallazgos

- **H-01** read-model sin RLS efectiva (defensa en profundidad).
- **INFO** FORCE RLS + anon deny + DEFINER con search_path + RPCs solo authenticated.
- **MANUAL** ejecutar harness (93) en Docker local; revisar Auth panel; confirmar
  que el remoto (20/20) refleja exactamente las policies de las migraciones.
