# 02 — Arquitectura y Flujo de Datos

## Inventario de tecnologías (detectadas por evidencia)

| Capa | Tecnología | Evidencia |
|---|---|---|
| Framework | Next.js 16 (App Router, React 19, Turbopack) | `apps/web`, `proxy.ts`, build `ƒ/○` |
| Lenguaje | TypeScript estricto | `tsconfig.json`, `tsc --noEmit` |
| Monorepo | pnpm workspaces (`pnpm@11.5.0`) | `pnpm-workspace.yaml`, `package.json` |
| DB | PostgreSQL (Supabase) | `supabase/migrations/**`, `config.toml` |
| ORM/driver | Drizzle ORM + `postgres` (postgres.js) | `lib/db/index.ts`, `drizzle.config.ts` |
| Auth | Supabase Auth + `@supabase/ssr` | `lib/supabase/*`, `proxy.ts` |
| UI | shadcn/ui + Tailwind, AG Grid Community, Recharts, Frappe Gantt | `apps/web`, deps |
| Exports | ExcelJS, `@react-pdf/renderer` | `server/estimates/export/**`, `modules/exports/**` |
| Hosting | Vercel | `.vercel/`, despliegues productivos |
| Repo/CI | GitHub (sin Actions) | `git remote`, ausencia de `.github/workflows` |
| Datos demo | Fixture golden-master sanitizado | `scripts/fixtures/*.json` |

**No detectado / no usado:** AWS, Cloudflare, n8n, Airtable, VPS, Docker propio,
Supabase Storage, Edge Functions (`supabase/functions/.gitkeep` vacío).

## Entornos

| Entorno | Estado | Notas |
|---|---|---|
| Local dev | Sí | Supabase CLI (Docker) puertos 54321–54323; `READ_MODEL_SOURCE=fixture` o `db` |
| Preview (Vercel) | Sí | Detrás de SSO del equipo (401 sin sesión de equipo) |
| Producción (Vercel) | Sí | `construction-ops-psi.vercel.app`, `APP_AUTH_MODE=supabase`, `READ_MODEL_SOURCE=db` |
| Staging | **No** detectado | (sin entorno staging dedicado) |

## Flujo de datos (Mermaid)

```mermaid
flowchart TD
  U[Usuario / navegador] -->|HTTPS| V[Vercel Edge/Functions - Next.js 16]
  V --> PX[proxy.ts - guard auth getClaims, deny-by-default]
  PX -->|rutas protegidas| SC[Server Components / Server Actions]
  SC --> RV[resolveViewer: demo | supabase]
  RV -->|supabase| AUTH[(Supabase Auth - sesión/cookies SSR)]
  SC -->|ESCRITURA RLS-bound| SB[supabase-js server client - JWT usuario - rol authenticated]
  SB -->|RLS FORCE| PG[(PostgreSQL - 24 tablas RLS)]
  SC -->|LECTURA read-model| DZ[Drizzle repo - conexion estatica DATABASE_URL]
  DZ -->|filtro app por organizationId - SIN contexto RLS| PG
  SC -->|export| EXP[server/estimates/export - ExcelJS / react-pdf en memoria]
  EXP --> U
  V -.->|legacy| LEXP[/api/exports - read-model con DEMO org hardcodeada/]
  subgraph Datos demo
    FX[fixture golden-master sanitizado] --- DZ
  end
```

## Superficies de ataque

| Superficie | Componente | Autenticación | Notas |
|---|---|---|---|
| Páginas `(dashboard)` | Server Components `ƒ` | proxy + resolveViewer | request-time |
| Server Actions | projects/scopes/estimates/aiu/import | viewer server-side | validan modo + org |
| `GET /api/estimates/export` | route handler | resolveViewer (401 sin sesión) | valida cadena + cross-org 404 |
| `GET /api/exports` (legacy) | route handler | auth + anti-escalación | **org demo hardcodeada** (M-02) |
| `/auth/callback`, `/logout` | route handlers | OAuth/PKCE, logout | sin service_role |
| RPCs Postgres | `create_estimate_with_initial_version`, `import_boq_into_version` | SECURITY INVOKER, GRANT authenticated | RLS aplica |
| Páginas públicas | `/login`, `/forgot-password`, `/reset-password`, `/` | n/a | estáticas `○` |

## Clasificación de datos tratados

| Dato | Nivel | Ubicación |
|---|---|---|
| Credenciales de sesión / cookies | **Crítico** | Supabase Auth (HttpOnly via ssr) |
| `service_role` / `DATABASE_URL` | **Crítico** | Variables de entorno (no en repo) |
| Correos / perfiles / roles | **Confidencial** | `profiles` (RLS) |
| Precios de compra, descuentos, márgenes internos | **Confidencial** | `supplier_products`, `pricing_rules`, AIU (RLS; excluidos de exports cliente) |
| Presupuestos, capítulos, ítems, cantidades, AIU, totales | **Confidencial** | `estimates`/`chapters`/`boq_items`/`indirect_cost_rules` (RLS) |
| Trazabilidad de normalización (source_code/row) | **Interno** | hoja TRAZABILIDAD (Excel) |
| Exports generados | **Confidencial** | en memoria; no persistidos |
| Datos demo (fixture) | **Público/Interno** | sanitizado |

## Integraciones externas

- **Supabase** (Auth + PostgreSQL). 
- **Vercel** (hosting/CDN).
- **GitHub** (repositorio).
- (Adaptador Homecenter CSV/Excel existe en código pero **sin** integración de red
  externa activa; import por archivo.)

## Componentes no comprobables en esta fase (requieren panel)

- Configuración de Auth en Supabase (signup/confirmación/MFA/rate-limit/SMTP).
- Rol exacto de `DATABASE_URL` en Vercel (central para H-01).
- Variables, Deployment Protection y dominios en Vercel.
- Branch protection / Dependabot / secret scanning en GitHub.
