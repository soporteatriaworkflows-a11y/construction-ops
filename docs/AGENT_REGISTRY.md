# Agent Registry — Construction Ops

Matriz maestra de agentes especializados. Fuente única de verdad para
modelo, esfuerzo, ownership, oleadas y criterios de finalización.

Los archivos `.md` de cada agente viven en `.claude/agents/`.

---

## Matriz general

| # | Agente | Modelo | Esfuerzo | maxTurns | Color | Aislamiento | Oleada |
|---|--------|--------|----------|----------|-------|-------------|--------|
| 1 | agent-orchestrator | opus   | xhigh | 70 | purple | sin worktree | 0 |
| 2 | agent-db-rls       | opus   | high  | 50 | blue   | worktree | 1 |
| 3 | agent-excel-mapper | opus   | xhigh | 60 | cyan   | worktree | 1 |
| 4 | agent-frontend-boq | sonnet | high  | 60 | green  | worktree | 1 |
| 5 | agent-cost-domain  | opus   | xhigh | 70 | red    | worktree | 2 |
| 6 | agent-pricing      | opus   | high  | 50 | orange | worktree | 2 |
| 7 | agent-homecenter   | sonnet | high  | 45 | yellow | worktree | 2 |
| 8 | agent-dashboard    | sonnet | high  | 45 | pink   | worktree | 3 |
| 9 | agent-planning     | opus   | high  | 55 | cyan   | worktree | 3 |
| 10 | agent-exports     | sonnet | high  | 50 | orange | worktree | 3 |
| 11 | agent-qa          | opus   | xhigh | 70 | red    | worktree | 4 |

---

## Ownership de archivos

### agent-orchestrator (puede invocar a todos)
- `package.json`, `pnpm-lock.yaml`, `package-lock.json`
- `.env.example`, `README.md`, `CLAUDE.md`
- `docs/PROJECT_MASTER.md`, `docs/API_CONTRACTS.md`, `docs/DATABASE_SCHEMA.md`
- `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md`, `docs/INTEGRATION_REQUESTS.md`
- `docs/AGENT_REGISTRY.md`
- `apps/web/app/layout.tsx`, `apps/web/middleware.ts`
- `supabase/config.toml`

### agent-db-rls
- `supabase/migrations/`, `supabase/policies/`, `supabase/seeds/`
- `apps/web/lib/db/schema.ts`, `apps/web/lib/db/index.ts`
- `drizzle.config.ts`

### agent-excel-mapper
- `scripts/excel-import/`, `scripts/golden-master/`, `scripts/fixtures/`
- `docs/EXCEL_MAPPING.md`

### agent-frontend-boq
- `apps/web/app/(auth)/`, `apps/web/app/(dashboard)/` (excepto layout y middleware)
- `apps/web/components/shared/`, `apps/web/components/ui/`
- `apps/web/lib/utils/`
- `apps/web/tests/unit/components/`
- `tailwind.config.ts`, `postcss.config.js`, `next.config.js`

### agent-cost-domain
- `apps/web/modules/apu/`, `apps/web/modules/boq/`, `apps/web/modules/estimates/`
- `apps/web/tests/unit/cost-domain/`

### agent-pricing
- `apps/web/modules/suppliers/`
- `apps/web/modules/pricing/` (excepto `adapters/`)
- `apps/web/tests/unit/pricing/`

### agent-homecenter
- `scripts/catalog-sync/`
- `apps/web/modules/pricing/adapters/`

### agent-dashboard
- `apps/web/modules/dashboard/`
- `apps/web/app/(dashboard)/dashboard/`
- `apps/web/tests/unit/dashboard/`

### agent-planning
- `apps/web/modules/planning/`
- `apps/web/app/(dashboard)/planning/`
- `apps/web/tests/unit/planning/`

### agent-exports
- `apps/web/modules/exports/`
- `apps/web/server/exports/`
- `apps/web/app/api/exports/`
- `apps/web/tests/unit/exports/`
- `scripts/export-fixtures/`

