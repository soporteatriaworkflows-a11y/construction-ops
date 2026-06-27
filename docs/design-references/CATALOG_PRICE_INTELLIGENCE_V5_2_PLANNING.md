# V5.2 — Catálogo / Price Intelligence · Planning

> Solo diagnóstico + plan. Sin código/merge/tag/deploy. Base: `origin/main = 86a55b9` (V5.1 merge `e18050b`
> + closeout `86a55b9`, tag `iconic-ops-apu-operational-depth-v5-1`). Proyecto `construction-ops` (NO `-1rqh`).

## 1. Estado actual / V5.1 released
main = `86a55b9`; `e18050b` (V5.1) + `86a55b9` ancestros ✅; tag `iconic-ops-apu-operational-depth-v5-1` → `e18050b` ✅; tree limpio.

## 2. Rutas/archivos auditados
- `/catalog` (`page.tsx`, `catalog-explorer.tsx`, `actions.ts`), `/catalog/prices/review` (`page.tsx`,
  `review-table.tsx`, `actions.ts`), `/catalog/monitoring`, `/catalog/providers`,
  `/catalog/resources/[resourceId]/price-intelligence/page.tsx`, `/catalog/import`.
- Modelos: `CatalogResourceView` (read-model), `MonitoringSummary` + `MonitorTargetView` (`server/pricing/monitor/types.ts`),
  `ResourcePriceObservationView` (historial), `CatalogPriceStatus`.

## 3. Qué tan real es Price Intelligence hoy (honesto)
**Más real de lo esperado.** Ya existen, con datos reales:
- **Estado de precio** por recurso: `CatalogResourceView.priceStatus` = approved/pending/rejected/none + approvedPrice/pendingPrice + supplierName (interno) + priceDate.
- **Catálogo explorer**: ya filtra por **status** y **proveedor** (+ tipo, búsqueda) con **badges** de estado (FilterPills). `filterResources` es helper PURO.
- **KPI band catálogo** (V4): Recursos/Aprobados/Pendientes/Sin precio/Sin proveedor + link a Revisión.
- **Review center** (`prices/review`): tabla + **acciones reales** de aprobar/rechazar (actions.ts). Feature ya construida.
- **Price intelligence por recurso**: `/catalog/resources/[id]/price-intelligence` muestra **historial real** de observaciones + aprobar (canApprove).
- **Monitoreo**: `MonitoringSummary` (monitoredCount/overdueCount/erroredCount/pendingChangesCount/lastRunAt) + `MonitorTargetView` (lastCheckedAt/nextCheckAt/isOverdue/hasFailureAlert) — datos reales (cron price-monitor).

## 4. Datos reales disponibles
priceStatus, approvedPrice, pendingPrice, supplierName (interno), priceDate · observaciones/historial por recurso ·
monitor: overdue/errored/pending/monitored/lastRunAt + por target nextCheckAt/failures · proveedores (provider filter).

## 5. Estados derivables SIN backend
- Aprobado / Pendiente / Rechazado / Sin precio (de `priceStatus`).
- Sin proveedor (`!supplierName`, solo interno).
- "Precio con antigüedad > N días" desde `priceDate` (heurística UI; NO es "vencido" autoritativo).
- Conteos por estado/proveedor (helper `filterResources` puro).
- Monitoreo: overdue/errored/pending (reales, a nivel de targets monitoreados, interno).

## 6. Qué requiere backend (NO ahora)
- **Fuente del precio (manual / importado / proveedor)** a nivel de la **lista** de catálogo: NO está en `CatalogResourceView`
  (sí aparece en import/observaciones) → exponerlo en el read-model = backend.
- **"Vencido" autoritativo** por cadencia (vive en monitor `next_check_at`, no en el catálogo list).
- Scraper/agente real, historial agregado (más allá del per-recurso), aprobación persistente nueva, próxima-revisión real
  agregada, notas, nuevas tablas, migraciones, RLS.

## 7. Tabla por área

