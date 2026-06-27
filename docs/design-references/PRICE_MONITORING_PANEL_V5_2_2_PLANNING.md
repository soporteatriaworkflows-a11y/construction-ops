# V5.2.2 — Price Monitoring Panel · Planning

> Solo diagnóstico + plan. Sin código/merge/tag/deploy. Base: `origin/main = 3170207`. Proyecto `construction-ops` (NO `-1rqh`).

## 1. Estado actual de main
`origin/main = 3170207`. Contiene (ancestros ✅): V5.2.1 merge `e3f51a7` + closeout `5107086`; P0 hotfix merge `0287c23` + closeout `3170207`.

## 2. V5.2.1 released ✅
Tag `iconic-ops-catalog-price-control-center-v5-2-1` → `e3f51a7`.

## 3. P0 hotfix released ✅
Tag `iconic-ops-catalog-runtime-hotfix-v5-2-1` → `0287c23`. (Causa: helper de módulo `'use client'` llamado en Server Component; fix = `lib/catalog/price-age.ts` neutro.)

## 4. Rutas auditadas
`/catalog/monitoring` (page + actions + `_components/monitor-controls`), `server/pricing/monitor/types.ts`,
`server/pricing/monitor` (repo), `/api/cron/price-monitor/route.ts`. Relación: `/catalog`, `/catalog/prices/review`,
`/catalog/resources/[id]/price-intelligence`.

## 5. Archivos/componentes auditados
- `app/(dashboard)/catalog/monitoring/page.tsx` — **Server Component** (async; carga vía `getMonitorRepository()`: targets + runs + summary).
- `app/(dashboard)/catalog/monitoring/actions.ts` — `'use server'`: createMonitorTarget, toggleMonitorTarget, updateMonitorCadence, **runMonitorNow**.
- `app/(dashboard)/catalog/monitoring/_components/monitor-controls.tsx` — `'use client'`: EnableMonitoringForm, TargetToggleButton, CadenceForm, RunNowButton (gateados a roles internos server-side).
- `server/pricing/monitor/types.ts` — tipos. `/api/cron/price-monitor/route.ts` — GET gateado por `CRON_SECRET`.

## 6. Riesgo server/client para V5.2.2  ⚠️ (lección P0)
- **`/catalog/monitoring` ES Server Component.** Hijos client = `monitor-controls.tsx`. La page **solo renderiza** esos
  componentes client (correcto); **NO llama helpers** de ese módulo. `targetStatusBadge(t)` es función **local** del page (server, ok).
- **Estado actual: SIN riesgo** (no hay import server→helper-client).
- **Regla obligatoria V5.2.2**: cualquier helper de derivación/filtro nuevo (estado de target, etiqueta de próxima
  revisión, filtros) debe vivir en un **módulo NEUTRO** `lib/pricing/monitor-ui.ts` (SIN `'use client'`), importable por el
  Server page y por cualquier componente client de filtros. **NUNCA** importar/llamar funciones desde `monitor-controls.tsx`
  (`'use client'`) en el Server Component. (Es exactamente el patrón `price-age.ts`.)
- Si se añade un filtro client (estilo `catalog-explorer`), su lógica de filtrado va en el módulo neutro; el page importa
  las derivaciones de KPI/estado del mismo módulo neutro.

## 7. Modelos/tipos/campos encontrados (reales)
- **MonitorTargetView**: id, resourceId/Code/Name/Unit, supplierId, **supplierName**, **sourceUrl**, **cadenceDays**,
  **enabled**, **lastCheckedAt**, **nextCheckAt** (no-null), **lastSuccessAt**, **consecutiveFailures**, **isOverdue**
  (runtime), **hasFailureAlert** (runtime), createdAt.
- **MonitoringSummary**: monitoredCount, **activeCount**, **pausedCount**, **overdueCount**, **erroredCount**,
  **pendingChangesCount**, **lastRunAt**.
- **MonitorRunView**: triggerType, status, startedAt, finishedAt, counters, errorSummary.

## 8. Qué tan real está el monitoreo hoy (honesto)
**Muy real (Fase 4A funcional), NO shell.** Hay targets con cadencia/fuente, próxima revisión real (`nextCheckAt`),
overdue/error/fallos runtime, summary completo, lista de corridas, **y acciones reales** (revisar ahora, pausar/activar,
cadencia, alta de target) + cron. El page ya muestra resumen + tabla de targets + corridas.

## 9. Estados derivables SIN backend
Bajo monitoreo (`enabled`) · Pausado (`!enabled`) · Atrasado (`isOverdue`) · Con error/atención (`hasFailureAlert` /
`consecutiveFailures>0`) · Saludable (`enabled && !isOverdue && consecutiveFailures===0`) · Próxima revisión
disponible (`nextCheckAt`) · Última revisión (`lastCheckedAt`/`lastSuccessAt`) · Con/Sin proveedor (`supplierName`) ·
Fallos recurrentes (`consecutiveFailures`) · Cambios pendientes (`pendingChangesCount`).

## 10. Qué requiere backend (NO ahora)
Nuevas tablas/migraciones/RLS · scraper/agente real · **historial agregado** más allá de runs · **countdown agregado en
dashboard** (exponer `nextCheckAt` agregado en el read-model del dashboard) · aprobación persistente nueva. (Ojo:
"revisar ahora", toggle, cadencia y alta de target **YA existen** — NO reconstruir, NO tocar su lógica.)

