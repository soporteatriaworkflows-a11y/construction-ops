# V5 — Operational Depth · Planning (ICONIC_OPS_OPERATIONAL_DEPTH_V5_PLANNING)

> Solo diagnóstico + plan. Sin código, sin merge/tag/deploy. Base: `origin/main = 86578cc`
> (V4.2 merge `5c185bc` + closeout `86578cc`, tag `iconic-ops-uix-theme-modes-v4-2`). Proyecto
> `construction-ops` (NO `-1rqh`).

## 1. Estado técnico
- main = `86578cc`; V4.2 (`5c185bc`) + closeout (`86578cc`) son ancestros de main ✅; tag → `5c185bc` ✅; working tree limpio.
- V4.2 entregó la capa visual/UIX (theme modes, AppRail, dashboard IA, workflow strip+dock, contraste dark).
- **V5 = profundidad operativa**, no estética: tablas internas, estados accionables, filtros útiles, acciones claras, con **datos existentes** mejor organizados; las funcionalidades con backend se separan.

## 2. Hallazgos por módulo (auditoría de código)

### APU (Library + Workspace técnico + /apu/[id])
- **Datos/estados YA computados**: `result.stats` = totalApus, totalComponents, linkedToBoq, complete, withPending,
  withUnresolved; filtro `completeness`. Detalle `/apu/[id]` con smart-defaults **read-only** (consumo de material,
  productividad/rendimiento). Vínculo a BOQ vía `apuTemplateId`.
- **Vista actual**: cards + workspace técnico (tabla) + filtros + banda KPI (V4) + header navy.
- **Gap operativo**: la tabla técnica y las cards no exponen acciones por estado ("completar APU", "vincular a BOQ",
  "resolver pendiente") ni un detalle accionable; los estados existen pero no guían la acción.

### Catálogo / Precios
- **Subrutas existentes**: `catalog/page` (explorer), `prices` (review), `monitoring`, `providers`,
  `resources/[id]/price-intelligence`, `import`, `actions.ts`. Recurso con `priceStatus` (approved/pending/none),
  `supplierName`. `MonitoringSummary` (lastRunAt) + `MonitorTargetView` (nextCheckAt, lastCheckedAt, isOverdue, hasFailureAlert).
- **Gap**: las piezas (explorer, review, monitoring, intelligence) están dispersas; falta un **centro de control de
  precios** que las una con estados/alertas accionables sobre datos existentes.

### Cantidades
- Grupos + importación + workspace + sincronización con BOQ (oleadas previas). Estados de conflicto/sincronización
  **a verificar** en `server/quantities` (no se confirmó un set claro de `synced/conflict/pending` en este barrido).
- **Gap/Riesgo**: la sincronización con BOQ y `unit_price_snapshot` son sensibles → UI/UX sí, lógica de sync NO.

### Workspace BOQ (V3C/V4.2)
- Sólido: barra de comando, KPIs, cobertura APU, panel de detalle, filtro Sin APU, edición rápida, columnas.
- **Gap**: profundidad funcional de la **tabla** (densidad, estados por fila más accionables, agrupación), no estética.

### Notas rápidas
- **NO existe backend** (sin tabla/migración/modelo). Hoy es UI shell con ejemplos. Feature real = DB + RLS + actions.

### Countdown de monitoreo
- `getMonitoringSummary` devuelve `lastRunAt` (real). **NO** expone próxima corrida. Pero `next_check_at` existe por
  target → "próxima revisión" = `min(next_check_at)` de targets habilitados → **derivable**, pero requiere añadir
  un campo al summary (repo/read-model) = backend pequeño.

### Workflow dock responsive
- Desktop ok (lg+, minimizable, persistente). Mobile: oculto (`<lg`). Riesgo bajo. = **hotfix menor**, no fase.

## 3. Tabla por módulo

