# PRICE_INTELLIGENCE_UI_ONLY_CLOSEOUT_V5_2

Fase: `ICONIC_OPS_PRICE_INTELLIGENCE_CLOSEOUT_AND_V5_4_BACKEND_PLANNING`
Fecha: 2026-06-27
Proyecto: ICONIC OPS / Construction Ops
Produccion: https://construction-ops-psi.vercel.app
Proyecto Vercel correcto: `construction-ops`

Este documento cierra formalmente el bloque Price Intelligence UI-only V5.2.x y deja explicito que el siguiente avance relevante debe pasar por backend/read-model/RLS planificado. No autoriza migraciones, deploys ni cambios de logica.

## Estado final Price Intelligence UI-only

El bloque UI-only queda cerrado sobre `main` con los siguientes hitos:

| Corte | Merge | Closeout | Tag |
| --- | --- | --- | --- |
| V5.2.1 Catalog Price Control Center | `e3f51a7` | `5107086` | `iconic-ops-catalog-price-control-center-v5-2-1` |
| P0 Hotfix `/catalog` runtime | `0287c23` | `3170207` | `iconic-ops-catalog-runtime-hotfix-v5-2-1` |
| V5.2.2a Price Monitoring Panel | `d499638` | `7e9cb8d` | `iconic-ops-price-monitoring-panel-v5-2-2a` |
| V5.2.2b Filters + Deep-links | `0bae47d` | `59ab4bb` | `iconic-ops-price-monitoring-filters-deeplinks-v5-2-2b` |
| V5.2.2c Runs Timeline | `e659229` | `32b810b` | `iconic-ops-price-monitoring-runs-timeline-v5-2-2c` |

Quedo completo sin backend nuevo:

- Catalogo como centro de control de precios, con KPIs accionables y lectura por estados.
- Estados de precios visibles: aprobado, pendiente, rechazado/sin precio segun el modelo existente.
- Filtros y deep-links server-side para monitoreo (`all`, `overdue`, `paused`, `error`, saludable por exclusion).
- Monitoring panel en `/catalog/monitoring` usando backend existente.
- Targets atrasados, con error, pausados y saludables representados sin inventar datos.
- Runs timeline V5.2.2c con duracion, estado relativo y counters desde `price_monitor_runs`.
- Acciones existentes intactas: revisar ahora, pausar/reanudar target, cambiar cadencia, crear target, aprobar/rechazar observaciones single/bulk.
- Guardas server/client reforzadas: helpers neutrales para Server Components; componentes interactivos aislados en client components.
- Dark/light OK para el alcance UI-only liberado.

## Backend existente que soporta el bloque

Price Intelligence no es solo UI: ya existe una base backend previa que V5.2 consumio sin modificar:

- `resource_price_observations`: observaciones append-only con `pending`, `approved`, `rejected`, `expired` permitido por schema.
- `price_observation_batches`: procedencia durable de importaciones.
- `price_observation_bulk_actions`: auditoria e idempotencia de aprobacion/rechazo masivo.
- `price_monitor_targets`: fuentes monitoreadas, `next_check_at`, `last_checked_at`, `last_success_at`, `consecutive_failures`.
- `price_monitor_runs`: corridas por organizacion con `trigger_type`, `status`, `counters`, `error_summary`.
- `price_monitor_results`: resultado por target y corrida, con status, precio detectado, warnings y observacion pending vinculada cuando aplica.
- Cron real: `GET /api/cron/price-monitor`, protegido por `CRON_SECRET`.
- Server actions reales para monitor y revision de precios.

## Que quedo fuera por requerir backend

Ya no conviene seguir puliendo estas piezas solo con UI:

- Countdown real en dashboard: hoy el dashboard muestra un valor ilustrativo/hardcoded. El dato real debe derivarse de `price_monitor_targets.next_check_at` y exponerse en `getMonitoringSummary` o query equivalente.
- Notas reales: `NotesCard` es estatica, sin tabla, RLS, repository ni server actions.
- Detalle por target dentro de cada corrida: existe `price_monitor_results`, pero falta vista/repository enriquecido por run con joins a target, recurso y proveedor.
- Historial profundo de resultados: existe base append-only, pero falta paginacion, limites, criterio de retencion y UI ligada a lectura por run/target.
- Logs/retry/download: no hay contrato de logs descargables ni reintento granular por resultado fallido.
- Fuente/historial de deltas mas rico: las observaciones son append-only y tienen source basico, pero no hay event log dedicado para cambios de estado/deltas narrativos.
- Vencimiento autoritativo: `expired` existe como status permitido, pero el vencimiento actual se calcula runtime (`isStale`). Persistir expiracion requeriria decision de producto y proceso backend.

## Riesgos ya aprendidos

- No validar rutas protegidas solo con 307. Para release, validar comportamiento autenticado o al menos confirmar que el redirect termina sano y que la ruta no rompe en render server.
- No importar helpers desde modulos `'use client'` hacia Server Components. Los helpers compartidos deben vivir en modulos neutrales.
- No mezclar UI-only con backend sin plan de RLS. Cada escritura nueva necesita tabla, policies, tests y contrato de privacidad.
- No tocar BOQ/APU/snapshots desde Price Intelligence. Price Intelligence propone, observa y aprueba precios; no reescribe presupuestos ni snapshots historicos.
- No convertir datos ilustrativos en producto. Si un dato no existe en backend, debe mostrarse como pendiente/no disponible o implementarse correctamente.

## Cierre formal

Price Intelligence UI-only V5.2 queda cerrado. El siguiente bloque debe ser V5.4 Backend con cambios pequenos, verificables y reversibles, empezando por el menor riesgo: countdown real de monitoreo en dashboard sin migracion nueva.

## Confirmaciones

- No se implemento codigo en este cierre.
- No se crearon migraciones.
- No se toco Supabase remoto, RLS, policies, Auth, envs/secrets, Vercel config, BOQ/APU, exports, datos reales, RPCs, cron logic ni server action logic.
- No se toco `construction-ops-1rqh`.
