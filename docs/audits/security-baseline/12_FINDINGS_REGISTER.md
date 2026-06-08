# 12 — Registro de Hallazgos

> Severidades: CRITICAL · HIGH · MEDIUM · LOW · INFO · MANUAL_VALIDATION_REQUIRED ·
> NOT_APPLICABLE. Cada hallazgo incluye evidencia verificable. No se inflan
> severidades: se explica el criterio.

## HIGH

| ID | Capa | Severidad | Hallazgo | Evidencia | Escenario de riesgo | Impacto | Recomendación | Esfuerzo | Dependencias | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| H-01 | DB / read-model | HIGH | El read-model (Drizzle) no aplica RLS: conexión estática `DATABASE_URL` sin contexto por usuario (`set role`/`request.jwt.claims`); aislamiento solo por filtro app `organizationId` | `server/read-model/drizzle-repository.ts` (0 coincidencias de set role/set_config/jwt; filtra por `viewer.organizationId`); `lib/db/index.ts` (comenta que owner/service bypassan RLS) | Si `DATABASE_URL` usa rol privilegiado y un filtro app falta/está mal (p. ej. M-02), un tenant lee datos de otro | Fuga horizontal de presupuestos/precios | Conectar read-model como `authenticated` con JWT del usuario, o migrar lecturas al cliente RLS-bound; verificar rol de `DATABASE_URL` | M–L | Rol de `DATABASE_URL` (MANUAL) | Abierto |

*Criterio HIGH:* se pierde RLS como frontera de seguridad en TODO el camino de
lectura; explotabilidad real condicionada al rol de `DATABASE_URL` (validación
manual) y a defectos de filtrado (existe uno concreto: M-02). El camino de
escritura sí es RLS-bound, por eso no es CRITICAL.

> **Actualización P1-A (2026-06-08) — H-01:** `DATABASE_URL_RLS_STATUS =
> BYPASSRLS_ROLE` **confirmado** (`current_user=postgres`, `rolbypassrls=true`).
> Utilidad `withTenantRls` (Alt B) implementada (`apps/web/lib/db/rls.ts`) y
> **probada 8/8** (`scripts/rls-runtime/read-model-isolation.ts`): reproduce la
> fuga cruda y demuestra el fix (RLS aplica, sin cross-org, sin contaminación de
> pool, deny-by-default). **Sin migración.** Pendiente: cableado escalonado en el
> read-model + confirmar/migrar rol de `DATABASE_URL` (docs 17–20). **EN PROGRESO.**
>
> **Actualización P1-A — M-02:** **ASEGURADO** (en rama P1-A, sin merge).
> `/api/exports` deriva la organización server-side (`request.organizationId`);
> eliminado `DEMO_ORGANIZATION_ID` hardcodeado; tests cross-org añadidos. Endpoint
> conservado (sin consumidores hallados; no se retira por integraciones externas
> desconocidas).

## MEDIUM

| ID | Capa | Severidad | Hallazgo | Evidencia | Impacto | Recomendación | Estado |
|---|---|---|---|---|---|---|---|
| M-01 | Frontend/HTTP | MEDIUM | Sin headers de seguridad / CSP a nivel app | `next.config.mjs` sin `headers()`; grep CSP/X-Frame = 0 | Clickjacking; defensa XSS reducida | Añadir CSP estricta, frame-ancestors, nosniff, Referrer/Permissions-Policy, HSTS | Abierto |
| M-02 | Backend/export | MEDIUM | `/api/exports` legacy usa `DEMO_ORGANIZATION_ID` como org del visor | `server/exports/export-service.ts:76` (`organizationId: DEMO_ORGANIZATION_ID`) | Origen de datos de tenant incorrecto / BOLA latente | Gatear/retirar ruta o resolver org desde sesión | Abierto |
| M-03 | DB/perf | MEDIUM | Sin paginación ni límites en listas del read-model | 0 `.limit()`/`.offset()` en drizzle-repo/lib/db | Payloads grandes / DoS al crecer datos | Paginación + límites por consulta | Abierto |
| M-04 | API/auth | MEDIUM | Sin rate limiting a nivel de aplicación (auth, API, exports) | sin middleware de rate-limit; depende de Supabase/Vercel | Fuerza bruta/abuso/coste | Rate limit por IP/usuario + límites por export | Abierto |
| M-05 | CI/CD | MEDIUM | Sin pipeline CI/CD ni gates de supply-chain | sin `.github/workflows` | Regresiones/secretos/deps vulnerables sin barrera | CI con lint/typecheck/test/build + secret-scan + `pnpm audit`; branch protection | Abierto |
| M-06 | Export | MEDIUM | Posible inyección de fórmulas CSV/Excel | `server/estimates/export/xlsx.ts` escribe texto sin neutralizar `= + - @` | Ejecución de fórmula al abrir en Excel | Sanear celdas de texto (prefijo `'`) | Abierto |

