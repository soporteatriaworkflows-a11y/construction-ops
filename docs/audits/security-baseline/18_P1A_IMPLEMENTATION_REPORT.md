# 18 — Reporte de Implementación P1-A

> Ejecutado en worktree aislado `construction-ops-security-p1a`, rama
> `fix/security-p1a-read-model-rls-export-legacy` (base `a78839c`). Sin push, sin
> merge, sin deploy, sin tocar Supabase remoto, sin exponer secretos.

## H-01 — Read-model RLS-bound (Alternativa B)

**Entregado y CABLEADO (probado):**
- `apps/web/lib/db/rls.ts`:
  - `withTenantRls(claims, fn)` — transacción raw (`reserve()` + `BEGIN READ ONLY`
    + `set_config('request.jwt.claims',…,true)` + `SET LOCAL ROLE authenticated`).
    Usado por la prueba de aislamiento.
  - `withTenantDb(claims, fn)` — **vía idiomática Drizzle**: `db.transaction(fn,
    { accessMode: 'read only' })` + `tx.execute(set_config …)` + `SET LOCAL ROLE
    authenticated`, entregando la transacción Drizzle a `fn`. (Construir Drizzle
    sobre `reserve()` fallaba con `reading 'parsers'`; `db.transaction` lo evita.)
  - `buildRlsClaims({ userId?|profileId?, organizationId, role? })` — claims
    server-side; deny si no hay `sub` NI `organization_id`.
- **`apps/web/server/read-model/drizzle-repository.ts` — CABLEADO completo:** los
  **11 métodos** tenant-scoped envuelven su cuerpo en `read(viewer, fn)`, que abre
  `withTenantDb(buildRlsClaims(viewer), …)` y expone un `DrizzleReadRepository`
  RLS-scoped vía `AsyncLocalStorage` (consumido por `this.repo` y los 2 helpers
  privados, sin tocar los 39 call-sites). Filtros por `organizationId` conservados.
  En pruebas unitarias con repo inyectado, `read()` usa ese repo (sin DB/tx).
- `scripts/rls-runtime/read-model-isolation.ts` — prueba empírica (local):
  **12/12 PASS** (mecanismo + repo end-to-end).

**Métodos cableados (11):** `listProjects`, `getProjectOverview`, `listEstimates`,
`getEstimateDetail`, `listApus`, `listQuantities`, `listCatalogResources`,
`getDashboardSummary`, `getSchedule`, `listProgressEntries`,
`listResourceAssignments`. **Helpers** (`loadComputationInput`,
`resolveCurrentVersionInput`) heredan el repo RLS-scoped vía ALS.

**Sin migración requerida** (el rol `postgres` es miembro de `authenticated`;
`SET LOCAL ROLE` hace que RLS aplique aunque el login tenga `bypassrls`).

## M-02 — `/api/exports` legacy asegurado (Caso B)

Decisión: **ASEGURADO** (no retirado). Aunque no se hallaron consumidores en
frontend/components, se conserva el endpoint para no romper integraciones externas
desconocidas y se elimina el defecto de seguridad.

**Cambios:**
- `apps/web/modules/exports/types.ts` — `ExportRequest.organizationId: Uuid`
  (obligatorio; derivado server-side, nunca del navegador).
- `apps/web/server/exports/export-service.ts` — el `ViewerContext` usa
  `request.organizationId` en vez de `DEMO_ORGANIZATION_ID` hardcodeado.
- `apps/web/app/api/exports/route.ts` — deriva `organizationId`: en `supabase` de
  la sesión autenticada (`viewer.organizationId`); en `demo` la org demo explícita.
- Tests: `apps/web/tests/unit/exports/export-service.test.ts` — todos los
  `generate()` pasan `organizationId`; nuevo bloque de aislamiento cross-org
  (org ajena ⇒ rechazado; misma org ⇒ exporta).

## Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `apps/web/lib/db/rls.ts` | nuevo/mod | `withTenantRls` + `withTenantDb` + `buildRlsClaims` (H-01) |
| `apps/web/server/read-model/drizzle-repository.ts` | mod | **cableado RLS de los 11 métodos** (ALS + `read()`) (H-01) |
| `scripts/rls-runtime/read-model-isolation.ts` | nuevo | prueba de aislamiento + repo e2e (H-01) |
| `apps/web/modules/exports/types.ts` | mod | `organizationId` en `ExportRequest` (M-02) |
| `apps/web/server/exports/export-service.ts` | mod | usa `request.organizationId` (M-02) |
| `apps/web/app/api/exports/route.ts` | mod | deriva org server-side (M-02) |
| `apps/web/tests/unit/exports/export-service.test.ts` | mod | `organizationId` + tests cross-org |
| `docs/audits/security-baseline/17–20_*.md` | nuevo/mod | decisión, reporte, evidencia, checklist |

## Validación (worktree local)

typecheck 0 · lint 0 · **714 tests** · build fixture + db OK · harness RLS
**93/93** · aislamiento read-model **12/12** (mecanismo + repo end-to-end).

## Riesgos residuales

1. **H-01 — RLS cableada localmente; falta confirmar producción:** el read-model
   ya aplica RLS vía `withTenantDb`. Falta (a) confirmar el rol de `DATABASE_URL`
   en producción (MV-01) y, si es `bypassrls`, decidir si se migra a un rol sin
   bypass (opcional: el `SET LOCAL ROLE authenticated` ya fuerza RLS aunque el
   login tenga bypass); (b) smoke en Preview. El filtro por `organizationId` sigue
   como segunda barrera.
2. **Rol de `DATABASE_URL` en producción:** validación manual MV-01 (no accesible
   en este entorno). Recomendado un rol sin `bypassrls`; con el cableado actual no
   es estrictamente necesario porque `SET LOCAL ROLE authenticated` ya fuerza RLS.
3. **Transacción por lectura:** cada método del read-model abre ahora una
   transacción READ ONLY. Requiere que el pooler de `DATABASE_URL` soporte
   transacciones (Supabase transaction pooler las soporta). Validar en Preview.
4. **M-02 export legacy:** ahora lee la org correcta del visor; bajo el read-model
   ya RLS-bound. El módulo legacy se conserva (asegurado), no retirado.