### agent-qa
- `apps/web/tests/regression/`
- `apps/web/tests/qa/`
- `docs/QA_REPORT.md`

---

## Responsabilidad principal

| Agente | Responsabilidad |
|--------|----------------|
| orchestrator | Auditoría, contratos, merges, licencias, gobierno de oleadas |
| db-rls | Esquema PostgreSQL, migraciones, RLS, seeds, integridad |
| excel-mapper | Ingeniería inversa del Excel, fixtures, importador, regresión |
| frontend-boq | UI del flujo de presupuesto (auth, dashboard, APU, BOQ, catálogo) |
| cost-domain | Motor financiero puro: APU, BOQ, AIU, snapshots, versiones |
| pricing | Capas de precio, descuentos internos, ahorros, aprobación humana |
| homecenter | Adaptador genérico de proveedores + implementación CSV Homecenter |
| dashboard | KPIs gerenciales y de obra, agregaciones, visualizaciones |
| planning | Cronograma, dependencias, ruta crítica, avance, Frappe Gantt |
| exports | Excel y PDF con perfiles de privacidad por rol |
| qa | Regresión financiera, privacidad, RLS, inmutabilidad, licencias |

---

## Dependencias entre agentes

```
orchestrator ──┬─► db-rls ────────► cost-domain ──► dashboard
               │                                  ╲      ╲
               ├─► excel-mapper ──► cost-domain    ╲      ╲
               │                                    ╲      ▼
               ├─► frontend-boq ◄── cost-domain       ──► exports
               │                                       ╱
               ├─► pricing ────► cost-domain      ╱   ╱
               │                                ╱    ╱
               ├─► homecenter ──► pricing      ╱    ╱
               │                              ╱    ╱
               ├─► planning ──► dashboard ───╱   ╱
               │                                ╱
               └─► qa ◄── todos los demás ─────
```

---

## Oleadas

### Oleada 0 — Fundación
- **agent-orchestrator**: auditar repositorio, definir contratos
  iniciales, preparar estructura para las oleadas siguientes.

### Oleada 1 — Base de datos, mapeo Excel y frontend con mocks
- **agent-db-rls**: esquema inicial, primeras migraciones, RLS base.
- **agent-excel-mapper**: análisis del Excel, fixture JSON sanitizado.
- **agent-frontend-boq**: pantallas base con mocks estáticos.

### Oleada 2 — Dominio de costos, precios y proveedores
- **agent-cost-domain**: motor financiero puro y testeable.
- **agent-pricing**: capas de precio, descuentos, ahorros.
- **agent-homecenter**: adaptador genérico + CSV fallback.

### Oleada 3 — Dashboards, cronograma y exportaciones
- **agent-dashboard**: KPIs gerenciales y de obra.
- **agent-planning**: Gantt, ruta crítica, avance.
- **agent-exports**: Excel y PDF con perfiles de privacidad.

### Oleada 4 — QA e integración final
- **agent-qa**: validación integral, regresión, privacidad, RLS.
- **agent-orchestrator**: integración final y release readiness.

---

## Criterios de finalización por agente

### agent-orchestrator (Oleada 0)
- `CLAUDE.md` presente.
- `docs/PROJECT_MASTER.md` con contenido real (no placeholder).
- `docs/API_CONTRACTS.md` con contratos iniciales.
- `docs/AGENT_REGISTRY.md` actualizado.
- `.gitignore` cubre `private/`, `*.xlsx`, `.env*`.
- Estructura de carpetas reproducible.

### agent-db-rls (Oleada 1)
- Migraciones para core entities aplicables sin error.
- RLS habilitado en todas las tablas con `organization_id`.
- Esquema Drizzle generado y tipado.
- Test de aislamiento entre organizaciones PASA.

### agent-excel-mapper (Oleada 1)
- `docs/EXCEL_MAPPING.md` documenta cada hoja.
- Fixture JSON sanitizado disponible.
- Importador idempotente.
- Regresión financiera dentro de tolerancia ±0.01 COP.

