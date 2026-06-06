# 09 — Vercel, GitHub y CI/CD

## Vercel

- **En uso real:** `.vercel/project.json` vincula `construction-ops`
  (org `team_…`); producción aliased a `construction-ops-psi.vercel.app`.
- **`.vercel` está en `.gitignore`** (no se versiona el vínculo). ✅
- Sin `vercel.json` en el repo → configuración por panel/CLI.

### Validación manual (panel) — doc `14`
Separación development/preview/production; variables por entorno
(`SUPABASE_SERVICE_ROLE_KEY` solo server, `NEXT_PUBLIC_*` públicas, `DATABASE_URL`
rol — **crítico para H-01**); Deployment Protection en previews; logs; dominios;
TLS/HSTS; región; timeouts/memoria de funciones; deployments antiguos; acceso de
equipo; integración GitHub; ramas que generan preview.

## GitHub

- Remoto: `github.com/soporteatriaworkflows-a11y/construction-ops`.
- **Sin `.github/workflows`** → **no hay CI/CD ni gates automáticos** (lint,
  typecheck, test, build, `pnpm audit`, secret-scan) en PR/push.
- Despliegue: integración Git de Vercel + despliegues CLI manuales por el
  orquestador.

### Validación manual (panel) — doc `14`
Branch protection / rulesets sobre `main` (PR obligatorio, reviews, status checks);
Secret scanning + Push protection; Dependabot alerts/updates; Code scanning;
permisos de Actions (no hay Actions hoy); commits con secretos históricos; archivos
grandes/sensibles versionados.

## Supply chain

- `pnpm-lock.yaml` presente (instalación determinista). ✅
- Dependencias clave (todas con licencias permisivas según `docs/LICENSING.md`):
  Next 16, React 19, `@supabase/*`, drizzle, `postgres`, `exceljs`,
  `@react-pdf/renderer`, recharts, frappe-gantt, AG Grid **Community** (no
  enterprise).
- **Pendiente:** `pnpm audit` / `pnpm outdated` (requiere red) → registrar como
  validación manual (doc `14`/`15`).

## Hallazgos
- **M-05** — Sin CI/CD ni controles de supply-chain verificables en repo.
- **MANUAL** — Vercel (variables/protección/dominio) y GitHub (branch protection/
  Dependabot/secret scanning); `pnpm audit`.
- **INFO** — `.vercel` ignorado; lockfile presente; sin AG Grid Enterprise/AGPL.
