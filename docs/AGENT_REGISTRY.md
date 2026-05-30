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
- `apps/web/tests/unit/exports/`

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

### agent-homecenter (Oleada 2)
- Interfaz genérica `SupplierAdapter` definida.
- CSV fallback funcional con preview y aprobación.
- Mapeo SKU con candidatos.
- Diseño n8n documentado.

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

### agent-exports (Oleada 3)
- Exportador XLSX con 4 perfiles.
- Exportador PDF con marca de agua.
- Auditoría de exportaciones.
- Tests de privacidad por perfil PASAN.

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