### agent-frontend-boq (Oleada 1)
- Layout y rutas principales activas.
- Páginas mock renderizan sin error.
- Componentes accesibles WCAG AA.
- Sin lógica financiera duplicada en componentes.

### agent-cost-domain (Oleada 2)
- Todas las fórmulas implementadas en TypeScript puro.
- Regresión PASA ±0.01 COP.
- Snapshots inmutables verificados.
- Tests unitarios de cada fórmula.
- **Consume `PricingReadPort` / `ApprovedPriceContext`** (contrato congelado
  `docs/PRICING_READ_CONTRACT.md`). NO consulta tablas de pricing ni recalcula
  descuentos/ahorros. Usa `budgetReferencePrice` como `unit_price_snapshot`.

### agent-pricing (Oleada 2)
- 8 capas de precio implementadas.
- Endpoints cliente NO retornan campos privados.
- Aprobación humana para variación > umbral.
- Histórico de observaciones preservado.
- **Implementa `PricingReadPort` y `PricingApprovalPort`** y la proyección
  `ClientSafePrice` (contrato congelado `docs/PRICING_READ_CONTRACT.md`).
  Fórmulas Q8 con base `onlinePublicPrice`; dinero/porcentajes `DecimalString`.

### Dependencia de contrato Oleada 2A
- `agent-cost-domain` **depende** de la interfaz que provee `agent-pricing`. Para
  paralelizar sin bloqueo, la interfaz está **congelada v1** en
  `docs/PRICING_READ_CONTRACT.md`: cost-domain programa contra el puerto/DTO;
  pricing lo implementa. Ningún agente edita el contrato; cambios solo vía
  `docs/INTEGRATION_REQUESTS.md` (orchestrator). Sin solape de archivos:
  `modules/apu|boq|estimates` (cost) vs `modules/suppliers|pricing` salvo
  `adapters/` (pricing).

### agent-homecenter (Oleada 2B)
- Interfaz genérica `SupplierAdapter` definida (contrato congelado
  `docs/PRICING_ADAPTER_CONTRACT.md`).
- CSV/Excel fallback funcional con preview y **aprobación humana simple** (Q11).
- Mapeo SKU con candidatos y score; fallback manual; ambiguos `pending`.
- Persistencia SOLO vía `PricingApprovalPort`; imports idempotentes;
  `price_observations` append-only; sin tocar snapshots emitidos.
- Privacidad backend-first (SKU/URL/`sourceReference`/proveedor/precio público/
  candidatos/score/aprobador/motivos = 🔒). Sin scraping ni API pública asumida.
- Diseño n8n documentado (no productivo en 2B).
- **Ownership**: `apps/web/modules/pricing/adapters/`, `scripts/catalog-sync/`,
  `apps/web/tests/unit/pricing-adapters/`. NO toca `modules/apu|boq|estimates`,
  `modules/pricing/*` (salvo `adapters/`), `modules/suppliers/`, ni `package.json`.

### Ownership congelado — Oleada 3A (visibilidad funcional)

Contrato: `docs/READ_MODEL_CONTRACT.md`. Sin solape de archivos entre agentes.

**agent-db-rls (3A)** — capa server/read-model:
- `apps/web/lib/contracts/read-model.ts` (DTOs, fuente única de código).
- `apps/web/server/read-model/` (port, types, errors, fixture-repository,
  drizzle-repository, selector `READ_MODEL_SOURCE`, index).
- `apps/web/server/repositories/`.
- `supabase/seeds/` (seed funcional sanitizado) y tests de server/read-model.
- Proyección por rol server-side; respeta RLS; sin fallback silencioso db→fixture.
- **No** UI. Si modifica schema/migrations/policies/seeds ⇒ RLS runtime 21/21.

**agent-frontend-boq (3A)** — páginas de presupuesto:
- `/projects`, `/estimates`, `/apu`, `/quantities`, `/catalog`; componentes de
  presupuesto; grilla BOQ; tests de componentes/páginas.
