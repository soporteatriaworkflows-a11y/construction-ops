# V5.2.2c — Corridas / timeline del monitor · Planning

> Solo diagnóstico + plan. Sin código/merge/tag/deploy. Base: `origin/main = 59ab4bb`. Proyecto `construction-ops` (NO `-1rqh`).

## 1. Estado actual de main
`origin/main = 59ab4bb`. Ancestros ✅: V5.2.2a `d499638`; V5.2.2b merge `0bae47d` + closeout `59ab4bb`.

## 2. V5.2.2b released ✅
Tag `iconic-ops-price-monitoring-filters-deeplinks-v5-2-2b` → `0bae47d`.

## 3. Rutas auditadas
`/catalog/monitoring` (sección "Corridas recientes"), `server/pricing/monitor/types.ts`, `/api/cron/price-monitor`,
relación con `/catalog/prices/review` y `/catalog/resources/[id]/price-intelligence`.

## 4. Archivos/componentes auditados
- `monitoring/page.tsx` — **Server Component**; `repo.listRecentRuns(viewer, 5)`; ya renderiza cada run con
  `runStatusBadge` + trigger + `formatDate(startedAt)` + counters (checked/unchanged/changed/pendingCreated/failed) + errorSummary.
- `lib/pricing/monitor-ui.ts` — helper NEUTRO (estado/fechas/filtros). Sin helpers de runs aún.
- `server/pricing/monitor/types.ts` — modelo de runs.

## 5. Riesgo server/client
**BAJO.** La sección de corridas vive en el **Server page** y es markup + `formatDate`. V5.2.2c se mantiene
**server-rendered** (timeline = markup, sin estado). Cualquier derivación nueva (duración, tiempo relativo) va al
**módulo neutro** `lib/pricing/monitor-ui.ts`. **No** se necesita isla client; **no** importar helpers de `monitor-controls.tsx`.

## 6. Datos reales disponibles para runs (`MonitorRunView`)
- `id`, `triggerType` ('scheduled'|'manual'), `status` ('running'|'completed'|'partial'|'failed'),
  `startedAt`, `finishedAt` (nullable), `counters: Partial<{checked, unchanged, changed, pendingCreated, failed}>`,
  `errorSummary` (nullable). **Todo esto YA se muestra** en la lista de corridas (desde V5.2.2a).

## 7. Datos que NO existen en la vista (→ backend)
- **Detalle por target dentro de una corrida**: los `outcomes`/`TargetCheckOutcome[]` (unchanged/changed/pending_created/
  unreachable/blocked/parse_failed/invalid_response) viven en el **write-path** (RecordResult/repo), **NO** en `MonitorRunView`.
- **duration** como campo: no existe (pero **derivable** de startedAt→finishedAt en UI).
- `triggeredBy` (usuario), `source`, `createdAt/updatedAt`, logs completos, conteo histórico agregado: no expuestos.
- `listRecentRuns` está fijo a **5** corridas.

## 8. Qué se puede mostrar sin backend (UI/UX sobre `MonitorRunView`)
- **Duración** derivada (startedAt→finishedAt): "duró 2m 10s" / "en curso" si `finishedAt` null.
- **Tiempo relativo** de `startedAt` ("hace 3 h") junto a la fecha exacta.
- **Timeline visual** simple (server-rendered) de las corridas recientes: punto de estado + trigger + tiempo + counters como chips.
- **Counters como chips etiquetados** (Revisados / Sin cambio / Cambios / Fallos) en vez de texto corrido.
- **Callout "última corrida fallida/parcial"** si la más reciente es `failed`/`partial` (con su `errorSummary`).
- **Empty state** ya existe ("Aún no hay corridas del monitor.").

## 9. Qué requiere backend (NO ahora)
Detalle por target dentro de la corrida (exponer outcomes en el read-model), historial agregado / más de 5 corridas con
paginación real, logs completos, retry manual, descargar reporte, crear corrida (runMonitorNow ya existe como acción),
dashboard countdown agregado, nuevas tablas/migraciones/eventos.

## 10. Tabla

| Área | Datos disponibles | Quick win UI/UX | Requiere backend | Riesgo | Recomendación |
|---|---|---|---|---|---|
| Lista de corridas | status/trigger/startedAt/finishedAt/counters/errorSummary | timeline + chips de counters + estado | no | bajo | Opcional (polish) |
| Duración de corrida | startedAt + finishedAt | derivar "duró Xm Ys" / "en curso" | no | bajo | **Sí (valor real)** |
| Tiempo relativo | startedAt | "hace X" + fecha exacta en title | no | bajo | Sí |
| Callout última fallida | status + errorSummary | InlineCallout si failed/partial | no | bajo | Sí |
| Detalle por target en run | outcomes (write-path) | — | **sí (read-model)** | — | Diferir |
| Más de 5 corridas / paginación | listRecentRuns fijo 5 | (subir límite = leer más del repo existente) | parcial | bajo-medio | Opcional |
| Logs/retry/descargar/crear run | — | — | **sí** | alto | **No** |