| Área | Estado actual | Datos disponibles | Quick win UI/UX | Requiere backend | Riesgo | Recomendación |
|---|---|---|---|---|---|---|
| **Catálogo (explorer)** | filtra status/proveedor + badges; KPI band V4 | priceStatus, supplier, priceDate, approved/pending | **KPIs accionables** (deep-link a filtro vía URL param), columna "estado de precio", badge "antigüedad >N días", callouts (sin proveedor/sin precio), filtro vencidos | no | **bajo** | **V5.2.1 (empezar)** |
| **Monitoreo** | página + summary real | overdue/errored/pending/monitored/lastRunAt + nextCheckAt | panel "precios bajo monitoreo" dentro del centro de control; accesos | no (countdown real = V5.4) | medio (interno) | V5.2.2 |
| **Review center** | tabla + aprobar/rechazar reales | observaciones pending | refinar UX operativa (agrupar, badges, prioridad) | no (la lógica ya existe) | medio | V5.2.3 |
| **Price intelligence (recurso)** | historial real + aprobar | observaciones | mejorar lectura del historial (timeline, deltas) | no | medio | V5.2.3 |
| **Fuente manual/importado/proveedor (lista)** | no en list view | — | — | **sí (read-model)** | — | diferir (backend) |
| **Vencido autoritativo** | en monitor, no en catálogo | next_check_at (targets) | — | **sí (read-model/derivación)** | — | diferir |

## 8. Roadmap V5.2 (UI/UX, datos existentes)
- **V5.2.1 — Catálogo como centro de control de precios.** KPI band **accionable** (deep-link → filtro del explorer
  sembrado por URL param `?status=`), columna/realce de **estado de precio** (ya hay badges; reforzar), badge de
  **antigüedad** (priceDate > N días, honesto), callouts "sin proveedor"/"sin precio", filtro existente expuesto. Bajo riesgo.
- **V5.2.2 — Integrar Monitoreo (datos reales).** Panel "precios bajo monitoreo" (overdue/errored/pending) + accesos a
  review/intelligence, gateado a roles internos. Sin tocar el cron/lógica.
- **V5.2.3 — Review center + Price Intelligence (UI).** Mejor lectura/priorización de "precios por revisar" e historial
  por recurso (timeline/deltas) sobre observaciones reales; conserva las acciones aprobar/rechazar existentes.

## 9. Por dónde empezar — recomendación
**V5.2.1 (Catálogo).** El estado de precio, proveedor y fecha ya existen y el explorer ya filtra/badgea → máximo valor
con **solo UI/UX** (KPIs accionables + columna estado + antigüedad + callouts), **riesgo bajo**, mismo patrón que V5.1.
Monitoreo (V5.2.2) y Review/Intelligence (V5.2.3) son reales pero más sensibles/internos → después.

## 10. Qué NO tocar
Supabase/RLS/policies/migrations/Auth/envs/secrets/Vercel config/cálculos BOQ/APU/exports/datos reales/RPCs/read-model
(salvo lectura en auditoría)/permisos/`unit_price_snapshot`/sync BOQ/`construction-ops-1rqh`. Fuente de precio y "vencido"
autoritativo NO en V5.2.1 (backend). No tocar la lógica del cron/aprobación (ya existe; solo UI).

## 11. Prompt sugerido V5.2.1
```
ICONIC_OPS_CATALOG_PRICE_CONTROL_V5_2_1

Objetivo: convertir /catalog en un centro de control de precios usando SOLO datos existentes
(CatalogResourceView: priceStatus approved/pending/rejected/none, supplierName, priceDate). UI/UX, sin backend.

Base: main = 86a55b9, tag iconic-ops-apu-operational-depth-v5-1. Repo construction-ops. No -1rqh.
Rama: feature/catalog-price-control-v5-2-1 (desde origin/main). No merge/tag/deploy.

Alcance (UI/UX, datos existentes):
1. KPI band de /catalog ACCIONABLE: Aprobados/Pendientes/Sin precio/Sin proveedor → deep-link que SIEMBRA el filtro
   del explorer (catalog-explorer acepta initial status/provider desde searchParams; hoy usa useState interno).
2. Columna/realce "estado de precio" en el explorer (ya hay badges; reforzar) + badge de ANTIGÜEDAD derivado de
   priceDate (>N días, etiqueta honesta tipo "precio con NN d"), sin afirmar "vencido" autoritativo.
3. Callouts operativos: "sin proveedor", "sin precio", "precios por revisar" (link al review center existente).
4. Consistencia visual V4.2/V5.1 (SurfaceCard/tokens/dark). Sin botones falsos; acciones = flujos/rutas existentes.

NO tocar: read-model (salvo leer), cálculos, unit_price_snapshot, Supabase/RLS/Auth/envs, exports, RPCs, sync BOQ,
lógica de aprobación/cron, datos reales, -1rqh. Sin fuente manual/importado (no está en la vista) ni "vencido" autoritativo (backend).

QA: git diff --check, typecheck, lint, tests afectados, suite, build, gm. Preview por PR (construction-ops, no prod). No merge sin aprobación.
```

## 12. Confirmación
NO merge · NO tag · NO producción. Solo diagnóstico + plan en rama docs `feature/catalog-price-intelligence-v5-2-planning`.