- Sustituye mocks por read-model (DTOs); estados loading/error/empty; formato COP
  desde `DecimalString`; **cero cálculos financieros**.
- **No** toca `/dashboard`, `modules/dashboard/`, ni `apps/web/server/`.

**agent-dashboard (3A)** — tablero:
- `/dashboard`, `apps/web/modules/dashboard/`, componentes exclusivos de
  dashboard, tests dashboard.
- KPIs reales (presupuesto/directos/indirectos/capítulos/top capítulos/estado);
  ahorro solo para rol autorizado; gráficos Recharts; loading/error/empty.
- **No** toca páginas de presupuesto ni `apps/web/server/`.

### agent-dashboard (Oleada 3)
- KPIs gerencia y obra implementados.
- Gráficas Recharts integradas.
- Filtros por proyecto/periodo.
- Privacidad por rol validada.

### agent-planning (Oleada 3)
- Modelo de tareas y dependencias.
- CPM funcional.
- Vista Gantt operativa.
- Avance físico independiente del financiero.

### Ownership congelado — Oleada 3B (planificación)

Contrato: `docs/PLANNING_CONTRACT.md`. Sin solape de archivos entre agentes.

**agent-db-rls (3B)**:
- `supabase/migrations/`, `supabase/policies/`, `supabase/seeds/`,
  `apps/web/lib/db/schema.ts`, `apps/web/server/read-model/` (extensión planning),
  `apps/web/server/repositories/`, tests RLS/read-model de planning.
- Migraciones + RLS + índices de `schedule_tasks`/`task_dependencies`/
  `progress_entries`/`resource_assignments`; seed sanitizado; `FixtureReadModelRepository`
  + `DrizzleReadModelRepository` de planning. **RLS runtime obligatorio** (21/21
  previo + nuevos tests de planning). **No** UI.

**agent-planning (3B)**:
- `apps/web/modules/planning/` (dominio puro: CPM/ruta crítica/holguras/ciclos/
  progreso), `apps/web/app/(dashboard)/planning/`, `apps/web/components/planning/`,
  `apps/web/tests/unit/planning/`.
- Página `/planning` + Gantt (frappe-gantt, import dinámico si requiere DOM);
  fixture UI compatible; loading/error/empty; responsive básico. **Cero** cálculo
  monetario/CPM en React (consume DTOs); **no** toca DB.

### Ownership congelado — Oleada 3C (exportaciones)

Contrato: `docs/EXPORT_PROFILES_CONTRACT.md` (v1). Ejecución **secuencial**
(único agente de la oleada). Sin solape de archivos con otros agentes.

**agent-exports (3C)** — ownership exclusivo:
- `apps/web/modules/exports/` (dominio de exportación puro y testeable:
  perfiles, whitelist, generadores XLSX/PDF/CSV).
- `apps/web/server/exports/` (orquestación server-side; consume `ReadModelPort`).
- `apps/web/app/api/exports/` (route handlers de descarga; content-type;
  nombres sanitizados; errores sin stack).
- `apps/web/tests/unit/exports/` (privacidad por perfil, totales, formato COP,
  Excel reabierto programáticamente, PDF válido, CSV, filenames, content-types,
  errores, tamaño, ausencia de recálculo/tablas crudas/datos privados).
- `scripts/export-fixtures/` (fixture sanitizado para pruebas de exportación).

**NO tocar**: DB, migraciones, seeds, RLS, pricing, cost-domain, planning,
read-model canónico (`apps/web/lib/contracts/read-model.ts`), pantallas
existentes ni contratos congelados (cambios solo vía INTEGRATION_REQUESTS).
**No** instalar dependencias (las aprueba el orquestador). **No** conectar DB
remota. **No** usar datos privados / Excel real. **No** AGPL / enterprise.
**No** escribir temporales sensibles. **No** recalcular finanzas. **No**
implementar `.mpp` ni XML MS Project.