## LOW

| ID | Capa | Severidad | Hallazgo | Evidencia | Recomendación | Estado |
|---|---|---|---|---|---|---|
| L-01 | Datos | LOW | Excel real en `private/` local | `private/COT…xlsx` (gitignored; no rastreado) | Mantener ignorado; verificar historial | Abierto |
| L-02 | Repo | LOW | Worktree residual de agente | `.claude/worktrees/agent-acc61fa6…` (gitignored) | Limpiar worktree | Abierto |
| L-03 | Repo | LOW | ~20 ramas históricas `backup/*`,`integration/*` | `git branch -a` | Archivar/limpiar tras consenso | Abierto |
| L-04 | Frontend | LOW | Source maps de cliente en prod | default Next | Evaluar desactivar/restringir | Abierto |
| L-05 | Perf | LOW | Logo base64 (~180 KB) en bundle de export | `logo-asset.ts` | Aceptable; vigilar crecimiento | Abierto |
| L-06 | DB/perf | LOW | Drizzle `.select()` sin proyección de columnas | drizzle-repo | Proyección explícita | Abierto |

## INFO (buenas prácticas verificadas)

| ID | Hallazgo |
|---|---|
| I-01 | Sin secretos hardcodeados (scan patrones = 0 reales) |
| I-02 | `service_role` nunca usado en código; browser solo publishable |
| I-03 | `proxy.ts`: `getClaims()` validado, deny-by-default, `sanitizeNext` anti-open-redirect |
| I-04 | RLS FORCE en 24 tablas; `anon` deny-by-default |
| I-05 | SECURITY DEFINER con `SET search_path = public, pg_temp` |
| I-06 | RPCs `REVOKE` PUBLIC/anon + `GRANT` authenticated; SECURITY INVOKER |
| I-07 | Math financiera con `decimal.js`; subtotales server-side; snapshots inmutables |
| I-08 | `.gitignore` cubre `private/`,`*.xlsx`,`.env*`,`.vercel`; Excel real no versionado |
| I-09 | Export 4E.1: auth + validación de cadena + memoria + filename sanitizado + PDF sin UUID/source_row |
| I-10 | typecheck 0, lint 0, build OK, 712 tests; sin AG Grid Enterprise/AGPL |

## MANUAL_VALIDATION_REQUIRED

| ID | Validación |
|---|---|
| MV-01 | Rol de `DATABASE_URL` en Vercel (privilegiado vs authenticated) — central para H-01 |
| MV-02 | Supabase Auth panel: signup/confirmación/MFA/rate-limit/SMTP/redirect URLs/JWT expiry/leaked-password |
| MV-03 | Que el remoto (20/20) refleje exactamente las policies/grants de las migraciones |
| MV-04 | Ejecutar harness RLS local (`scripts/rls-runtime/run.ts`, 93 checks) en Docker |
| MV-05 | Vercel: separación de entornos, Deployment Protection previews, dominio TLS/HSTS, timeouts/memoria/región |
| MV-06 | GitHub: branch protection/rulesets, secret scanning, push protection, Dependabot |
| MV-07 | `pnpm audit` / `pnpm outdated` (dependencias vulnerables) — requiere red |
| MV-08 | Historial Git profundo en busca de secretos previamente commiteados |

## NOT_APPLICABLE
- AWS (sin uso) · VPS (sin uso) · Supabase Storage (sin uso) · Edge Functions (ninguna).