| Módulo | Estado actual | Quick wins UI/UX (datos existentes) | Requiere backend | Riesgo | Recomendación |
|---|---|---|---|---|---|
| **APU** | estados ricos ya computados; vista cards/workspace | acciones por estado (completar/vincular/resolver), detalle accionable, filtros por completitud, badges → CTA | no (UI sobre datos) | **bajo** | **V5.1 (empezar aquí)** |
| **Catálogo/Precios** | piezas dispersas (explorer/review/monitoring/intelligence) | centro de control: KPIs precio, alertas (overdue/error/pending), accesos, estados accionables | derivaciones sí; scraper/agente no | medio | V5.2 |
| **Cantidades** | grupos/import/sync BOQ | estados visibles (importado/revisado/pendiente) si el dato existe; mejor toolbar/acciones | sync/cálculo NO | **alto (sync)** | V5.3 (con cuidado) |
| **Workspace BOQ** | V3C sólido | densidad/estados por fila accionables, agrupación | no | bajo-medio | V5.3 (junto a cantidades) |
| **Notas reales** | sin backend | — | **sí (DB+RLS+actions)** | medio | V5.4 (feature backend) |
| **Countdown real** | lastRunAt real; sin next-run en summary | mostrar `min(nextCheckAt)` | **sí (1 campo en summary/repo)** | bajo | V5.4 (backend pequeño) |
| **Dock responsive** | desktop ok, mobile oculto | dock de íconos en mobile | no | bajo | hotfix menor (cuando convenga) |

## 4. Roadmap V5 propuesto
- **V5.1 — APU operational depth (UI/UX, datos existentes).** Acciones por estado, detalle accionable, filtros/badges
  que guían la acción. Sin backend. Riesgo bajo.
- **V5.2 — Catálogo / Centro de control de precios (UI/UX).** Unificar explorer + review + monitoring + intelligence con
  KPIs/alertas/accesos sobre datos existentes. Sin scraper/agente.
- **V5.3 — Workspace BOQ + Cantidades (UI/UX de tablas).** Densidad, estados por fila accionables, toolbars; **sin tocar
  sync ni cálculos**.
- **V5.4 — Features con backend (tarea aparte, explícita).** Notas reales (tabla+RLS+actions), countdown real
  (`nextCheckAt` en summary), dock responsive. Cada una con su contrato y QA; tocan DB/read-model → fuera del modo "UI-only".

## 5. Por dónde empezar — recomendación
**Empezar por APU (V5.1).** Justificación: (a) ya tiene los **estados computados** (complete/pending/unresolved/linkedToBoq)
→ máximo valor operativo con **solo UI/UX**, sin backend; (b) es el núcleo del flujo de costeo (APU→BOQ→presupuesto);
(c) **riesgo bajo** (no toca cálculos/`unit_price_snapshot`/sync); (d) deja patrón de "acciones por estado" reutilizable
para Catálogo y Cantidades. Catálogo (V5.2) es el segundo de mayor impacto pero abarca más rutas; Cantidades (V5.3) es
valioso pero su sync es sensible; Notas/countdown (V5.4) son features con backend y conviene aislarlas.

## 6. Qué NO tocar todavía
Lógica de sync de Cantidades↔BOQ, cálculos BOQ/APU, `unit_price_snapshot`, exports, RPCs, read-model (salvo el campo
del countdown en V5.4 explícito), Supabase/RLS/Auth/envs, `construction-ops-1rqh`. Notas reales y countdown real **no**
en V5.1 (son backend).

## 7. Prompt sugerido para V5.1
```
ICONIC_OPS_APU_OPERATIONAL_DEPTH_V5_1

Objetivo: convertir APU en un workspace operativo serio usando SOLO datos/estados existentes
(complete/withPending/withUnresolved/linkedToBoq, completeness, smart-defaults read-only). UI/UX, sin backend.

Base: main = 86578cc, tag iconic-ops-uix-theme-modes-v4-2. Repo construction-ops. No tocar -1rqh.
Rama: feature/apu-operational-depth-v5-1 (desde origin/main). No merge/tag/deploy.

Alcance (UI/UX, datos existentes):
1. Acciones por estado en cards/tabla: "Completar APU" / "Vincular a BOQ" / "Resolver pendientes" / "Ver detalle",
   reusando flujos/rutas existentes (sin inventar). Estados como CTA, no solo badges.
2. Detalle /apu/[id]: panel de "qué falta" accionable (materiales sin consumo, sin rendimiento, sin vínculo BOQ),
   derivado de datos existentes; sin editar cálculos ni unit_price_snapshot.
3. Filtros útiles por completitud/categoría/unidad ya existentes, con conteos honestos.
4. Consistencia con el sistema visual V4.2 (SurfaceCard/OperationsHeader/tokens/dark).

NO tocar: cálculos APU/BOQ, unit_price_snapshot, Supabase/RLS/Auth/envs, exports, RPCs, read-model, datos reales,
Workspace V3C lógica, companion, filtro Sin APU, rutas funcionales, -1rqh. Sin backend nuevo, sin migraciones.

QA: git diff --check, typecheck, lint, tests afectados, suite, build, gm. Preview por PR (construction-ops, no prod).
Entregar diagnóstico de "qué falta por APU" + reporte; no mergear sin aprobación visual.
```