### agent-exports (Oleada 3) — criterios de finalización
- 5 formatos MVP: `xlsx-client`, `xlsx-internal`, `pdf-client`,
  `pdf-management`, `csv-schedule`.
- 4 perfiles con whitelist server-side aplicada antes de serializar.
- `ExportService.generate` + route handlers + content-types + filenames.
- Tests de privacidad por perfil PASAN; sin fuga de campos internos en cliente.
- Excel válido (reapertura programática); PDF válido; CSV correcto.
- gm:regression 22/22 + gm:import 9/9 intactos (cero recálculo financiero).

### Ownership congelado — Oleada 4A.1 (auth/RLS local — DB)

Contrato: `docs/AUTH_CONTRACT.md` (v1). Ejecución **secuencial** (único agente
de la microfase: `agent-db-rls`). Sin solape con otros agentes.

**agent-db-rls (4A.1)** — ownership exclusivo:
- `supabase/migrations/` (cambios **mínimos**: helpers de identidad real; sin
  duplicar `profiles`/`organizations`).
- `supabase/policies/` y políticas RLS dentro de migraciones.
- `supabase/seeds/` (seeds locales sanitizados con `auth.users` + `profiles`).
- `apps/web/lib/db/schema.ts` (solo si requiere ajustes mínimos de membresía).
- `scripts/rls-runtime/` (harness + nuevos tests auth runtime).
- Documentación de handoff permitida.

Responsabilidad: **reutilizar** `profiles` como membresía single-org (NO crear
tablas equivalentes); helpers SQL que resuelvan identidad real
(`auth.uid()`→`profiles`) manteniendo compatibilidad con el harness demo (claims
JWT); rol autorizado (mapeo del AUTH_CONTRACT); **RLS runtime obligatorio**
(previo **32/32** + nuevos tests: autenticado con org, sin sesión→deny, sin
membresía→deny, org A/B aislada, cross-org→deny, rol válido vs insuficiente,
deny-by-default); seeds sanitizados; cero remoto.

**NO tocar**: UI, `apps/web/proxy.ts`, páginas, exports, planning, pricing,
cost-domain, read-model frontend, Vercel, remoto. **No** instalar dependencias
(las aprueba el orquestador). **No** `supabase link`/`db push`. **No**
`service_role` en frontend. **No** secretos en repo. **No** multi-org. **No**
modificar contratos congelados (cambios vía INTEGRATION_REQUESTS).

### Ownership congelado — Oleada 4A.2 (runtime SSR + UI auth)

Contrato: `docs/AUTH_RUNTIME_CONTRACT.md` (v1). Ejecución **secuencial**.

**Runtime SSR (orquestador)** — `apps/web/lib/supabase/`,
`apps/web/server/auth/`, `apps/web/proxy.ts`, ajustes mínimos en
`apps/web/app/page.tsx`, `apps/web/server/read-model/` (selector de viewer),
`apps/web/app/api/exports/route.ts` (guard + anti-escalamiento). Patrón
`@supabase/ssr` (`getAll`/`setAll`; `getClaims()` como guard; **no**
`getSession()` server-side; **no** `auth-helpers-nextjs`). Sin remoto/Vercel.

**agent-frontend-boq (4A.2)** — ownership exclusivo UI:
- `apps/web/app/(auth)/` (login/logout/forgot/reset/callback + `actions.ts`).
- `apps/web/components/auth/`.
- `apps/web/tests/unit/auth-ui/`.
**NO tocar**: DB, migraciones, seeds, RLS, `proxy.ts`, `apps/web/server/auth/`,
read-model, exports, planning, pricing, cost-domain, Vercel, remoto. **No**
instalar librerías nuevas. **No** `service_role` en frontend. **No** secretos.

### Ownership congelado — Oleada 4B.1 (vertical slice real de proyectos)

Contrato: `docs/PROJECTS_CRUD_CONTRACT.md` (v1). Ejecución **secuencial**
(db-rls → frontend-boq). Sin tocar Vercel ni remoto productivo.

