# P2D OPS Infrastructure & Performance Baseline

Fecha: 2026-07-07  
Rama: `feature/p2d-infra-performance-fix`  
Base: `origin/main` @ `ee59405` (`feat(steel): complete DXF longitudinal beam dispatch (F8E) (#69)`)

## Resumen ejecutivo

P2D-0/P2D-1 inicia desde `origin/main` en un worktree separado para no interferir con ramas activas de Steel Ops. No se monta VPS, no se cambian secretos, no se ejecutan migraciones y no se modifica lógica funcional de Steel Ops.

La base contiene el hardening P0B esperado para Postgres: `DEFAULT_POSTGRES_POOL_MAX = 1` en `apps/web/lib/db/index.ts`, con override opt-in por `POSTGRES_POOL_MAX`/`DB_POOL_MAX` y clamp máximo de 10.

Esta fase agrega instrumentación liviana y apagada por defecto para medir rutas críticas y operaciones de repositorio/read-model sin exponer datos sensibles. Los logs se emiten solo si `OPS_PERF_LOGS=true`.

## Rama base usada

- Worktree: `D:\ICONIC\SOFTWARE PRESUPUESTOS\construction-ops-p2d`
- Rama nueva: `feature/p2d-infra-performance-fix`
- Tracking inicial: `origin/main`
- Commit base: `ee59405`
- Rama original no tocada: `feature/v5-6-3a-invitation-email-fallback-ux`

## Riesgos de divergencia detectados

- La rama original de trabajo no era `main` y tenía archivos no versionados; por eso se creó worktree separado.
- `origin/main` ya incluye cambios activos de Steel Ops F8E. Esta fase no modifica archivos bajo `apps/web/lib/steel` ni `apps/web/app/(dashboard)/steel`.
- No se detectó divergencia peligrosa en pool Postgres: `DEFAULT_POSTGRES_POOL_MAX = 1` está presente en la base.

## Rutas críticas encontradas

- `/dashboard`: `apps/web/app/(dashboard)/dashboard/page.tsx`
- Budget workspace: `apps/web/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx`
- `/quantities`: `apps/web/app/(dashboard)/quantities/page.tsx`
- Planning/Gantt list: `apps/web/app/(dashboard)/planning/page.tsx`
- Planning/Gantt detail: `apps/web/app/(dashboard)/planning/[scheduleId]/page.tsx`
- Monitoring: `apps/web/app/(dashboard)/catalog/monitoring/page.tsx`
- Exports: `apps/web/app/api/exports/route.ts` y `apps/web/server/exports/export-service.ts`
- Read model DB/RLS: `apps/web/server/read-model/drizzle-repository.ts`
- Planning service/repository: `apps/web/server/planning/service.ts`, `apps/web/server/planning/repository.ts`
- Steel Ops analizado solo como superficie de inventario: `apps/web/lib/steel/**`, `apps/web/app/(dashboard)/steel/**`

## Archivos tocados

- `.env.example`
- `apps/web/server/performance/ops-perf.ts`
- `apps/web/app/(dashboard)/dashboard/page.tsx`
- `apps/web/app/(dashboard)/quantities/page.tsx`
- `apps/web/app/(dashboard)/catalog/monitoring/page.tsx`
- `apps/web/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx`
- `apps/web/server/planning/service.ts`
- `apps/web/server/exports/export-service.ts`
- `apps/web/server/read-model/drizzle-repository.ts`
- `docs/audits/P2D_INFRA_PERFORMANCE_BASELINE.md`

## Puntos probables de lentitud

- Workspace de presupuesto: carga secuencial de items por capitulo (`listItemsByChapter` por capitulo). Es conservador para pool P0B, pero puede ser lento en presupuestos grandes.
- Planning list: lista cronogramas y luego carga tareas por cronograma para calcular conteos y avance.
- Planning detail/Gantt: carga schedule, tasks y dependencies; puede crecer con cronogramas grandes.
- Monitoring: lista targets/runs/summary y luego resultados por run en la pagina.
- Dashboard: combina proyectos, resumen de dashboard y quick notes; depende del read-model y RLS.
- Quantities: resuelve proyecto destacado, overview, grupos de cantidades y lotes importados.
- Exports: consulta overview, estimate detail, schedule/dashboard opcional y genera XLSX/PDF en memoria.
- Read-model DB: cada operacion abre transaccion RLS-scoped; es correcto para seguridad, pero requiere medir duracion por operacion.

