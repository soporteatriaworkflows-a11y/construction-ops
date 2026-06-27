# PRICE_MONITORING_RUNS_TIMELINE_V5_2_2C — Remate de corridas (timeline ligero)

## Objetivo
Que "Corridas recientes" en `/catalog/monitoring` se lea mejor: estado, tipo, cuándo, **duración**, counters y
errorSummary, con un **timeline server-rendered**. UI/UX sobre `MonitorRunView`; sin backend, sin cron/actions, sin isla client.

## Datos reales usados (`MonitorRunView`)
`id`, `triggerType` (scheduled|manual), `status` (running|completed|partial|failed), `startedAt`, `finishedAt`
(nullable), `counters` (checked/unchanged/changed/pendingCreated/failed), `errorSummary` (nullable).

## Datos que NO existen (no usados)
Detalle por target dentro de la corrida (outcomes viven en write-path, no en la vista), logs completos, `triggeredBy`,
duración como campo (se **deriva** en UI), historial >5/paginación. → backend, no tocados.

## Helpers neutros añadidos (`lib/pricing/monitor-ui.ts`, sin `'use client'`)
`getRunStatusLabel`, `getRunStatusTone`, `formatRunDuration(startedAt, finishedAt, status)` ("Duró Xs/Xm Ys" /
"En curso" / "Sin duración"), `formatRunStartedRelative` ("Hace N min/h", "Ayer", "Hace N días" / "Sin fecha"),
`summarizeRunCounters` (chips; omite ceros salvo "Revisados"), `getLatestProblemRun`. Todos PUROS y tolerantes a
null/undefined/fecha inválida/status desconocido/lista vacía.

## Server/client safety (lección P0)
`/catalog/monitoring` sigue **Server Component**; el timeline es **markup server-rendered** (`<ol>`/`<li>`), sin
`useState` ni isla client. Helpers en el módulo **neutro**; el page no importa de `monitor-controls.tsx`. Guard en tests.

## Cambios UI
- **Timeline** (`<ol>` con borde y puntos de estado por tono) reemplaza la lista plana de corridas.
- Cada corrida: badge de estado (label/tone vía helper), trigger (Programada/Manual), **tiempo relativo** (fecha exacta
  en `title`), **duración derivada**, **counters como chips** (Revisados/Sin cambio/Cambiados/Pendientes/Fallidos; el
  chip "Fallidos">0 en rojo), y `errorSummary` si existe.
- **Callout "Última corrida con incidencias"** (InlineCallout warning) si hay una corrida failed/partial o con errorSummary.
- `runStatusBadge` ahora usa los helpers neutros (label/tone) en vez de un mapa local.

## Qué NO se implementó
Detalle por target en la corrida, logs/retry/descargar/crear corrida, paginación/>5 corridas, dashboard countdown,
cron/actions. (Diferidos / backend.)

## V5.2.2b intacto
Filtros server-side, pills, KPIs clicables, deep-links, empty states, helper neutro y guard server/client: sin cambios.

## Qué NO se tocó
cron/actions/repo monitor, Supabase/RLS/migrations/Auth/envs/Vercel, read-model, cálculos, exports,
`unit_price_snapshot`, sync, aprobación, scraper, dashboard countdown, Catálogo V5.2.1/APU/Workspace/Cantidades,
`construction-ops-1rqh`. (No se tocó `globals.css` ni archivos ajenos del working tree.)

## Validación requerida
⚠️ **Validación manual AUTENTICADA del preview antes de merge** (no solo 307): `/catalog/monitoring` (timeline,
duración, counters, callout), `?status=all|healthy|overdue|error|paused` intacto, `/catalog`, `/catalog/prices/review`,
`/apu`. Light + dark.

## QA
typecheck 0 · lint 0 · tests `monitor-ui` 24/0 · suite verde · build 0 (`/catalog/monitoring` compila) · gm 22/22 · diff-check limpio.

## Pendientes posteriores
Detalle por target dentro de la corrida y countdown agregado en dashboard = backend (read-model). Cierre natural de
Price Intelligence salvo que se autorice backend.
