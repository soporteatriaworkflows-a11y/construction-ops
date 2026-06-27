# PRICE_MONITORING_PANEL_V5_2_2A — Panel operativo de monitoreo (UI/UX)

## Objetivo
Que `/catalog/monitoring` se lea como **panel operativo interno**: cuántas fuentes están bajo monitoreo, pausadas,
atrasadas, con error, con cambios pendientes, y cuándo fue/será la revisión. UI/UX sobre **datos reales existentes**;
sin backend, sin tocar cron/actions, sin inventar datos.

## Datos reales usados
- **MonitoringSummary**: monitoredCount, activeCount, pausedCount, overdueCount, erroredCount, pendingChangesCount, lastRunAt.
- **MonitorTargetView**: enabled, isOverdue, hasFailureAlert, consecutiveFailures, nextCheckAt, lastCheckedAt, supplierName, resourceCode/Name.
- **MonitorRunView**: status, triggerType, startedAt, counters, errorSummary (lista de corridas, ya existente).

## Estados derivados (helper neutro)
`getMonitorTargetStatus(t)` con prioridad **pausado → con error/atención → atrasado → saludable** (de
enabled/hasFailureAlert/consecutiveFailures/isOverdue). Fechas: `formatLastChecked` ("Hoy/Ayer/Hace N días" / "Sin
revisión registrada") y `formatNextCheck` ("En N días/Mañana/Hoy" / "Pendiente (atrasada)" / "Sin próxima revisión").

## Helper neutro (regla server/client)
Nuevo **`lib/pricing/monitor-ui.ts`** — módulo PURO **sin `'use client'`**: `getMonitorTargetStatus`, `relativeDays`,
`formatLastChecked`, `formatNextCheck`. Importado por el **Server Component** `monitoring/page.tsx`. `import type` de
`MonitorTargetView` (solo tipos, se borran en runtime).

## Cómo se evita el riesgo server/client (lección P0)
- `monitoring/page.tsx` (Server) importa de `monitor-controls.tsx` (`'use client'`) **solo componentes**
  (RunNowButton/TargetToggleButton/CadenceForm) — correcto. **No** llama helpers de ese módulo.
- Toda derivación/etiqueta vive en el módulo **neutro** `lib/pricing/monitor-ui.ts`.
- Test `monitor-ui.test.ts` incluye un **guard anti-regresión**: el módulo no declara la directiva `'use client'` y el
  page importa los helpers desde el módulo neutro.

## Cambios
- **Header** → `OperationsHeader` (eyebrow/título/subtítulo + stat "Bajo monitoreo") + back-link a Catálogo.
- **KPI band** (`KpiBand`/`KpiCard`, dark-safe + microcopy): Bajo monitoreo / Activas / Pausadas / Atrasadas / Cambios
  pendientes (deep-link real a `/catalog/prices/review`) / Con error.
- **Callouts** (`InlineCallout`, suaves): errores repetidos, revisiones atrasadas, cambios pendientes (link a review),
  "sin corridas todavía". Solo aparecen si el dato lo amerita.
- **Tabla de targets**: estado vía helper (Pausada/Requiere atención (N fallos)/Atrasada/Saludable); **próxima/última
  revisión** en formato humano (fecha exacta en `title`); columnas/acciones conservadas.
- **Dark**: KPIs/callouts usan tokens; secciones y runs con variantes `dark:` (sin barras claras ni texto ilegible).

## Acciones conservadas (sin tocar lógica)
RunNowButton (revisar ahora), TargetToggleButton (pausar/activar), CadenceForm (frecuencia), enlace a
price-intelligence del recurso. Gateadas a roles internos server-side, igual que antes.

## Qué NO se implementó (backend / fase posterior)
- Filtros por estado + deep-links cruzados → **V5.2.2b** (filtro client con lógica en el módulo neutro).
- Lectura/timeline de corridas y errores más rica → **V5.2.2c**.
- Countdown agregado en dashboard, historial agregado, scraper/agente, nuevas tablas → **backend** (V5.4). NO tocados.

## Qué NO se tocó
cron/actions/repo del monitor, Supabase/RLS/policies/migrations/Auth/envs/Vercel, cálculos, exports, RPCs, read-model,
`unit_price_snapshot`, sync, aprobación, Catálogo V5.2.1 (salvo el deep-link existente a review), APU/Workspace, `construction-ops-1rqh`.

## Validación requerida
⚠️ **Requiere validación manual AUTENTICADA del preview antes de merge** (no basta HTTP 307; este entorno no tiene
sesión/navegador). Rutas: `/catalog/monitoring`, `/catalog`, `/catalog/prices/review`, un
`/catalog/resources/[id]/price-intelligence`, `/apu`. Checklist light/dark + server/client.

## QA
typecheck 0 · lint 0 · tests `monitor-ui` 11/0 · suite verde · build 0 (`/catalog/monitoring` compila) · gm 22/22 · diff-check limpio.

## Pendientes V5.2.2b / V5.2.2c
- b: filtros por estado (client + helper neutro) + deep-links catálogo↔monitoring↔recurso↔review.
- c: corridas/errores + price-intelligence (historial sobre runs reales).