**agent-db-rls (4B.1)** — ownership exclusivo:
- Migración nueva `supabase/migrations/<ts>_projects_authorship.sql`
  (`projects.description` + `projects.created_by`), reversible.
- `apps/web/server/projects/` (repositorio de escritura `ProjectsWriteRepository`:
  `createProject`, `getProjectById`; tipos `CreateProjectInput`/`ProjectDetailView`
  como fuente única) + impl fixture/db.
- RLS runtime extendido en `scripts/rls-runtime/run.ts`; tests del repo; seed
  sanitizado estrictamente necesario; `docs/DATABASE_SCHEMA.md`.
**NO tocar**: UI, `app/(dashboard)/projects/`, auth runtime, exports, planning,
pricing, cost-domain, Vercel, remoto. **No** service-role en flujo de app.

**agent-frontend-boq (4B.1)** — ownership exclusivo:
- `apps/web/app/(dashboard)/projects/` (página lista, `actions.ts` server action,
  detalle `[id]/page.tsx`, formulario "+ Nuevo proyecto") + componentes asociados.
- Tests UI/unitarios de la action y el formulario.
**NO tocar**: DB, migraciones, seeds, RLS, repositorio de escritura (consume su
interfaz), auth runtime (`apps/web/server/auth/` — solo consume `resolveAuthenticatedViewer`),
exports, planning, pricing, cost-domain, Vercel, remoto. **No** recibir
`organization_id`/`created_by`/`role` del navegador. **No** service-role. **No**
instalar librerías nuevas.

### Ownership congelado — Oleada 4B.2 (vertical slice real de alcances)

Contrato: `docs/SCOPES_CRUD_CONTRACT.md` (v1). Integrado por el orquestador
(autoría compartida db-rls/frontend-boq) con migración remota aprobada.

**agent-db-rls (4B.2)** — ownership:
- Migración `supabase/migrations/20260604120000_project_scopes_authorship.sql`
  (`project_scopes.description` + `project_scopes.created_by`), reversible.
- `apps/web/server/scopes/` (`ScopesWriteRepository`: `insertScope`,
  `listScopesByProject`, `getScopeById`; tipos como fuente única) + impl fixture/db.
- `apps/web/lib/scopes/scope-types.ts` (constantes client-safe).
- RLS runtime extendido (`scripts/rls-runtime/run.ts`, +6 checks de `project_scopes`).
**NO tocar**: UI, auth runtime (solo consume), Vercel. **No** service-role.

**agent-frontend-boq (4B.2)** — ownership:
- `apps/web/app/(dashboard)/projects/[id]/` sección Alcances + `scopes/new`,
  `scopes/[scopeId]`, `scopes/actions.ts`, `new-scope-form.tsx`, `scope-labels.ts`.
- Tests UI/route-config de scopes.
**NO tocar**: DB/migraciones/RLS/repositorio (consume su interfaz), Vercel, remoto.
**No** recibir `organization_id`/`created_by`/`status`/`code` del navegador.