## Que se instrumento

Se agrego `apps/web/server/performance/ops-perf.ts` con:

- `isOpsPerfLoggingEnabled()`
- `withOpsPerfSpan(route, span, fn, metadata)`
- `createOpsPerfTrace(route, metadata)`

Los logs tienen formato JSON en `console.info`:

```json
{"event":"ops.perf","route":"/planning","span":"planning.repo.listSchedules","ok":true,"durationMs":12}
```

Metadatos permitidos: ruta logica, nombre del span, duracion, estado, conteos agregados, formato/perfil de export, rol y flags booleanos. No se loguean UUIDs, nombres de proyecto, montos, URLs, secretos ni datos internos.

Instrumentacion aplicada:

- `/dashboard`: `resolveViewer`, `listProjects`, `getDashboardSummary`, `getDashboardQuickNotes`, resumen total.
- Budget workspace: `resolveViewer`, `getEstimateById`, `listChaptersByEstimateVersion`, carga secuencial de items por capitulo, resumen financiero, AIU, APUs para agregar, resumen total.
- `/quantities`: viewer, proyectos, overview, cantidades, batches importados, resumen total.
- `/catalog/monitoring`: targets, recent runs, summary, resumen total.
- Planning service: list schedules, tasks por schedule, detail schedule/tasks/dependencies.
- Exports: read-model calls y generacion XLSX/PDF en memoria.
- Drizzle read-model: duracion de la transaccion RLS-scoped por operacion.

## Como activar/desactivar logs

Por defecto estan apagados.

Activar solo en local/staging:

```bash
OPS_PERF_LOGS=true
```

Desactivar:

```bash
OPS_PERF_LOGS=false
```

Valores aceptados como true: `1`, `true`, `yes`, `on`.

Produccion debe permanecer apagada salvo diagnostico explicito y temporal.

## Proximos pasos recomendados

1. Ejecutar flujos manuales con `OPS_PERF_LOGS=true` en staging/local DB y capturar logs por ruta.
2. Priorizar por `durationMs` y cantidad de spans: dashboard, workspace, planning, quantities, monitoring, exports.
3. Convertir fan-out medido en queries agregadas o read models:
   - Workspace: loader por version que traiga capitulos + items en batch.
   - Planning list: summary por schedule con conteos y avance en query/RPC/view.
   - Monitoring: resultados recientes por runs en una sola consulta.
4. Revisar `EXPLAIN ANALYZE` de queries lentas y RLS antes de agregar indices.
5. Mantener `DEFAULT_POSTGRES_POOL_MAX = 1` hasta tener evidencia de capacidad del pooler.
6. Para exports/imports pesados, preparar jobs asincronicos y storage antes de considerar VPS.
7. Evaluar backend/worker Docker solo para Steel/DXF/PDF/import-export pesados cuando haya tiempos reales que excedan el modelo Vercel.

## Checklist de seguridad de esta fase

- Sin migraciones.
- Sin `db push`.
- Sin cambios en Supabase config/policies.
- Sin secretos ni envs reales.
- Sin deploy.
- Sin cambios funcionales en Steel Ops.
- Logs apagados por defecto.
- Logs sin IDs, montos, URLs ni datos sensibles.

## P2D-2 Measurement Results

Fecha de medicion: 2026-07-07
Entorno: local dev (`pnpm.cmd dev`)
Variables de sesion usadas: `OPS_PERF_LOGS=true`, `APP_AUTH_MODE=demo`, `READ_MODEL_SOURCE=fixture`
Produccion: no tocada. Vercel envs: no tocados. Supabase: no tocado.

### Como activar logs para medicion local

PowerShell, solo para la sesion local:

```powershell
$env:OPS_PERF_LOGS='true'
$env:APP_AUTH_MODE='demo'
$env:READ_MODEL_SOURCE='fixture'
pnpm.cmd dev
```

Los logs aparecen en stdout del servidor Next con eventos JSON `ops.perf`. Para desactivar:

```powershell
$env:OPS_PERF_LOGS='false'
```

No activar `OPS_PERF_LOGS` en produccion. Si se usa Vercel Preview, activarlo solamente en Preview/Development y revertirlo despues de la medicion.

### Procedimiento exacto usado

1. Se inicio servidor local en el worktree P2D con `OPS_PERF_LOGS=true`.
2. Se ejecuto una pasada de warm-up para compilar rutas en Turbopack.
3. Se ejecuto una segunda pasada de medicion contra rutas criticas con `Invoke-WebRequest`.
4. Se extrajeron logs `ops.perf` y lineas `GET ... in ...` del stdout local.
5. Se detuvo el servidor local.

Fixture usado para rutas profundas:

- Project: `00000000-0000-4000-8000-000000000010`
- Scope: `00000000-0000-4000-8000-000000000021`
- Estimate: `00000000-0000-4000-8000-0000000000b0`
- Version: `00000000-0000-4000-8000-0000000000b1`

### Rutas medidas

| Ruta | HTTP | Tiempo HTTP aprox. | Payload aprox. | Observacion |
| --- | ---: | ---: | ---: | --- |
| `/dashboard` | 200 | 345 ms | 179 KB | 4 spans `ops.perf`, request total 79 ms |
| `/projects/.../workspace` | 200 | 437 ms | 294 KB | 6 spans, 14 capitulos, 131 items |
| `/quantities` | 200 | 172 ms | 85 KB | 4 spans, 1 grupo, 0 batches |
| `/planning` | 200 | 128 ms | 54 KB | Sin spans P2D en demo; pagina responde rapido |
| `/catalog/monitoring` | 200 | 243 ms | 123 KB | 3 spans, 1 target, 4 runs |
| `/api/exports?format=xlsx-client...` | 200 | 61 ms | 17.5 KB | Generacion XLSX 29 ms |
| `/steel` | 404 | 191 ms | n/a | No medible en este entorno local demo |
| `/steel/takeoffs` | 404 | 166 ms | n/a | No medible en este entorno local demo |

Nota: la primera pasada tuvo tiempos altos por compilacion dev/Turbopack (`/dashboard` 10.7 s, workspace 4.8 s, export 21.2 s). Esos tiempos se descartan como warm-up, no como performance de aplicacion.

### Evidencia de spans relevantes

- `/dashboard`
  - `auth.resolveViewer`: 11 ms
  - `readModel.listProjects`: 0 ms
  - `readModel.getDashboardSummary`: 3 ms
  - `quickNotes.getDashboardQuickNotes`: 1 ms
  - `request.total`: 79 ms, `projectCount=1`, `noteCount=2`

- Budget workspace
  - `estimates.repo.getEstimateById`: 0 ms
  - `estimates.repo.listChaptersByEstimateVersion`: 1 ms
  - `estimates.repo.listItemsByChapter.sequential`: 2 ms, `chapterCount=14`
  - `estimates.repo.calculateEstimateFinancialSummary`: 0 ms
  - `request.total`: 10 ms, `chapterCount=14`, `itemCount=131`

- `/quantities`
  - `readModel.getProjectOverview`: 2 ms
  - `readModel.listQuantities`: 0 ms
  - `request.total`: 7 ms, `groupCount=1`, `batchCount=0`

- `/catalog/monitoring`
  - `monitor.repo.listTargets`: 0 ms
  - `monitor.repo.listRecentRuns`: 0 ms, `limit=5`
  - `monitor.repo.getMonitoringSummary`: 0 ms
  - `request.total`: 4 ms, `targetCount=1`, `runCount=4`

- `/api/exports`
  - `exports.readModel.getProjectOverview`: 4 ms
  - `exports.readModel.getEstimateDetail`: 2 ms
  - `exports.generate.xlsxClient`: 29 ms

