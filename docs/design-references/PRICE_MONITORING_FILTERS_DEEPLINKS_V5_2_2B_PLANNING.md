# V5.2.2b — Filtros + deep-links de monitoreo · Planning

> Solo diagnóstico + plan. Sin código/merge/tag/deploy. Base: `origin/main = 7e9cb8d`. Proyecto `construction-ops` (NO `-1rqh`).

## 1. Estado actual de main
`origin/main = 7e9cb8d`. Ancestros ✅: V5.2.2a merge `d499638` + closeout `7e9cb8d`; P0 hotfix `0287c23`.

## 2. V5.2.2a released ✅
Tag `iconic-ops-price-monitoring-panel-v5-2-2a` → `d499638`; tag P0 `iconic-ops-catalog-runtime-hotfix-v5-2-1` → `0287c23`.

## 3. Rutas auditadas
`/catalog/monitoring`, `/catalog`, `/catalog/prices/review`, `/catalog/resources/[id]/price-intelligence`, `/catalog/providers`.

## 4. Archivos/componentes auditados
- `monitoring/page.tsx` — **Server Component**; `repo.listTargets(viewer)` → `targets.map` directo; **NO lee searchParams** aún;
  estado vía `getMonitorTargetStatus` (helper neutro); KPI "Cambios pendientes" ya enlaza a `/catalog/prices/review`.
- `lib/pricing/monitor-ui.ts` — helper NEUTRO: getMonitorTargetStatus (keys paused/error/overdue/healthy), relativeDays,
  formatLastChecked/formatNextCheck. **Sin helper de filtro aún.**
- `monitor-controls.tsx` — sigue `'use client'` (solo componentes; el page importa solo componentes de aquí).
- Links cruzados existentes: resource `price-intelligence` → `/catalog/monitoring` (monitoring-section); monitoring tabla →
  resource `price-intelligence`; monitoring KPI → review. (Faltan: `/catalog → monitoring`, `review → monitoring`.)

## 5. Riesgo server/client para filtros/deep-links V5.2.2b
- **Recomendación: filtrar SERVER-SIDE.** `monitoring/page.tsx` es Server Component con los `targets` ya en memoria →
  leer `searchParams.status` (Promise en Next 16) y filtrar el array con un **helper neutro** `filterTargetsByStatus`.
  Las pills de filtro = **`<Link>` server-rendered** (deep-links `?status=…`), **sin `useState`, sin isla client**.
- Esto **elimina** el riesgo P0: no se añade componente `'use client'` nuevo, no se importan helpers desde módulos client,
  toda la lógica vive en `lib/pricing/monitor-ui.ts` (neutro, ya probado).
- `monitor-controls.tsx` permanece client y se sigue importando **solo como componentes** (RunNow/Toggle/Cadence). Sin cambios.
- **NO** introducir un `FilterPills` client para monitoring (reintroduciría coordinación server/client innecesaria).
- Guard de tests existente (`monitor-ui.test.ts`) se extiende: helper de filtro puro + check de que el page no importa helpers de client.

## 6. Filtros viables sin backend (server-side)
1:1 con las keys de estado (de `getMonitorTargetStatus`, datos reales `enabled/hasFailureAlert/consecutiveFailures/isOverdue`):
- `status=all` (default) · `status=healthy` (Saludables) · `status=overdue` (Atrasadas) · `status=error` (Con error/atención) ·
  `status=paused` (Pausadas).
- Opcional `supplier=missing` (de `supplierName` nullable) — viable pero de bajo valor (los targets suelen tener proveedor) → opcional.

## 7. Filtros NO recomendados todavía
- `changes=pending` como filtro de la **tabla de targets**: `pendingChangesCount` es una métrica de **summary**, NO un
  campo por target → no filtra la tabla. Se mantiene como **deep-link a review** (correcto).
- `search`/query de recurso en monitoring: no existe patrón previo aquí; bajo valor → diferir.
- `status=active` como filtro único: ambiguo (activas = healthy+overdue+error, no es una key). Mejor usar las keys 1:1.

## 8. Deep-links recomendados (rutas reales)
- KPI **Atrasadas** → `/catalog/monitoring?status=overdue`
- KPI **Pausadas** → `/catalog/monitoring?status=paused`
- KPI **Con error** → `/catalog/monitoring?status=error`
- KPI **Cambios pendientes** → `/catalog/prices/review` (ya existe; conservar)
- Target → `/catalog/resources/[id]/price-intelligence` (ya existe; conservar)
- **`/catalog` → `/catalog/monitoring`**: añadir acceso desde el centro de control de precios (p.ej. KPI/acción "Monitoreo").
- **`/catalog/prices/review` → `/catalog/monitoring`**: añadir enlace cruzado (back/contexto).

## 9. Deep-links NO recomendados
- Catálogo "precios antiguos" → monitoring: **no** hay relación real (antigüedad = heurística de `priceDate` del catálogo;
  monitoring = fuentes configuradas). Conectarlos sería una relación falsa. Evitar.
- KPIs "Bajo monitoreo"/"Activas" → filtro: "Activas" no mapea a una sola key → dejar sin enlace (o "Bajo monitoreo" → `?status=all`).

## 10. Tabla

