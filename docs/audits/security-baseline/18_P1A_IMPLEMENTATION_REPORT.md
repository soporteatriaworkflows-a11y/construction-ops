# 18 — Reporte de Implementación P1-A

> Ejecutado en worktree aislado `construction-ops-security-p1a`, rama
> `fix/security-p1a-read-model-rls-export-legacy` (base `a78839c`). Sin push, sin
> merge, sin deploy, sin tocar Supabase remoto, sin exponer secretos.

## H-01 — Read-model RLS-bound (Alternativa B)

**Entregado (probado):**
- `apps/web/lib/db/rls.ts` — `withTenantRls(claims, fn)` y `buildRlsClaims(viewer)`.
  - Transacción `BEGIN READ ONLY` → `set_config('request.jwt.claims', …, is_local=true)`
    → `SET LOCAL ROLE authenticated` → `fn` → `COMMIT` (ROLLBACK ante error).
  - Deny-by-default: lanza si `claims.sub` está vacío.
  - Sin estado global; sin `service_role`; sin rol con `BYPASSRLS`.
- `scripts/rls-runtime/read-model-isolation.ts` — prueba empírica (local) del bug
  y el fix (8/8 PASS).

**Pendiente (rollout escalonado, `20_…`):** cablear `withTenantRls` en
`DrizzleReadModelRepository`/`DrizzleReadRepository`. No se realizó en P1-A para
evitar regresión en rutas de lectura productivas; el filtro por organización
vigente mantiene la aislación entretanto. **Sin migración requerida.**

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
| `apps/web/lib/db/rls.ts` | nuevo | utilidad `withTenantRls` (H-01) |
| `scripts/rls-runtime/read-model-isolation.ts` | nuevo | prueba de aislamiento (H-01) |
| `apps/web/modules/exports/types.ts` | mod | `organizationId` en `ExportRequest` (M-02) |
| `apps/web/server/exports/export-service.ts` | mod | usa `request.organizationId` (M-02) |
| `apps/web/app/api/exports/route.ts` | mod | deriva org server-side (M-02) |
| `apps/web/tests/unit/exports/export-service.test.ts` | mod | `organizationId` + tests cross-org |
| `docs/audits/security-baseline/17–20_*.md` | nuevo | decisión, reporte, evidencia, checklist |

## Validación (worktree local)

typecheck 0 · lint 0 · **714 tests** (+2) · build OK (`/api/exports` `ƒ`) ·
harness RLS **93/93** · aislamiento read-model **8/8**.

## Riesgos residuales

1. **H-01 no cerrado del todo:** hasta cablear `withTenantRls` en el read-model y
   confirmar el rol de `DATABASE_URL` en producción, RLS no es la barrera de
   lectura; el filtro por organización (ahora sin el bug de org demo) es la
   defensa primaria.
2. **Rol de `DATABASE_URL` en producción:** sigue siendo validación manual
   (MV-01). Si usa `postgres`/bypassrls, el rollout de B es imprescindible.
3. **M-02 en modo db:** el export legacy ahora lee la org correcta, pero bajo el
   read-model que (hasta el rollout) no aplica RLS; el filtro por org cubre el caso.
