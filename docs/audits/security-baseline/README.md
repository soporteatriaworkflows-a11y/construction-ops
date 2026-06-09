# Auditoría de Seguridad — Construction Ops (Baseline, Fase 1 read-only)

> **Tipo:** diagnóstico read-only. **No** se implementaron correcciones, **no** se
> desplegó, **no** se tocó Supabase remoto, **no** se expusieron secretos.
> Generado en la rama aislada `audit/security-baseline-construction-ops`.

> **Actualización P1-A (2026-06-08):** remediación en worktree aislado
> `construction-ops-security-p1a` (rama `fix/security-p1a-read-model-rls-export-legacy`).
> **M-02 ASEGURADO** (export legacy deriva la organización server-side). **H-01
> CABLEADO localmente:** `DATABASE_URL_RLS_STATUS = BYPASSRLS_ROLE` confirmado;
> `withTenantDb` (Alternativa B vía `db.transaction` read-only + `SET LOCAL ROLE
> authenticated`) cableado en los **11 métodos** del read-model (ALS); aislamiento
> **12/12** (mecanismo + repo e2e). **Pendiente:** confirmar rol de `DATABASE_URL`
> en producción (MV-01) + smoke en Preview. Sin migración, sin deploy, sin merge.
> Ver docs **17–20**. typecheck/lint/build (fixture+db) OK · 714 tests · harness 93/93.

- **Repo:** `D:/ICONIC/SOFTWARE PRESUPUESTOS/construction-ops`
- **Rama base auditada:** `main` · **commit** `7af91ea`
- **Rama de trabajo de auditoría:** `audit/security-baseline-construction-ops`
- **Fecha:** 2026-06-06

## Estado general

Proyecto **maduro y, en general, secure-by-default** en sus rutas principales
(auth real con `getClaims()`, RLS FORCE en 24 tablas, sin secretos hardcodeados,
service_role nunca usado en código, math financiera con `decimal.js`). Los riesgos
relevantes son de **defensa en profundidad** (el read-model no se apoya en RLS sino
en filtrado por organización a nivel de app), **hardening** (sin headers/CSP, sin
paginación, sin CI/CD) y **un endpoint legacy** de export con organización demo
hardcodeada.

## Findings por severidad

| Severidad | Cantidad |
|---|---|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 6 |
| LOW | 6 |
| INFO (buenas prácticas) | 10 |
| MANUAL_VALIDATION_REQUIRED | 8 |

Detalle en [`12_FINDINGS_REGISTER.md`](12_FINDINGS_REGISTER.md).

## Riesgos críticos / prioritarios

1. **H-01** — El read-model (Drizzle, `DATABASE_URL` estática) **no aplica RLS**:
   aislamiento multitenant de lectura depende solo del filtrado por
   `organizationId` en código. Riesgo real condicionado al rol de `DATABASE_URL`
   (validación manual).
2. **M-01** — Sin headers de seguridad / CSP a nivel de aplicación.
3. **M-02** — `/api/exports` (legacy) usa `DEMO_ORGANIZATION_ID` hardcodeado como
   organización del visor (origen de datos de tenant incorrecto).
4. **M-03** — Sin paginación ni límites en consultas de listas del read-model.
5. **M-05** — Sin pipeline CI/CD ni controles de supply-chain verificables.

## Estados obligatorios

- `AWS_AUDIT_STATUS = NOT_APPLICABLE` — sin SDK AWS instalado, sin `AWS_*`, sin
  IAM/S3/Lambda/RDS; las únicas menciones son peer-deps opcionales de Drizzle.
- **Supabase / RLS:** RLS habilitado + **FORCE en 24 tablas**; policies por rol;
  `anon` deny-by-default; SECURITY DEFINER con `search_path` fijo; harness
  `scripts/rls-runtime/run.ts` con **93 checks** (no ejecutado en esta fase —
  requiere Docker local; ver validación manual).
- **Docker / puertos:** solo Supabase CLI local (`config.toml`, puertos
  54321–54323 locales). **Sin** Dockerfile/compose propios. `VPS_REVIEW = NOT_APPLICABLE`.
- **Vercel:** en uso (alias `construction-ops-psi.vercel.app`); separación de
  entornos/variables/Deployment Protection → validación manual de panel.
- **GitHub / CI-CD:** repo en GitHub; **sin** `.github/workflows` ni gates
  automáticos → validación manual (branch protection, Dependabot, secret scanning).
- **Storage:** no se usa (sin buckets ni código de Storage).
- **Lint / typecheck / build / tests:** **PASS** (typecheck 0, lint 0, build OK,
  712 tests).

## Índice de entregables

| # | Documento |
|---|---|
| 00 | [Executive Summary](00_EXECUTIVE_SUMMARY.md) |
| 01 | [Repository Baseline](01_REPOSITORY_BASELINE.md) |
| 02 | [Architecture & Data Flow](02_ARCHITECTURE_AND_DATA_FLOW.md) |
| 03 | [Infrastructure Audit](03_INFRASTRUCTURE_AUDIT.md) |
| 04 | [AWS Audit Status](04_AWS_AUDIT_STATUS.md) |
| 05 | [Supabase / RLS / Auth / Storage](05_SUPABASE_RLS_AUTH_STORAGE_AUDIT.md) |
| 06 | [Backend / API](06_BACKEND_API_AUDIT.md) |
| 07 | [Frontend Next.js](07_FRONTEND_NEXTJS_AUDIT.md) |
| 08 | [Docker / Ports / VPS](08_DOCKER_PORTS_VPS_AUDIT.md) |
| 09 | [Vercel / GitHub / CI-CD](09_VERCEL_GITHUB_CICD_AUDIT.md) |
| 10 | [Exports Excel / PDF](10_EXPORTS_EXCEL_PDF_SECURITY_AUDIT.md) |
| 11 | [Performance & Resilience](11_PERFORMANCE_AND_RESILIENCE_AUDIT.md) |
| 12 | [Findings Register](12_FINDINGS_REGISTER.md) |
| 13 | [Remediation Plan](13_REMEDIATION_PLAN.md) |
| 14 | [Manual Validation Checklist](14_MANUAL_VALIDATION_CHECKLIST.md) |
| 15 | [Commands Executed](15_COMMANDS_EXECUTED.md) |
| 16 | [Open Questions](16_OPEN_QUESTIONS.md) |
| 17 | [P1-A — Decisión RLS read-model](17_P1A_READ_MODEL_RLS_DECISION.md) |
| 18 | [P1-A — Reporte de implementación](18_P1A_IMPLEMENTATION_REPORT.md) |
| 19 | [P1-A — Evidencia de pruebas](19_P1A_TEST_EVIDENCE.md) |
| 20 | [P1-A — Checklist de despliegue](20_P1A_DEPLOYMENT_CHECKLIST.md) |

## Recomendación de siguiente paso

Iniciar **Oleada P1 — Seguridad de datos y autorización**, comenzando por validar
manualmente el **rol de `DATABASE_URL`** (H-01) y por **gatear/retirar
`/api/exports` legacy** (M-02). Antes, ejecutar la **validación manual** del panel
Supabase/Vercel/GitHub (Fase 14 docs 14). No implementar correcciones hasta
aprobar el plan.