| Filtro/deep-link | Datos disponibles | Dónde viviría la lógica | Riesgo | Recomendación |
|---|---|---|---|---|
| status=healthy/overdue/error/paused | enabled/isOverdue/hasFailureAlert/consecutiveFailures | `lib/pricing/monitor-ui.ts` (`filterTargetsByStatus`) + page server | **bajo** | **Sí (núcleo V5.2.2b)** |
| Pills de filtro (UI) | — | `<Link>` server-rendered (sin isla client) | bajo | Sí (server-side) |
| KPI Atrasadas/Pausadas/Con error → `?status=` | summary + targets | page server (href en KpiCard) | bajo | Sí |
| KPI Cambios pendientes → review | pendingChangesCount | ya existe | bajo | Conservar |
| `/catalog → monitoring` | — | catalog page (server) link/KPI | bajo | Sí |
| `review → monitoring` | — | review page link | bajo-medio | Sí (si la page lo permite) |
| supplier=missing | supplierName | helper neutro | bajo | Opcional |
| changes=pending (filtro tabla) | — (es summary) | — | — | **No (usar review)** |
| search en monitoring | — | — | — | Diferir |
| FilterPills client en monitoring | — | client island | medio (server/client) | **No (innecesario)** |

## 11. Propuesta de implementación V5.2.2b
- **Helper neutro** (`lib/pricing/monitor-ui.ts`): `MonitorFilterStatus = 'all'|'healthy'|'overdue'|'error'|'paused'`,
  `parseMonitorStatus(raw)` (normaliza/ default 'all'), `filterTargetsByStatus(targets, status)` (usa getMonitorTargetStatus, tolerante).
- **`monitoring/page.tsx`** (server): leer `searchParams.status` (Promise), filtrar `targets` con el helper, render de
  **pills `<Link>`** (Todos/Saludables/Atrasadas/Con error/Pausadas con conteos), y hacer **accionables** los KPIs
  Atrasadas/Pausadas/Con error (href `?status=`). Empty state si el filtro no arroja targets.
- **`/catalog`** (server): acceso "Monitoreo" → `/catalog/monitoring` (KPI/acción).
- **`/catalog/prices/review`**: enlace cruzado → `/catalog/monitoring` (si la page lo permite sin tocar su lógica).
- Consistencia V4.2/dark; acciones/cron/actions intactas.

## 12. Tests recomendados
- `monitor-ui.test.ts` (extender): `parseMonitorStatus` (valores válidos/ inválidos→all), `filterTargetsByStatus` (cada
  key, tolerante a null), y guard server/client (helper sin `'use client'`; page importa filtro del módulo neutro y solo
  componentes de monitor-controls).
- Check de fuente: el page contiene los hrefs `?status=overdue|paused|error` y el enlace `/catalog → monitoring`.

## 13. Validación manual autenticada requerida
⚠️ **No basta HTTP 307.** Validar con sesión: `/catalog/monitoring`, `?status=overdue|paused|error|healthy|all`,
KPIs clicables, pills, empty state filtrado, deep-link a review y a price-intelligence, `/catalog`, `/catalog/prices/review`,
`/apu`. Checklist light/dark + server/client.

## 14. Prompt sugerido V5.2.2b
```
ICONIC_OPS_PRICE_MONITORING_FILTERS_DEEPLINKS_V5_2_2B

Objetivo: filtros por estado + deep-links en /catalog/monitoring, SERVER-SIDE (sin isla client), datos existentes.
Base: main = 7e9cb8d, tag iconic-ops-price-monitoring-panel-v5-2-2a. Repo construction-ops. No -1rqh.
Rama: feature/price-monitoring-filters-deeplinks-v5-2-2b (desde origin/main). No merge/tag/deploy.

REGLA SERVER/CLIENT (lección P0): filtrar en el Server page leyendo searchParams; lógica de filtro en el módulo
NEUTRO lib/pricing/monitor-ui.ts; pills = <Link> server-rendered (sin useState/isla client). NUNCA importar
helpers desde monitor-controls.tsx ('use client'); de ahí solo componentes.

Alcance (UI/UX, datos existentes):
1. Helper neutro: MonitorFilterStatus + parseMonitorStatus + filterTargetsByStatus (tolerante).
2. page server: leer searchParams.status, filtrar targets, render pills <Link> (Todos/Saludables/Atrasadas/Con
   error/Pausadas con conteos) + empty state filtrado.
3. KPIs Atrasadas/Pausadas/Con error → href ?status=overdue|paused|error. Cambios pendientes → review (conservar).
4. Acceso /catalog → /catalog/monitoring; enlace review → monitoring. Target → price-intelligence (conservar).
5. Consistencia V4.2/dark. Acciones (RunNow/Toggle/Cadence)/cron/actions intactas.

NO tocar: cron/actions/repo monitor, Supabase/RLS/Auth/envs, read-model, cálculos, unit_price_snapshot, sync,
aprobación, scraper, dashboard countdown, -1rqh. Sin backend. Sin FilterPills client en monitoring.

Validación: render AUTENTICADO en preview (no solo 307) + light/dark + checklist server/client. QA completa.
Preview por PR (construction-ops). No merge sin validación visual autenticada.
```

## 15. Confirmación
NO merge · NO tag · NO producción. Solo diagnóstico + plan en rama docs `feature/price-monitoring-filters-deeplinks-v5-2-2b-planning`.