### Hallazgos principales

1. En fixture/local, el costo dominante visible no esta en repositorios sino en render/serializacion/payload de paginas. Ejemplo: workspace tiene `request.total=10 ms` instrumentado, pero HTTP local medido fue 437 ms y payload ~294 KB.
2. Workspace confirma fan-out estructural: `listItemsByChapter.sequential` recorre 14 capitulos para 131 items. En fixture cuesta 2 ms, pero en DB real esto puede convertirse en N+1 sensible por latencia/RLS.
3. Dashboard no muestra lentitud de read-model en fixture (`getDashboardSummary=3 ms`), pero HTTP total 345 ms y payload ~179 KB sugieren que render/payload tambien deben observarse antes de tocar SQL.
4. Export XLSX cliente es barato en fixture (29 ms generacion, 17.5 KB). PDF y paquetes APU no fueron medidos en esta pasada; siguen siendo candidatos a medicion separada por costo CPU/memoria.
5. Planning `/planning` no emitio spans en demo local. La instrumentacion actual esta en `planning/service.ts`; si la pagina no entra por ese flujo en demo o cae a empty/error state, hace falta un span page-level antes de diagnosticar.
6. Steel Ops no fue medible por rutas `/steel` y `/steel/takeoffs` en este entorno local: ambas respondieron 404. No se modifico nada de Steel.
7. No hubo evidencia local suficiente para justificar VPS inmediato. La medicion con fixture confirma primero la necesidad de medir Preview/DB real o local DB antes de mover infraestructura.

### Top 5 cuellos de botella observados o confirmados

1. Budget workspace payload/render: ~294 KB y 437 ms HTTP local medido.
2. Dashboard payload/render: ~179 KB y 345 ms HTTP local medido.
3. Catalog monitoring payload/render: ~123 KB y 243 ms HTTP local medido.
4. Workspace fan-out confirmado por estructura: 14 llamadas secuenciales `listItemsByChapter` para 131 items; bajo DB/RLS puede ser el primer candidato a batch loader.
5. Exports CPU path: `exports.generate.xlsxClient=29 ms` en fixture pequeno; conviene medir PDF/APU package antes de tocar arquitectura.

### Recomendaciones priorizadas para P2D-3

1. Agregar medicion page-level a `/planning` y, si es posible, un contador explicito de schedules/tasks/dependencies cuando la pagina entra al servicio real.
2. Agregar una medicion de Preview o local DB real con `READ_MODEL_SOURCE=db` en una base no productiva para capturar latencia RLS y `readModel.rlsTransaction` real.
3. Priorizar workspace: crear loader batch de capitulos + items por version o read model agregado, despues de confirmar el costo en DB real.
4. Medir exports PDF/client-management y paquetes APU, no solo XLSX cliente.
5. Medir payload/render con un objetivo por ruta: dashboard/workspace/monitoring deben separar tiempo de data access vs render/HTML size.
6. Para monitoring, si DB real confirma costo, reemplazar resultados por run con consulta agregada/batch.

### Que NO conviene optimizar todavia

- No subir `POSTGRES_POOL_MAX`: se debe preservar `DEFAULT_POSTGRES_POOL_MAX=1` hasta tener evidencia de saturacion y capacidad del pooler.
- No montar VPS por esta evidencia local.
- No reescribir Steel/DXF/takeoff: no hubo medicion util de esas rutas en esta pasada.
- No convertir todo a RPC/read models masivos sin medicion DB real.
- No optimizar micro-spans de fixture de 0-4 ms; no representan costo Postgres/RLS real.
- No activar logs en produccion para obtener datos.

### VPS inmediato

Sigue sin justificarse VPS inmediato. La evidencia P2D-2 local apunta a:

- medir DB/RLS real en entorno seguro antes de optimizar;
- reducir fan-out si se confirma costo bajo DB;
- observar payload/render de paginas grandes;
- reservar backend/VPS para jobs pesados confirmados: PDF/APU grandes, imports grandes, DXF/Steel parsing o procesos asincronicos prolongados.
