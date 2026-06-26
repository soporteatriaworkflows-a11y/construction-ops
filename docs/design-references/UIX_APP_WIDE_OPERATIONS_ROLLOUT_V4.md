# UIX_APP_WIDE_OPERATIONS_ROLLOUT_V4 — Identidad operativa común

## Objetivo
Extender el lenguaje visual liberado en el Workspace V3C/V3C.1 al resto de las
pantallas principales de ICONIC OPS, para que toda la app se sienta coherente,
premium, técnica y operativa — no pantallas sueltas ni tablas genéricas.

## Patrón visual aplicado (componentes compartidos nuevos)
- **`components/shared/operations-header.tsx` → `OperationsHeader`**: command bar
  navy ICONIC (gradiente `iconic-ink`, eyebrow cian de módulo, título, microcopy,
  `stat` héroe opcional, acciones, breadcrumb). Es la generalización de la barra
  "BOQ · Workspace de operación" del V3C. NO dark mode global (banda sobre página clara).
- **`components/shared/kpi-card.tsx` → `KpiCard` + `KpiBand`**: KPIs compactos
  (no inflados), tono por significado (default/ok/warn/danger), opcional link/click.
  Generaliza el `OpsKpi` del Workspace.

## Módulos intervenidos y qué cambió por pantalla (UIX-only)
| Módulo | Cambio |
|---|---|
| **Detalle de presupuesto** (`…/estimates/[estimateId]`) | `OperationsHeader` "Presupuesto · {nombre}" (stat Total general) + **KpiBand** (Total general · Capítulos · Partidas · Con APU · Sin APU · Workspace→link). Conecta visualmente con el Workspace V3C. |
| **APU Library** (`/apu`) | `OperationsHeader` "APU · Biblioteca reutilizable" (ambas vistas) + **KpiBand** (Actividades · Componentes · Vinculadas BOQ · Completas · Con pendientes · Sin resolver). |
| **Catálogo** (`/catalog`) | `OperationsHeader` "Catálogo · Control de precios" + **KpiBand** (Recursos · Aprobados · Pendientes · Sin precio · Sin proveedor · Revisar precios→link). |
| **Cantidades** (`/quantities`) | `OperationsHeader` "Cantidades · Revisión y sincronización" (stat Grupos). |
| **Cronograma** (`/planning`) | `OperationsHeader` "Cronograma · Planeación de obra" (stat Cronogramas). |
| **Proyectos** (`/projects`) | `OperationsHeader` "Proyectos · Proyectos y alcances" (stat Proyectos). |
| **Settings/Accesos** (`/settings/access`) | `OperationsHeader` "Settings · Accesos y configuración" (stat Usuarios). |

> **Workspace/BOQ V3C/V3C.1**: NO se rehízo. Conserva su barra navy, KPIs operativos,
> panel de detalle, filtro Sin APU y companion intactos.

## Qué NO se tocó
Supabase, RLS, policies, migrations, auth, secrets/envs, Vercel config, cálculos
BOQ/APU, export Excel/PDF, `unit_price_snapshot`, datos reales, RPCs, read-model,
permisos, `construction-ops-1rqh`. Sin columnas eliminadas, sin botones falsos
(las acciones reusan flujos/links existentes), sin dark mode/morados/neón.

## Datos de KPIs (solo existentes; nada inventado)
- Detalle presupuesto: `financialSummary.grandTotal`, `active.chapterCount/itemCount`,
  `readiness.counts.itemsWithApu/itemsWithoutApu`.
- APU: `result.stats` (totalApus/totalComponents/linkedToBoq/complete/withPending/withUnresolved).
- Catálogo: conteo sobre `resources` por `priceStatus`/`supplierName` (display, sin cálculo).

## QA
typecheck 0 · lint 0 · tests `operations-shell` 10/0 · suite completa **2096/0 (+42 skip)** ·
build 0 · gm 22/22 · `git diff --check` limpio.

## Criterios de aceptación
- ✅ Identidad común: command bar navy + KPIs compactos + tokens ICONIC en las pantallas principales.
- ✅ No solo el Workspace se ve nuevo; los módulos comparten el mismo lenguaje.
- ✅ Columnas/datos/flujos conservados; companion y filtro Sin APU intactos.

## Riesgos / pendientes
- Sin capturas locales (no hay navegador): verificación visual en **Preview** (PR).
- Las acciones (light) sobre la barra navy podrían afinar contraste; revisar visualmente.
- Pendiente (siguiente oleada): KPI bands en Cantidades/Cronograma/Settings con conteos
  reales (importados/sincronizados/conflictos; hitos/en riesgo; invitaciones/roles) cuando
  esos datos estén disponibles client-side; restyle profundo de tablas internas por módulo;
  dashboard (se dejó intacto por menor riesgo).
