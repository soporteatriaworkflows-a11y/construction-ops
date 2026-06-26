# UIX_WORKSPACE_OPERATIONS_V3C — Restyle del Workspace/BOQ (referencia ref-04)

## Objetivo
Llevar el Workspace/BOQ a una composición de **pantalla de operaciones premium**
(lista + detalle + KPIs + acciones semánticas), inspirada en `ref-04-operations.jpg`,
sin copiarla, sin dark mode y **sin perder columnas, datos ni funcionalidad**.

## Referencia usada
`docs/design-references/uix/ref-04-operations.jpg` (dashboard de manufactura). Auditada
en `UIX_REFERENCE_AUDIT.md` como la más cercana a obra: lista de operaciones con progreso +
ítem seleccionado + panel de detalle + fila de KPIs (Planned/Done/Waste) + acciones semánticas.

## Mapeo de ref-04 → ICONIC OPS (traducción, no copia)

| ref-04 | ICONIC OPS (Workspace/BOQ) |
|---|---|
| Lista de operaciones con progreso | Lista de capítulos → partidas (BOQ), con estado APU/cantidad/precio por fila |
| Operación seleccionada (resaltada) | **Fila seleccionada** (ring + tinte), click en el código de la partida |
| Panel "Operation details" | **Panel de detalle operativo** de la partida (arriba de la tabla) |
| KPIs Planned / To do / Done / Waste | **Capítulos · Partidas · Con APU · Sin APU · Sin cantidad · Sin precio** (conteos reales) |
| Acciones por tipo (Start/Changeover/…) | **Acciones semánticas** reales: Ver APU · Ver partidas sin APU · Edición completa · Revisar precios |
| Fondo índigo/dark + neón | **Claro ICONIC**: navy/azul/soft-blue, `shadow-iconic`, gradiente `brand-50→blanco`, sin neón |

## Decisiones visuales
- **Detalle ARRIBA de la tabla** (no a la derecha): la tabla técnica del BOQ tiene 6–7
  columnas + edición rápida; un panel lateral derecho la comprimiría y chocaría con el
  companion. El detalle contextual sobre la tabla preserva el ancho completo y evita conflictos.
- **Selección por el código de la partida** (botón), no por toda la fila → no interfiere con
  los inputs de edición rápida ni con los botones de acción.
- **KPIs como conteos** (no finanzas): `OpsKpi` compacto; "Sin APU" es clicable y activa el filtro.
- **Resumen financiero** se conserva como panel premium (V3B) con "Total general" héroe.

## Archivos modificados
- `apps/web/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx`
  - Estado `selectedItemId` (solo UI) + `selected` derivado.
  - `ops` (conteos operativos, `useMemo`, display) + banda `OpsKpi`.
  - `ItemDetailPanel` (detalle de la partida + estados + próxima acción + acciones semánticas) +
    helpers `OpsKpi`/`Field`/`StateChip`.
  - `ItemRow`: código como botón de selección + fila resaltada cuando está seleccionada.
  - `ChapterGroup`: pasa `selectedItemId`/`onSelectItem`.
- `apps/web/tests/unit/quote/quote-workspace-apu.test.ts` — bloque V3C (KPIs/detalle/selección/columnas).
- Docs: este archivo + `docs/HANDOFF_LOG.md`.

## Criterios de aceptación (cumplidos)
- ✅ Se ve como pantalla de operaciones (lista + detalle + KPIs + acciones semánticas).
- ✅ No se perdió ninguna columna ni dato (Código/Descripción/Und/Cantidad/V.Unitario/Subtotal/Estado/Acciones).
- ✅ Filtro "Sin APU", chip "N sin APU", FilterPills, edición rápida, footer total: intactos.
- ✅ Companion no se tocó (lógica/docking/Sin APU intactos); el detalle va sobre la tabla, no choca con él.
- ✅ Identidad ICONIC clara (sin dark mode, sin neón/morados).
- ✅ typecheck 0 · lint 0 · suite 2084/0 · build 0 · gm 22/22.

## Qué NO se tocó
Supabase, RLS, policies, migrations, auth, secrets/envs, Vercel config, cálculos financieros,
cálculos BOQ/APU, export Excel/PDF, `unit_price_snapshot`, datos reales, RPCs, read-model, permisos,
versiones aprobadas, `construction-ops-1rqh`.

## V3C.1 — Visual delta hotfix (cambio evidente)

Tras revisión, el delta V3C se sintió tímido. V3C.1 hace el cambio **inmediatamente visible** en la
ruta `…/estimates/[estimateId]/workspace` (¡NO en el detalle `…/estimates/[estimateId]`, que tiene otra
tabla y no es esta fase!):

- **Barra de comando navy de operación** (arriba del todo): gradiente `iconic-ink` con label cian
  "BOQ · Workspace de operación", stats (capítulos · partidas · **N sin APU** en ámbar · estado de versión)
  y **Total general** héroe en blanco. Es la señal premium inmediata (navy ICONIC, no dark mode global).
- **Dos zonas separadas** (grid lg:2): **Estado operativo** (barra de **Cobertura APU %** + KPIs
  Capítulos/Partidas/Con APU/Sin APU/Sin cantidad/Sin precio) y **Resumen financiero** (6 sub-montos).
- **Zona de detalle SIEMPRE presente**: placeholder con instrucción ("clic en el código…") cuando no hay
  selección; al seleccionar, el `ItemDetailPanel` con **acento izquierdo** (`border-l-4`).
- Confirmación visual de V3C.1 (para QA, sin gating de env): **si ves la barra navy "BOQ · Workspace de
  operación" arriba**, estás en V3C.1. (No se añadió label dev-only para no arriesgar prod/UX.)

Archivo: el mismo `boq-workspace.tsx`. typecheck 0 · lint 0 · tests 207/0 · suite 2086/0 · build 0 · gm 22/22.

## Riesgos / pendientes
- Sin capturas locales (no hay navegador en el entorno): verificación visual final pendiente en prod.
- El detalle es de **bajo riesgo** (estado UI + datos ya cargados); no hay drawer lateral (decisión).
- Futuro: micro-data-viz (anillos/sparkbars por capítulo), responsive fino, extender el patrón a
  Catálogo/Cantidades (siguiente fase).
