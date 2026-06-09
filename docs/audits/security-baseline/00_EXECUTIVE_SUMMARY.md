# 00 — Resumen Ejecutivo

## Alcance

Auditoría integral read-only de Construction Ops (Next.js 16 + Supabase/PostgreSQL
+ Drizzle + Vercel) cubriendo repositorio, arquitectura, infraestructura, Supabase
(RLS/Auth/Storage), backend/API, frontend, exports Excel/PDF, Docker/puertos,
Vercel/GitHub/CI-CD, rendimiento y resiliencia. Marco: OWASP ASVS / API Top 10 /
Top 10, mínimo privilegio, defensa en profundidad, secure-by-default.

## Veredicto

El sistema tiene una **base de seguridad sólida** en sus caminos de escritura y
autenticación, pero presenta **una brecha arquitectónica de defensa en profundidad
en lectura** y varios **hardenings pendientes**. No se hallaron secretos
comprometidos ni datos sensibles públicos ni bypass de RLS explotable con la
configuración observada.

## Lo que está bien (evidencia)

- **Sin secretos hardcodeados** en el código (scan de patrones JWT/`sk_`/`AKIA`/
  llaves privadas/tokens: 0 reales; único match = base64 del logo).
- **`service_role` nunca usado** en código de aplicación (solo en comentarios de
  prohibición, guards y tests). Cliente browser usa solo clave publishable.
- **Auth runtime** (`proxy.ts`) valida con `auth.getClaims()` (no `getSession()`),
  deny-by-default, `sanitizeNext` anti open-redirect.
- **RLS FORCE en 24 tablas**; `anon` sin policies (deny-by-default); RPCs `REVOKE`
  de PUBLIC/anon y `GRANT` solo a `authenticated`; SECURITY DEFINER con
  `SET search_path = public, pg_temp`.
- **Math financiera** con `decimal.js` (sin float); subtotales recomputados
  server-side; snapshots inmutables (oleadas previas).
- **`.gitignore`** cubre `private/`, `*.xlsx`, `.env*`, `.vercel`; el Excel real
  vive en `private/` y **no está versionado**.
- **typecheck 0, lint 0, build OK, 712 tests** en verde.

## Riesgos principales (top 5)

1. **H-01 — Read-model sin RLS efectiva.** El repositorio Drizzle del read-model
   (dashboard, planning, catálogo, APU, cantidades, lista de estimates) consulta
   con una conexión **estática `DATABASE_URL`** y **no fija contexto RLS**
   (`set role` / `request.jwt.claims`): la aislación entre organizaciones depende
   exclusivamente del filtro `WHERE organization_id = viewer.organizationId` en
   código. Si `DATABASE_URL` usa un rol privilegiado (owner/service), RLS queda
   **bypassada** para todas las lecturas. (El camino de **escritura** sí es
   RLS-bound vía `@supabase/ssr`.)
2. **M-02 — `/api/exports` legacy con organización demo hardcodeada.**
   `export-service.ts` arma el visor con `DEMO_ORGANIZATION_ID` (TODO sin
   resolver), ignorando la organización autenticada → origen de datos de tenant
   incorrecto. Mitigado (la org demo no está sembrada en prod; superado por
   `/api/estimates/export`), pero debe gatearse/retirarse.
3. **M-01 — Sin headers de seguridad / CSP** a nivel de aplicación (Clickjacking,
   anti-MIME, Referrer/Permissions Policy, CSP ausentes).
4. **M-03 — Sin paginación ni límites** en las consultas de lista del read-model
   (riesgo de payloads grandes / DoS a medida que crecen los datos).
5. **M-05 — Sin CI/CD ni controles de supply-chain verificables** (no hay
   `.github/workflows`; sin gates de lint/test/secret-scan/`pnpm audit` en PR;
   branch protection y Dependabot por validar en panel).

## Secretos comprometidos

**No se detectaron secretos comprometidos** en el árbol versionado ni en el código.
Pendiente: revisión del historial Git profundo y de variables del panel Vercel/
Supabase (validación manual, sin exponer valores).

## Estados obligatorios

- `AWS_AUDIT_STATUS = NOT_APPLICABLE`
- RLS: **vigente** (24 tablas FORCE); cobertura del harness creció de 32 → **93
  checks** (ejecución pendiente de validación manual con Docker local).
- Docker/puertos: solo Supabase CLI local; `VPS_REVIEW = NOT_APPLICABLE`.
- Vercel: en uso (validación de panel pendiente). GitHub/CI-CD: sin workflows.
- Storage: no usado.
- Lint/typecheck/build/tests: **PASS**.

## Recomendación

Aprobar y ejecutar **P1 (datos y autorización)** tras la **validación manual** del
panel. Primer paso concreto: confirmar el rol de `DATABASE_URL` en producción
(H-01) y decidir la conexión RLS-bound del read-model; gatear `/api/exports` (M-02).
