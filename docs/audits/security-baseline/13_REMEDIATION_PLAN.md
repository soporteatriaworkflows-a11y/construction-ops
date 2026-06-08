# 13 — Plan de Remediación (NO implementar todavía)

> Dividido en oleadas P0–P3. Cada acción requiere rama aislada, validación y
> rollback definido.

> **Progreso P1-A (2026-06-08, rama `fix/security-p1a-...`, sin merge):**
> - **M-02 (export legacy):** ✅ ASEGURADO (org server-side + tests cross-org).
> - **H-01 (read-model RLS):** 🟡 EN PROGRESO — `withTenantRls` (Alt B) implementada
>   y probada 8/8; cableado escalonado en el read-model + confirmación del rol de
>   `DATABASE_URL` en prod = pendiente (docs 17–20).
> - Resto de P1/P2/P3: sin iniciar.

## OLEADA P0 — Contención inmediata

No se identificó ningún hallazgo CRITICAL que exija contención inmediata (revocar/
rotar/aislar). **P0 vacío** salvo que la validación manual MV-01/MV-08 revele un
`DATABASE_URL` privilegiado expuesto o un secreto en historial, en cuyo caso:

| Acción | Finding | Afecta | Riesgo impl. | Orden | Validación | Rollback | Estim. |
|---|---|---|---|---|---|---|---|
| Si MV-08 halla secreto en historial: rotar credencial y purgar | MV-08 | Supabase/Vercel | Medio | 1 | confirmar nueva clave activa | mantener clave previa hasta confirmar | 0.5 d |
| Si MV-01 = rol privilegiado: restringir acceso del read-model | H-01 | DB | Alto | 2 | smoke lectura | revertir a conexión previa | 1 d |

## OLEADA P1 — Seguridad de datos y autorización

| Acción | Finding | Afecta | Riesgo impl. | Orden | Validación | Rollback | Estim. |
|---|---|---|---|---|---|---|---|
| Conectar read-model como `authenticated` con JWT del usuario (o migrar lecturas al cliente RLS-bound), de modo que RLS sea la frontera real | H-01 | `lib/db`, `server/read-model/*` | Alto | 1 | harness + smoke por org; pruebas cross-org | feature flag / revertir conexión | 2–3 d |
| Gatear o retirar `/api/exports` legacy; si se mantiene, resolver org desde sesión | M-02 | `app/api/exports`, `server/exports` | Bajo | 2 | test cross-org; 404 sin sesión | reactivar ruta | 0.5 d |
| Sanear celdas de texto en exports (anti fórmula CSV/Excel) | M-06 | `server/estimates/export/xlsx.ts` | Bajo | 3 | test de celdas con `=`/`+`/`-`/`@` | revertir saneo | 0.5 d |
| Confirmar/migrar Auth panel (MFA admin, confirmación email, rate-limit, leaked-password) | MV-02 | Supabase panel | Bajo | 4 | login/recuperación smoke | revertir settings | 0.5 d |

## OLEADA P2 — Hardening de aplicación e infraestructura

| Acción | Finding | Afecta | Riesgo impl. | Orden | Validación | Rollback | Estim. |
|---|---|---|---|---|---|---|---|
| Añadir headers de seguridad + CSP estricta (nonce/strict-dynamic), frame-ancestors, nosniff, Referrer/Permissions-Policy, HSTS | M-01 | `next.config.mjs` | Medio (CSP puede romper assets) | 1 | smoke UI + report-only previo | quitar headers | 1–2 d |
| Rate limiting (auth, API, export) por IP/usuario | M-04 | proxy/route handlers | Medio | 2 | pruebas de límite | desactivar limitador | 1 d |
| CI/CD: workflow con lint+typecheck+test+build+secret-scan+`pnpm audit`; branch protection en `main`; Dependabot | M-05 | `.github/workflows`, GitHub panel | Bajo | 3 | PR de prueba | deshabilitar workflow | 1 d |
| Límites de payload/tamaño por export y por request | M-04/M-03 | export/actions | Bajo | 4 | pruebas de límite | revertir | 0.5 d |
| `import 'server-only'` en módulos server sensibles; evaluar source maps | L-04 | `server/**`, `next.config` | Bajo | 5 | build | revertir | 0.5 d |

## OLEADA P3 — Rendimiento, observabilidad y mantenimiento

| Acción | Finding | Afecta | Riesgo impl. | Orden | Validación | Rollback | Estim. |
|---|---|---|---|---|---|---|---|
| Paginación + límites + proyección de columnas en read-model | M-03/L-06/P-1/P-2 | `server/read-model/*` | Medio | 1 | snapshots de UI | revertir consultas | 1–2 d |
| Resolver N+1 del payload export (join/batch de ítems) | P-4 | `export/payload` o repo | Bajo | 2 | igualdad de resultados | revertir | 0.5 d |
| Observabilidad: logging estructurado + alertas + métricas de export | P-6 | app | Bajo | 3 | ver eventos | revertir | 1 d |
| Backups/DR runbook: definir RPO/RTO, prueba de restauración, rollback de deploy | Fase 12 | docs/infra | Bajo | 4 | simulacro | n/a | 1 d |
| Higiene de repo: limpiar worktree residual y ramas históricas | L-02/L-03 | git | Bajo | 5 | `git branch` | recrear desde reflog | 0.25 d |

## Regla de ejecución
Cada oleada en rama aislada (`fix/audit-pX-*`), con validación completa
(typecheck/lint/test/build + harness cuando aplique) antes de merge `--no-ff` y
deploy controlado. **No** tocar Supabase remoto sin aprobación explícita.