### Ownership congelado — Oleada 4B.3 (presupuesto inicial por alcance)

Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md` (v1). Migración remota aprobada.

**agent-db-rls (4B.3)** — ownership:
- Migración `20260604130000_estimates_authorship_and_atomic_create.sql`
  (`estimates.description`+`created_by`; RPC `create_estimate_with_initial_version`
  `SECURITY INVOKER`, autor derivado, grants endurecidos), reversible.
- `apps/web/server/estimates/` (`EstimatesWriteRepository` + impl fixture/db).
- RLS runtime extendido (`scripts/rls-runtime/run.ts`, +10 checks de estimates).
**NO tocar**: UI, auth runtime (solo consume), Vercel. **No** service-role.

**agent-frontend-boq (4B.3)** — ownership:
- `apps/web/app/(dashboard)/projects/[id]/scopes/[scopeId]/` sección Presupuestos +
  `estimates/new`, `estimates/[estimateId]`, `estimates/actions.ts`, formularios y
  `estimate-format.ts`; reintegración de `apps/web/app/(dashboard)/estimates/page.tsx`
  como listado real.
- Tests UI/route-config de estimates.
**NO tocar**: DB/migraciones/RLS/repositorio (consume su interfaz), Vercel, remoto.
**No** recibir `organization_id`/`created_by`/`status`/`code`/`project_scope_id`
sin validar del navegador.

### Ownership congelado — Oleada 4C.1 (importación de Excel a V01)

Contrato: `docs/EXCEL_IMPORT_CONTRACT.md` (v1). Migración remota aprobada.

**agent-db-rls (4C.1)** — ownership:
- Migración `20260604140000_boq_import_atomic.sql` (RPC `import_boq_into_version`
  `SECURITY INVOKER`, grants endurecidos). Sin tablas nuevas ni cambios RLS.
- RLS runtime extendido (`scripts/rls-runtime/run.ts`, +10 checks de import).

**agent-excel-mapper (4C.1)** — ownership:
- `apps/web/server/estimates/import/parse.ts` (parser SheetJS, recálculo Decimal, digest).
- `apps/web/lib/import/types.ts` (tipos/limites client-safe).

**agent-frontend-boq (4C.1)** — ownership:
- `apps/web/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/import/`
  (page + import-flow client + actions); sección Importar Excel + Total directo en el detalle.
- `apps/web/next.config.mjs` (`serverActions.bodySizeLimit`). Tests de parser/UI.
**NO tocar**: migración/RLS/RPC (consume), Vercel. **No** persistir el archivo; **no** usar el
Excel privado real en dev.

### agent-qa (Oleada 4)
- `docs/QA_REPORT.md` con resultado completo.
- Sin FAIL bloqueante para release.
- Regresión, privacidad, RLS, inmutabilidad VERIFICADAS.
- Licencias auditadas.

---

## Reglas de invocación

1. Sólo `agent-orchestrator` puede invocar a los demás.
2. Los agentes especializados NO se invocan entre sí.
3. Para coordinación, registrar solicitud en
   `docs/INTEGRATION_REQUESTS.md`.
4. El orquestador resuelve el conflicto o delega.
5. Cambios en `package.json` SIEMPRE pasan por el orquestador.

---

## Contrato de entidades congelado v1 (2026-05-29)

El contrato de datos está **congelado v1** en `docs/DATABASE_SCHEMA.md` y
`docs/API_CONTRACTS.md`. Es la fuente única de verdad de nombres y tipos.

Confirmación de ownership frente al contrato:

- **`agent-db-rls`** implementa **exactamente** el esquema congelado
  (mismos nombres de tabla/columna, tipos, FK, RLS, enums). Los tipos
  Drizzle deben mapear 1:1 a las interfaces de `API_CONTRACTS.md`.
- **`agent-excel-mapper`** produce fixture JSON e importador que usan
  **los nombres canónicos** y respetan las interfaces públicas.
- **`agent-frontend-boq`** construye mocks y vistas que respetan
  **exactamente** los tipos públicos (sin inventar campos ni renombrar).
- **Ningún agente** renombra campos, cambia tipos ni altera enums
  unilateralmente.
- Toda solicitud de modificación del contrato se registra en
  `docs/INTEGRATION_REQUESTS.md` y la resuelve el orquestador (cambios
  incompatibles ⇒ contrato v2).

Reglas transversales del contrato:
- DB `snake_case` ↔ TypeScript `camelCase`; interfaces en `PascalCase`.
- Dinero/decimales: `NUMERIC(20,10)` en DB, **`string` decimal** en API
  (Decimal.js para operar). El frontend **no** calcula totales financieros.
- Snapshots y versiones emitidas (`approved`/`issued`/`archived`) son
  **inmutables**.
- Privacidad **backend-first**: los campos 🔒 INTERNO no se serializan al
  rol cliente.