## 11. Propuesta V5.2.2c
- **Alcance mínimo (recomendado):** **timeline ligero server-rendered** de corridas con **duración derivada**,
  **tiempo relativo**, **counters como chips** y **callout de última corrida fallida/parcial**. Helpers de
  duración/relativo en `lib/pricing/monitor-ui.ts` (neutro). Sin backend, sin tocar cron/actions, server-safe.
- **Alcance recomendado = el mínimo** (el valor incremental es modesto; la lista ya es informativa).
- **Qué NO hacer:** detalle por target dentro de la corrida (backend), logs/retry/descargar/crear run, tocar cron/actions,
  paginación real, dashboard countdown.

## 12. ¿Vale la pena V5.2.2c?  (honesto)
**Parcialmente.** Lo de alto valor de Price Intelligence ya está hecho (panel V5.2.2a + filtros/deep-links V5.2.2b). La
lista de corridas **ya muestra todos los campos reales**. V5.2.2c sólo añade **polish** (duración, tiempo relativo,
timeline, callout). **Dos caminos válidos:**
- (A) **Hacer un V5.2.2c ligero** (1 sesión corta, riesgo bajo) por el remate visual de las corridas.
- (B) **Cerrar Price Intelligence aquí** y pasar a otro frente (V5.2.3 Review center, o V5.4 backend del countdown/notas),
  porque lo que falta de verdad en monitoreo ya es backend.
**Recomendación:** si quieres rematar el módulo, (A) ligero; si priorizas valor nuevo, (B) cerrar y avanzar. Yo me inclino
por **(A) ligero como cierre prolijo** y luego saltar a un frente con más valor (Review center o backend).

## 13. Tests recomendados (si se implementa A)
`formatRunDuration` (startedAt/finishedAt; finishedAt null → "en curso"; tolerante a inválidos), `formatStartedRelative`,
y guard server/client (page sin `'use client'`; helpers desde el módulo neutro). Checks de fuente del timeline/callout.

## 14. Validación manual autenticada requerida (si se implementa)
⚠️ No basta 307. Con sesión: `/catalog/monitoring` (timeline de corridas, duración, counters, callout de fallida),
`?status=…` intacto, `/catalog`, `/catalog/prices/review`, `/apu`; light + dark.

## 15. Prompt sugerido V5.2.2c (alcance A ligero)
```
ICONIC_OPS_PRICE_MONITORING_RUNS_TIMELINE_V5_2_2C

Objetivo: remate visual de "Corridas recientes" en /catalog/monitoring (Server Component) usando SOLO MonitorRunView.
Server-rendered, sin backend, sin tocar cron/actions, sin isla client.
Base: main = 59ab4bb, tag iconic-ops-price-monitoring-filters-deeplinks-v5-2-2b. Repo construction-ops. No -1rqh.
Rama: feature/price-monitoring-runs-timeline-v5-2-2c (desde origin/main). No merge/tag/deploy.

REGLA SERVER/CLIENT (P0): helpers nuevos (duración/relativo) en lib/pricing/monitor-ui.ts (neutro); page server-rendered;
NUNCA importar helpers de monitor-controls.tsx; sin isla client.

Alcance (UI/UX, datos existentes):
1. Helper neutro: formatRunDuration(startedAt, finishedAt) ("duró Xm Ys" / "en curso" / tolerante) + formatStartedRelative.
2. Timeline ligero server-rendered de las 5 corridas: punto de estado + trigger + tiempo relativo (fecha en title) +
   duración + counters como chips (Revisados/Sin cambio/Cambios/Fallos) + errorSummary.
3. Callout InlineCallout si la corrida más reciente es failed/partial (con errorSummary).
4. Consistencia V4.2/dark. Empty state existente conservado.

NO: detalle por target dentro de la corrida (backend), logs/retry/descargar/crear run, paginación, cron/actions,
dashboard countdown, read-model, -1rqh. Solo presentación + 2 derivaciones puras.

Validación: render AUTENTICADO en preview (no solo 307) + light/dark + checklist server/client. QA completa. Preview por PR. No merge sin validación.
```

## 16. Confirmación
NO merge · NO tag · NO producción. Solo diagnóstico + plan en rama docs `feature/price-monitoring-runs-timeline-v5-2-2c-planning`.
