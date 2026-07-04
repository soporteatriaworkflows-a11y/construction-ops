# STEEL OPS — Oleada pesada UIX (heavy wave) — Handoff

**Fecha:** 2026-07-03 · **Rama:** `feature/steel-ops-uix-heavy-wave` (desde
`feature/steel-ops-fable-uix`, con merge de `origin/feature/steel-ops-f1-domain`)
· **Owner:** Fable UIX. **Estado:** PR #38 abierto, sin merge a `main`.
**Actualización (misma fecha):** oleada de revisión + hardening + polish por
Fable sobre la implementación inicial — ver §"Oleada de hardening" al final.

## Qué se implementó

Primera versión visual navegable del módulo Steel Ops (Acero y Estructura
Metálica): 9 pantallas mock detrás de un preview gate aislado, con datos
calculados vía el dominio puro real de F1 (`@/modules/steel`, PR #35) sobre
descripciones y líneas mock — no números inventados a mano donde el dominio
puede calcularlos.

## Rutas creadas

Todas bajo `apps/web/app/(dashboard)/steel/`, con gate único en `layout.tsx`:

| Ruta | Contenido |
|---|---|
| `/steel` | Hub + dashboard (KPIs reales vía dominio) |
| `/steel/takeoffs` | Lista mock de takeoffs |
| `/steel/takeoffs/[id]` | Workspace: tabla de líneas calculadas (parser+calculadora+alertas reales) |
| `/steel/review` | Centro de revisión documental (original vs interpretación real, acciones mock) |
| `/steel/optimization` | Plan de corte FFD real + banco de sobrantes |
| `/steel/orders` | Pedidos mock (export deshabilitado, D4) |
| `/steel/catalog` | Catálogo mock de specs + precio |
| `/steel/boq-link` | Vinculación visual mock APU/BOQ (solo lectura) |
| `/steel/settings` | Defaults D3/D5 (solo lectura) |

Ninguna está enlazada en `components/shared/sidebar-nav.tsx` — solo alcanzables
por URL directa, y aun así devuelven 404 sin el gate activo.

## Feature flag

`apps/web/lib/steel/preview-gate.ts` — gate aislado y temporal:

- Env `STEEL_OPS_UIX_PREVIEW` debe ser exactamente `'true'` (ausente/otro valor ⇒ off).
- Rol real server-side ∈ `{admin, gerencia, presupuestos}` (constante `STEEL_UIX_PREVIEW_ROLES`, espejo de D1).
- El rol se resuelve importando (solo lectura, sin editar nada) `resolveAccessActor` de
  `server/access/actor.ts` — évita duplicar lógica de sesión/Supabase sin tocar
  `module-access.ts`/`guard.ts`/`sidebar-nav.tsx`.
- `apps/web/app/(dashboard)/steel/layout.tsx` llama `isSteelUixPreviewEnabled()` una sola vez
  para todo el subárbol; si es falso, `notFound()` — toda la ruta se comporta como si no existiera.
- Este NO es el flag final del blueprint (`STEEL_OPS_ENABLED` + `ACCESS_MODULES.steel`). Se retira
  por completo cuando se apruebe la integración real (ver `docs/STEEL_OPS_UIX_V1_CONTRACT.md` §9).

**Cómo probar local:** en `.env.local` (nunca compartido/CI/prod), agregar
`STEEL_OPS_UIX_PREVIEW=true`, iniciar sesión con un usuario `admin`/`gerencia`/`presupuestos`
(o `APP_AUTH_MODE=demo`, que resuelve actor sintético `admin`), y navegar directamente a `/steel`.

## Archivos creados/modificados

**Nuevos (18 archivos, 0 archivos existentes editados):**

Lógica (`apps/web/lib/steel/`):
- `preview-gate.ts` — gate aislado (env + rol)
- `types.ts` — tipos de vista (mock/UI), separados del dominio real
- `mock-data.ts` — datos mock sanitizados (D2)
- `domain-bridge.ts` — puente real a `@/modules/steel` (parser, calculadora, alertas, FFD)
- `format.ts` — helpers de presentación (decimales, COP, badges)

Rutas y componentes (`apps/web/app/(dashboard)/steel/`):
- `layout.tsx`, `page.tsx`, `_components/steel-sub-nav.tsx`, `_components/steel-status-badge.tsx`
- `takeoffs/page.tsx`, `takeoffs/[id]/page.tsx`
- `review/page.tsx`, `optimization/page.tsx`, `orders/page.tsx`, `catalog/page.tsx`,
  `boq-link/page.tsx`, `settings/page.tsx`

Tests (`apps/web/tests/unit/steel/`):
- `preview-gate.test.ts` (5), `mock-data.test.ts` (6), `domain-bridge.test.ts` (6)

**Sin tocar:** `server/access/*`, `components/shared/sidebar-nav.tsx`, cualquier
`ACCESS_MODULES`/`NAV_ITEMS`, DB/migraciones/RLS/Supabase/`.env`/producción,
comportamiento de APU/BOQ/catálogo/export/cantidades existentes.

## Qué usa el dominio real de F1 (`@/modules/steel`, PR #35)

- **Parser real** (`parseSteelDescription`) sobre los 6 casos pedidos:
  `5#5600`, `74E#3200`, `2X65E#3182`, `10#7205 @ 15CM`, `#4 L=0.62`, `15 + 35 + 15`
  — asignados a zapata, viga de cimentación, columna, losa, escalera y pilote
  respectivamente. Se ve en `/steel/review` y en la tabla de `/steel/takeoffs/[id]`.
- **Calculadora real** (`calculateSteelLine`) para las 6 líneas de refuerzo Y las
  4 líneas de perfil/estructura metálica (IPE, tubo, platina, malla) — estas
  últimas NO pasan por el parser (F1 solo interpreta notación de refuerzo), se
  arman directo como `SteelLineInput` y se marca `fromParser: false` en la UI.
- **Alertas reales** (`evaluateSteelLineAlerts`) por línea — visibles como conteo
  con tooltip en la tabla del workspace.
- **Clasificador de desperdicio real** (`classifyWasteSeverity`, D5) — la
  oleada incluye a propósito casos en los 3 rangos (ok/warning/critical) tanto
  para refuerzo (8%/12%) como perfiles (5%/8%), verificado en test.
- **Optimizador FFD real** (`optimizeSteelCutsFFD`) — corre dos planes de corte
  reales (refuerzo kerf 0, perfiles kerf configurable) sobre las cantidades
  calculadas; el visual de barras/sobrantes en `/steel/optimization` es el
  resultado genuino del algoritmo, no inventado.
- **Specs y umbrales default reales** (`findDefaultRebarSpec`,
  `defaultSteelWasteThresholds`) para pesos kg/m de varillas #3-#8 usadas en
  el cálculo.

## Qué queda 100% mock (no dominio, no DB)

- Todos los datos "de catálogo" (proveedores, precios, vigencia) — nombres
  ficticios, sin conexión a `resources`/`supplier_products`/`price_observations`.
- Pedidos, quotes, estados de pedido — mock puro (D4: sin envío/email real).
- Vinculación APU/BOQ — sugerencias mock, sin escritura real (ni siquiera lectura real).
- 3 sobrantes en estados `suggested`/`assigned`/`discarded` en `/steel/optimization`
  (el optimizador de F1 solo produce `available`/`final_waste`; los estados de
  flujo posterior del banco de sobrantes aún no existen en el dominio —
  marcados explícitamente `fromDomain: false` en la UI).
- Acciones del centro de revisión (aprobar/marcar/ignorar) — estado de React local, no persiste.
- Takeoffs y elementos (zapata, viga, columna, pilote, losa, escalera, IPE, tubo, platina, malla) — mock.

## Qué queda pendiente para F2 (modelo de datos) / integración real

- Tablas `steel_*`, RLS, migraciones — nada de esto existe todavía, ni se tocó.
- Reemplazar `preview-gate.ts` por `requireModuleAccess('steel')` +
  `STEEL_OPS_ENABLED`, agregando `'steel'` a `ACCESS_MODULES`/`MODULE_ACCESS`
  y una entrada a `NAV_ITEMS` — requiere escalar a agent-orchestrator (dueño de esos archivos).
- Conectar mocks → datos reales vía server actions RLS-bound.
- Banco de sobrantes con persistencia real de estados de flujo (`suggested`→`assigned`).
- Export real a Excel/PDF en `/steel/orders` (hoy botón deshabilitado).
- Vinculación APU/BOQ real (server action, sin precios calculados en el navegador — mismo patrón que `link-to-boq-button`).

## Riesgos

| Riesgo | Estado |
|---|---|
| Deep-link alcanzable si `STEEL_OPS_UIX_PREVIEW=true` queda mal puesto en entorno compartido | Documentado: solo `.env.local` personal, nunca CI/prod |
| Mismatch de nombres entre mocks de perfiles y catálogo mock (bloqueaba precio) | Corregido durante la oleada (referencias alineadas) |
| Tabla de líneas sin virtualización (AG Grid) | Aceptado para este preview — volumen mock es pequeño; upgrade a AG Grid Community cuando haya datos reales de volumen |
| F1 en verificación (typecheck/lint con pnpm) al momento de esta oleada | Confirmado en verde en esta rama tras `pnpm install` limpio: typecheck 0, lint 0, 2520/2520 tests (incluye toda la suite existente + los 17 tests nuevos de Steel) |

## Validaciones ejecutadas

- `pnpm --filter web typecheck` → **0 errores**
- `pnpm --filter web lint` → **0 errores**
- `pnpm test` (suite completa, incluye `tests/unit/steel/*`) → **191 archivos, 2520 tests pasados, 0 fallidos, 42 skipped (pre-existentes)**

---

## Oleada de hardening + polish (Fable, 2026-07-03)

Revisión crítica de producto/UIX sobre la implementación inicial, con
correcciones aplicadas (no solo listadas). Mismo alcance seguro: cero DB,
Supabase, RLS, `.env`, producción, `server/access`, sidebar global.

### Corrección de fondo (bug real)

- **Ahorro COP dimensionalmente incorrecto**: la vista de optimización
  calculaba ahorro como `metros × precio/kg`. Ahora `computeOffcutSavings()`
  (en `domain-bridge.ts`) calcula `ml × kg/m del grupo × COP/kg de referencia`
  y expone ahorro en **ml, kg y COP** por separado. El precio COP sigue siendo
  referencia mock y así se etiqueta.

### Qué mejoró por pantalla

- **`/steel` (hub)**: franja de propuesta de valor (4 puntos: documento→cantidades,
  riesgo visible antes del pedido, menos desperdicio, conectado al presupuesto);
  KPIs reorganizados en dos bandas con título ("Cantidades y desperdicio" /
  "Revisión y compra"); KPIs nuevos: **ahorro estimado** y **líneas por
  revisar**; KPIs clicables hacia su pantalla; sección "Estado de los takeoffs"
  con enlace.
- **`/steel/review`**: cada caso muestra ahora **fuente (plano/hoja)**,
  **documento original**, **"lo leído"** (interpretación del parser) y
  **"lo calculado"** (ml/kg vía calculadora F1) en tres paneles separados;
  chip de veredicto **OK / Revisar / Crítico** (derivado de confianza +
  needsReview en `domain-bridge`); feedback visible al accionar (demo);
  microcopy explícito: "no reemplaza al ingeniero estructural".
- **`/steel/optimization`**: plan de corte **agrupado por número de
  varilla/referencia de perfil** (antes: barras sueltas sin contexto);
  segmentos con longitud visible dentro de la barra; sobrante etiquetado
  "reutilizable" vs "desperdicio final"; KPIs de ahorro en **ml/kg/COP**;
  advertencia explícita: *"Optimización heurística determinista (FFD),
  requiere revisión antes de compra"*; `role="img"` + `aria-label` en cada
  barra; explicación de compatibilidad del banco de sobrantes.
- **`/steel/orders`**: totales **kg/ml** por pedido además de COP; **vigencia
  vencida resaltada por línea** ("Vencida — recotizar", fila en rojo suave,
  fecha de referencia fija del preview `2026-07-03`); kg por línea; botón de
  export deshabilitado con explicación de por qué y qué llegará (perfil
  proveedor sin datos internos); microcopy del ciclo draft→received.
- **`/steel/catalog`**: estados de precio ahora **espejo del pipeline real**
  (`estimado`/`proveedor`/`aprobado`/`vencido`/`sin_precio` en vez del
  inventado "vigente"); columna de vigencia; malla electrosoldada añadida al
  catálogo; leyenda de qué significa cada estado.
- **`/steel/boq-link`**: columna de **riesgo** por vínculo (sin precio / sin
  actividad / sin proveedor, espejo de alertas A8/A9/A10); **acciones mock**
  vincular/revisar/ignorar con cambio de estado visual; microcopy: "Steel Ops
  no reemplaza el BOQ: le alimenta cantidades y recursos".
- **`/steel/settings`**: se eliminaron los inputs falsos (parecían editables);
  ahora valores de solo lectura con estilo chip.
- **Accesibilidad transversal**: `aria-current` en la sub-nav, `scope="col"`
  en encabezados de tablas, `aria-pressed` en botones de acción mock,
  `aria-disabled` + título explicativo en botones deshabilitados,
  `min-width` en tablas para scroll horizontal limpio en pantallas pequeñas.

### Cambios de datos/tipos

- `SteelPriceStatusView` = `estimado|proveedor|aprobado|vencido|sin_precio`.
- `SteelBoqLinkView.risks`, `SteelReviewItemView` ampliado (sourceLabel,
  computedTotalMl/Kg, verdict), `SteelOrderView.totalKg/totalMl`,
  `SteelOrderLineView.totalKg`.
- `domain-bridge.ts`: `computeOffcutSavings`, `groupBarsBySpec`,
  `specDisplayLabel`, veredicto de revisión, KPI `estimatedSavingsCop` y
  `linesPendingReviewCount`; "precios pendientes" ahora significa
  "no aprobados o vencidos" (espejo del pipeline).
- `format.ts`: `STEEL_FAMILY_LABEL`, `isExpired`, variantes de badge para los
  estados de precio reales.

### Validaciones de la oleada de hardening

- `pnpm --filter web typecheck` → **0 errores**
- `pnpm --filter web lint` → **0 errores**
- Suite completa → **2524 tests pasados, 0 fallidos** (4 tests nuevos:
  veredicto de revisión, consistencia dimensional del ahorro, partición del
  agrupador de barras, `isExpired`).

### Próximo paso recomendado

1. Merge de **PR #36** (docs UIX/flag) — sin riesgo, docs-only.
2. Merge de **PR #35** (dominio F1) — ya validado.
3. Actualizar/rebase **PR #38** contra `main`: su diff quedará reducido a solo
   esta oleada UIX (hoy arrastra el contenido de #35/#36 por no estar mergeados).
4. Evaluar merge de **PR #38** como preview (flag off por defecto: sin efecto
   en producción).