## 11. Quick wins UI/UX recomendados (datos existentes)
KPI band del monitoreo (monitored/active/paused/overdue/errored/pendingChanges) más claro y **accionable** (filtro por
estado) · badges de estado claros en la tabla de targets · columna **"próxima revisión"** (`nextCheckAt` → "en N días"/fecha) +
"última revisión" · **N fallos** (consecutiveFailures) · **callout de fallos/atrasados** · deep-links: `/catalog → /catalog/monitoring`
y target → `/catalog/resources/[id]/price-intelligence` (recurso) · `pendingChangesCount` → `/catalog/prices/review` ·
consistencia V4.2 (SurfaceCard/tokens/dark). Sin tocar acciones/cron.

## 12. Tabla por área

| Área | Estado actual | Datos disponibles | Quick win UI/UX | Requiere backend | Riesgo | Recomendación |
|---|---|---|---|---|---|---|
| **Monitoring summary/KPIs** | summary real, SummaryCard básico | monitored/active/paused/overdue/errored/pending | KPI band claro + accionable (filtro estado) | no | **bajo** | **V5.2.2a (empezar)** |
| **Tabla de targets** | tabla + badge básico | enabled/isOverdue/failures/nextCheckAt/source/cadence | badges de estado + próxima/última revisión + N fallos + callout | no | bajo-medio | V5.2.2a |
| **Filtros + deep-links** | sin filtros; sin enlaces cruzados | estados derivables | filtro client (helper en lib neutro) + deep-links catálogo↔monitoring↔recurso↔review | no | medio (server/client) | V5.2.2b |
| **Corridas / historial** | lista de runs | runs + counters + errorSummary | mejor lectura de runs/errores | historial agregado = backend | medio | V5.2.2c |
| **Acciones (RunNow/Toggle/Cadence)** | reales y funcionando | — | NO tocar lógica (solo presentación) | — | alto si se toca | conservar |
| **Countdown dashboard** | no agregado | nextCheckAt por target | — | **sí (read-model)** | — | diferir (V5.4) |

## 13. Propuesta V5.2.2 por fases
- **V5.2.2a — KPI band + estados/badges + próxima revisión + callouts** (Server page + helpers en `lib/pricing/monitor-ui.ts`
  neutro). UI sobre datos existentes. Riesgo bajo. NO toca acciones/cron.
- **V5.2.2b — Filtros por estado + deep-links** (catálogo↔monitoring↔recurso↔review). Filtro en componente client con
  lógica en el módulo neutro. Riesgo medio (server/client controlado por la regla §6).
- **V5.2.2c — Lectura de corridas/errores + price-intelligence** sobre runs reales. Riesgo medio.

## 14. Por dónde empezar — recomendación
**V5.2.2a.** El monitoreo ya tiene los datos y las acciones; el valor inmediato es **leerlo como panel operativo**
(KPIs claros, estados accionables, próxima revisión, callouts) con **render solo server + helpers neutros** → riesgo bajo
y cero acoplamiento server/client. Filtros/deep-links (V5.2.2b) después, ya con el módulo neutro establecido.

## 15. Validación requerida (futuras implementaciones)
- **Render AUTENTICADO en preview** (con sesión) — NO confiar solo en HTTP 307.
- Rutas mínimas manuales: `/catalog/monitoring`, `/catalog`, `/catalog/prices/review`, un `/catalog/resources/[id]/price-intelligence`.
- Checklist **light/dark**.
- **Checklist server/client**: `grep` de Server Components que importen desde archivos `'use client'`; helpers compartidos en `lib/...` neutro.
- QA: git diff --check, typecheck, lint, tests, suite, build, gm.

## 16. Prompt sugerido V5.2.2a
```
ICONIC_OPS_PRICE_MONITORING_PANEL_V5_2_2A

Objetivo: operacionalizar /catalog/monitoring (Server Component, Fase 4A YA funcional) como panel de control,
usando SOLO datos existentes (MonitorTargetView/MonitoringSummary). UI/UX, sin backend, sin tocar acciones/cron.

Base: main = 3170207, tag iconic-ops-catalog-runtime-hotfix-v5-2-1. Repo construction-ops. No -1rqh.
Rama: feature/price-monitoring-panel-v5-2-2a (desde origin/main). No merge/tag/deploy.

REGLA SERVER/CLIENT (lección P0): helpers de derivación/estado/etiqueta van en módulo NEUTRO
lib/pricing/monitor-ui.ts (SIN 'use client'); el Server page los importa de ahí. NUNCA importar/llamar
funciones desde monitor-controls.tsx ('use client') en el page server.

Alcance (UI/UX, datos existentes):
1. KPI band claro: monitored/active/paused/overdue/errored/pendingChanges (de MonitoringSummary).
2. Estados de target (helper neutro): bajo monitoreo/pausado/atrasado/error/saludable (enabled/isOverdue/consecutiveFailures).
3. Columna "próxima revisión" (nextCheckAt → "en N días"/fecha) + "última revisión" + "N fallos".
4. Callout de atrasados/con error (overdueCount/erroredCount/hasFailureAlert).
5. Consistencia V4.2 (SurfaceCard/tokens/dark). Acciones existentes (RunNow/Toggle/Cadence) intactas.

NO tocar: acciones/cron/repo del monitor, Supabase/RLS/Auth/envs, read-model, cálculos, unit_price_snapshot,
sync, aprobación, scraper, -1rqh. Sin backend/migraciones.

Validación: render AUTENTICADO en preview (no solo 307) + light/dark + checklist server/client. QA completa.
Preview por PR (construction-ops). No merge sin validación visual autenticada.
```

## 17. Confirmación
NO merge · NO tag · NO producción. Solo diagnóstico + plan en rama docs `feature/price-monitoring-panel-v5-2-2-planning`.
