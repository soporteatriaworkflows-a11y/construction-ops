# CATALOG_PRICE_CONTROL_CENTER_V5_2_1 — Catálogo como centro de control de precios

## Objetivo
Que `/catalog` ayude a entender de inmediato el estado de precio de cada recurso (aprobado/pendiente/sin
precio), si tiene proveedor y qué tan antiguo es el precio — para saber qué revisar antes de cotizar.
UI/UX sobre datos existentes; **sin backend, sin inventar datos**.

## Datos disponibles (existentes)
`CatalogResourceView`: `priceStatus` (approved/pending/rejected/none), `approvedPrice`, `pendingPrice`,
`supplierName` (interno), `priceDate`. El explorer ya filtraba por estado/proveedor con badges.

## Estados usados (reales/derivables)
Aprobado · Pendiente · Rechazado · Sin precio (de `priceStatus`) · Con/Sin proveedor (`supplierName`) ·
**Antigüedad** del precio (de `priceDate`).

## Filtros / deep-links
- KPI band de `/catalog` **accionable** (deep-link que siembra el filtro del explorer vía searchParams):
  - `?status=approved` (Aprobados) · `?status=pending` (Pendientes) · `?status=none` (Sin precio)
  - `?provider=missing` (Sin proveedor) · `?age=old` (Precios antiguos)
- El explorer (`useState` interno) ahora acepta `initialStatus/initialProvider/initialAge` desde la page
  (cambio UI menor, sin backend). Nuevos filtros: **Antigüedad** (Todas/Reciente/Antiguo/Sin fecha) y
  **Sin proveedor** en el selector de proveedor.

## Antigüedad del precio + umbral
- Helper PURO `priceAgeDays(priceDate)` (días desde `priceDate`) + `isOldPrice` con **umbral UI = 90 días**
  (`PRICE_OLD_THRESHOLD_DAYS`). En la fila: "hace Nd" y, si ≥90d, "· revisar" (ámbar) con tooltip "requiere revisión".
- **NO se usa la palabra "vencido"** como verdad de backend: es heurística visual sobre `priceDate`.

## Acciones reales (sin botones falsos)
Por fila, el enlace contextual existente: `Agregar precio` (none) / `Revisar precios` (pending) /
`Ver observaciones` (resto) → `/catalog/resources/[id]/price-intelligence` (ruta real). KPI "Revisar precios"
→ `/catalog/prices/review` (centro real). No se crearon acciones nuevas.

## Qué NO se inventó / queda para backend
- **Fuente del precio (manual/importado/proveedor)**: NO está en `CatalogResourceView` → requiere read-model (backend). No mostrado.
- **"Vencido" autoritativo** (por cadencia): vive en el monitor (`next_check_at`), no en el catálogo → backend.
- Historial agregado, aprobación nueva, scraper/agente: backend (V5.2.2/.3 / V5.4). No tocados.

## Rutas/archivos intervenidos
- `app/(dashboard)/catalog/page.tsx` (searchParams + KPI band accionable + "Precios antiguos" + props al explorer).
- `app/(dashboard)/catalog/catalog-explorer.tsx` (helpers de antigüedad + filtros age/sin-proveedor + badge de antigüedad + filtros iniciales).
- `tests/unit/catalog/catalog-price-control.test.ts` (nuevo; lógica pura + checks).

## Qué NO se tocó
Supabase/RLS/policies/migrations/Auth/envs/secrets/Vercel/cálculos/fórmulas/exports/datos/RPCs/read-model
(salvo leer)/permisos/`unit_price_snapshot`/sync BOQ/lógica de aprobación/cron/APU V5.1/Workspace V3C/companion/
filtro Sin APU/`construction-ops-1rqh`. Dark/light heredan el sistema V4.2 (la tabla usa tokens/remaps).

## QA
typecheck 0 · lint 0 · tests `catalog-price-control` (+`catalog-filter`) 13/0 · suite **2146/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.

## Pendientes V5.2.2 / V5.2.3
- Integrar Monitoreo (overdue/errored/pending reales) como panel del centro de precios (interno).
- Refinar Review center + Price Intelligence (historial/timeline/deltas) sobre observaciones reales.
- (Backend) fuente del precio en la lista + "vencido" autoritativo.
