# 19 — Evidencia de Pruebas P1-A

> Entorno: worktree local `construction-ops-security-p1a`, Supabase local
> (`127.0.0.1:54322`). Diferenciación: **medido** (ejecutado), inferido, pendiente.

## Suites (antes / después)

| Suite | Antes (base `a78839c`) | Después (P1-A) | Resultado |
|---|---|---|---|
| typecheck | PASS | PASS | medido |
| lint | PASS | PASS | medido |
| build | PASS | PASS (`/api/exports` `ƒ`) | medido |
| vitest | 712 | **714** (+2 cross-org M-02) | medido |
| RLS harness (`run.ts`) | 93/93 | **93/93** | medido |
| read-model isolation (`read-model-isolation.ts`) | n/a | **8/8** | medido (nuevo) |

## Matriz de aislamiento del read-model (medida)

Resultado de `scripts/rls-runtime/read-model-isolation.ts` (8/8 PASS):

| Caso | Resultado esperado | Observado |
|---|---|---|
| Lectura cruda (rol `postgres`, sin wrapper) | Ve A y B (RLS bypassada) — **bug H-01** | ✓ reproducido |
| `withTenantRls(A)` lectura sin filtro | Solo A | ✓ solo A |
| `withTenantRls(A)` ¿ve B? | No | ✓ 0 filas de B |
| `withTenantRls(B)` ¿ve A? | No | ✓ 0 filas de A (simétrico) |
| Reutilización de conexión tras tx RLS | No filtra contexto (vuelve a estado base) | ✓ sin contaminación |
| `withTenantRls({sub:''})` | Deny (lanza) | ✓ lanza |
| `withTenantRls({sub: usuario sin perfil})` | 0 filas (`current_org()` NULL) | ✓ 0 filas |

## Matriz M-02 (export legacy, medida vía vitest)

| Caso | Esperado | Observado |
|---|---|---|
| `generate({organizationId: org_ajena, projectId: demo})` | Rechazado (sin fuga de datos demo) | ✓ rejects |
| `generate({organizationId: demo, projectId: demo})` | Exporta | ✓ sizeBytes > 0 |
| Privacidad cliente (xlsx/csv sin tokens internos) | Sin tokens 🔒 | ✓ (tests previos) |

## No degradado (medido)

Cálculos / decimal.js / presupuestos / capítulos / ítems / totales / export
Excel / export PDF / branding / rutas existentes / build: **sin regresión**
(714 tests verdes, build OK).

## Rendimiento

- `withTenantRls` añade 1 transacción (BEGIN/SET/COMMIT) por unidad de lectura
  sobre el MISMO pool (sin red adicional). Overhead **inferido** bajo; **medición
  formal pendiente** tras el rollout en el read-model.
