# 17 — Decisión: vinculación RLS del read-model (P1-A / H-01)

## Problema (confirmado con evidencia)

- `DATABASE_URL_RLS_STATUS = BYPASSRLS_ROLE`. Introspección read-only de la
  conexión del read-model: `current_user = postgres`, `rolsuper = false`,
  **`rolbypassrls = true`**, `active_role = none`, `request.jwt.claims` ausente.
- Con ese rol, **RLS no se aplica** a las lecturas del read-model (Drizzle). La
  aislación entre organizaciones dependía únicamente del filtro aplicativo
  `WHERE organization_id = viewer.organizationId`.
- Reproducido empíricamente: una lectura cruda sin filtro ve proyectos de TODAS
  las organizaciones (ver `19_P1A_TEST_EVIDENCE.md`).

## Alternativas evaluadas

| Criterio | A — Supabase Data API (JWT usuario) | B — Drizzle en tx request-scoped con RLS | C — RPC/SQL segura por lectura |
|---|---|---|---|
| Seguridad | Alta (RLS por rol authenticated) | **Alta (RLS por rol authenticated)** | Alta pero parcial (solo lecturas migradas) |
| Compatibilidad con arquitectura actual | Media (reescribir queries a PostgREST) | **Alta (conserva Drizzle y queries)** | Baja (reescribir lecturas como funciones) |
| Complejidad | Media-alta | **Media** | Alta |
| Cambios requeridos | Reemplazar el repo Drizzle por supabase-js | **Envolver lecturas en `withTenantRls`** | Crear N funciones SECURITY INVOKER + grants |
| Riesgo de regresión | Alto (cambia toda la capa de datos) | **Medio (wrapper aditivo, rollout por método)** | Alto (duplica lógica de lectura) |
| Rendimiento | 1 request HTTP por lectura (overhead red) | **1 tx por unidad de lectura (mismo pool)** | Óptimo por función, pero rígido |
| Facilidad de pruebas | Media | **Alta (probado 8/8 en local)** | Media |
| Recomendación | No | **SÍ** | Solo para lecturas muy sensibles puntuales |

## Decisión: **Alternativa B**

Ejecutar cada lectura tenant-scoped dentro de una **transacción request-scoped**
que asume el rol `authenticated` (sin `bypassrls`) y fija `request.jwt.claims`
(transaccional). Razones:

1. Conserva el read-model Drizzle y todas sus consultas (menor regresión).
2. RLS pasa a ser una **barrera real** además del filtro por organización
   (defensa en profundidad), aunque la conexión de login tenga `bypassrls`
   (tras `SET LOCAL ROLE authenticated`, el rol ACTUAL no bypassa RLS).
3. `SET LOCAL` + `set_config(..., is_local=true)` son **transaccionales** ⇒ sin
   estado global reutilizable por el pool (sin contaminación entre solicitudes).
4. **No requiere migración**: el rol `postgres` es miembro de `authenticated`;
   `authenticated` ya tiene los grants y policies (probado por el harness 93/93).
5. La identidad/organización provienen SIEMPRE de la sesión verificada
   server-side; nunca del navegador.

## Reglas de implementación aplicadas

- Filtros explícitos por organización se **conservan** (defensa adicional).
- Sin `service_role`, sin rol `BYPASSRLS` nuevo, sin superuser.
- Sin `SET ROLE`/`set_config` global; solo transaccional (`SET LOCAL`, `is_local=true`).
- Identidad derivada server-side; `organizationId` del navegador nunca es autoridad.

## Estado de implementación en P1-A

- **Entregado y probado:** utilidad `apps/web/lib/db/rls.ts` (`withTenantRls`,
  `buildRlsClaims`) + prueba de aislamiento `scripts/rls-runtime/read-model-isolation.ts`
  (8/8 PASS en local) que demuestra el bug y el fix.
- **Pendiente (rollout escalonado, ver `20_P1A_DEPLOYMENT_CHECKLIST.md`):** cablear
  `withTenantRls` en los métodos del `DrizzleReadModelRepository` /
  `DrizzleReadRepository`. Se hace por método con validación, NO en un único
  cambio masivo, para no arriesgar las rutas de lectura productivas
  (dashboard/planning/presupuesto). El filtro por organización vigente mantiene la
  aislación mientras se completa el rollout.
