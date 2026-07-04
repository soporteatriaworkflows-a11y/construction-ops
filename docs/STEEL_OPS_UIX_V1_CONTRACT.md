# STEEL OPS — Contrato UIX V1 (mapa de pantallas, aislado, mocks)

**Fecha:** 2026-07-03 · **Owner:** Fable UIX · **Estado:** PROPUESTO — pendiente
de visto bueno antes de ejecutar la rebanada 1.
**Rama:** `feature/steel-ops-fable-uix` · **Depende de:** nada (F1 dominio y
F2 datos avanzan en paralelo, sin cruce de archivos).
**Basado en:** `docs/design-references/STEEL_OPS_V1_BLUEPRINT.md` §8-12,§17 ·
Decisiones D1-D5 de la usuaria (2026-07-03) · `docs/F1_DOMAIN_CONTRACT.md`.

---

## 0. Alcance y no-alcance

**Alcance de esta fase:** rutas `app/(dashboard)/steel/*` completas con datos
mock, navegables solo por URL directa (no enlazadas en el sidebar
compartido), gateadas por un flag de vista previa 100% aislado. Mapa de
pantallas, estados (vacíos/alerta/importación/revisión), tabla de cantidades,
banco de sobrantes visual, pedido a proveedor (export mock), conexión visual
con APU/BOQ (solo lectura simulada).

**No-alcance (explícito):**
- Nada de `apps/web/modules/steel/*` (dominio puro — es de Codex, F1).
- Nada de tablas `steel_*`, migraciones, RLS, Supabase (F2 — Codex Data).
- **Cero ediciones a archivos compartidos**: `server/access/module-access.ts`,
  `components/shared/sidebar-nav.tsx`, `lib/access/*`,
  `components/shared/command-palette-data.ts`. Estos son propiedad de
  agent-orchestrator; su edición para integrar Steel de verdad es un paso
  posterior, explícito, escalado (§9).
- Nada de datos reales, nada de conexión a `resources`/`supplier_products`/
  `price_observations`/`project_scopes` reales — todo mock tipado.
- Nada de emails/notificaciones (D4: export manual únicamente).
- UI final publicada — esto es boceto navegable, no el pixel-final.

---

## 1. Hallazgo: no existe mecanismo de feature flag en el repo

Confirmado por barrido del frontend: no hay `flags.ts`, ni env vars
`NEXT_PUBLIC_*_FLAG`. El gating real de módulos es la matriz
`ACCESS_MODULES`/`MODULE_ACCESS` en `server/access/module-access.ts`
(propiedad de agent-orchestrator) + `requireModuleAccess()` en cada
`page.tsx`, consumida también por `sidebar-nav.tsx` para filtrar
`NAV_ITEMS`. El blueprint (§17) apunta ahí como destino final ("doble
candado": env `STEEL_OPS_ENABLED` + `ACCESS_MODULES.steel`) — pero llegar
ahí implica editar esos dos archivos compartidos.

**Decisión de diseño para esta fase (no requiere aprobación de negocio, es
técnica y reversible — la marco igual por transparencia):** en vez de tocar
esos archivos ahora, uso un flag interino, propio y aislado, que desaparece
cuando se haga la integración real (§9).

## 2. Flag interino de fase boceto

Archivo nuevo, sin dependencias de `module-access.ts`:

```
apps/web/lib/steel/preview-gate.ts
```

```ts
// Gate aislado de fase boceto. NO es el flag final del blueprint (§17);
// desaparece cuando 'steel' se integre a ACCESS_MODULES (ver STEEL_OPS_UIX_V1_CONTRACT §9).
const PREVIEW_ROLES = ['admin', 'gerencia', 'presupuestos'] as const;

export function isSteelUixPreviewEnabled(role: string | null | undefined): boolean {
  if (process.env.STEEL_OPS_UIX_PREVIEW !== 'true') return false;
  return !!role && (PREVIEW_ROLES as readonly string[]).includes(role);
}
```

Cada `page.tsx` bajo `steel/*` llama `isSteelUixPreviewEnabled(profileRole)`
resuelto server-side (mismo patrón de resolución de actor que ya usan las
páginas existentes) y hace `notFound()` si es falso — espejo exacto del
comportamiento "flag off ⇒ la ruta no existe" que pide el blueprint §17,
pero con una variable de entorno propia (`STEEL_OPS_UIX_PREVIEW`, ausente =
off) que **nunca se define en ningún `.env` de producción** y no vive en
`ACCESS_MODULES`. Nada en el sidebar compartido apunta a estas rutas: solo
son alcanzables por URL directa, y aun así devuelven 404 sin el flag + rol
correctos. Esto ya satisface D1 para esta fase (apagado en prod; visible
solo admin/gerencia/presupuestos con el env activo en preview/staging;
`consulta`/`obra`/`compras` fuera). Cuando se integre de verdad (§9), este
archivo se retira y el guard pasa a ser `requireModuleAccess('steel')`.

## 3. Mapa de pantallas → rutas reales

Adaptado al patrón real del repo (Server Component `page.tsx` + `_components/`
+ `actions.ts` mock, espejo de `apu/import/_components/`,
`catalog/prices/review/_components/`):

| # | Pantalla (blueprint §8) | Ruta |
|---|---|---|
| 1 | Hub + dashboard | `steel/page.tsx` |
| 2 | Lista de takeoffs | `steel/takeoffs/page.tsx` |
| 2 | Workspace de takeoff (tabla normalizada) | `steel/takeoffs/[id]/page.tsx` |
| 3 | Revisión documental (fuentes) | `steel/takeoffs/[id]/sources/page.tsx` |
| 4 | Optimización (plan de corte + sobrantes) | `steel/takeoffs/[id]/optimize/page.tsx` |
| 5 | Lista de pedidos | `steel/orders/page.tsx` |
| 5 | Detalle de pedido + comparador de quotes | `steel/orders/[id]/page.tsx` |
| 6 | Catálogo de acero | `steel/catalog/page.tsx` |
| 7 | Vinculación APU/BOQ | `steel/links/page.tsx` |
| 8 | Settings (kerf, longitudes, umbrales D5) | `steel/settings/page.tsx` |

Todas bajo `apps/web/app/(dashboard)/steel/` (hereda layout+sidebar
compartido, pero sin entrada en `NAV_ITEMS` por ahora — ver §2).

## 4. Reuso de componentes (sin duplicar UI)

| Necesidad | Componente/patrón real a reusar |
|---|---|
| Tabla normalizada de líneas (miles de filas) | AG Grid **Community** (`AllCommunityModule` únicamente — nunca enterprise), patrón `components/budget/budget-boq-grid.tsx` |
| KPIs del dashboard | `components/shared/kpi-card.tsx` + `modules/dashboard/kpi-card.tsx` como referencia de layout |
| Gráficas por familia/piso/№ | Recharts, patrón `modules/dashboard/chapter-bar-chart.tsx` / `chapter-pie-chart.tsx` |
| Estados vacíos | `components/shared/empty-state.tsx` (props `icon/title/description/action/readOnlyMessage`) |
| Alertas por severidad (crítica/advertencia/info) | `components/shared/inline-callout.tsx` (tonos `tip/info/warning/success`) — mapeo: crítica→`warning` con ícono propio, advertencia→`warning`, info→`info` |
| Badges de estado (`draft/in_review/approved/locked...`) | `components/shared/status-badge.tsx` |
| Wizard de importación (Excel/plantilla/manual) | patrón de 3 pasos de `apu/import/_components/apu-import-wizard.tsx` y `catalog/import/_components/catalog-import-wizard.tsx` |
| Revisión lado a lado (original vs interpretación) | patrón `catalog/prices/review/_components/operational-review-console.tsx` + `review-table.tsx` (Centro de Revisión de Precios) |
| Vinculación a BOQ | patrón `apu/_components/link-to-boq-button.tsx` + elegibilidad pura estilo `lib/apu-library/boq-link.ts` (para Steel: `lib/steel/boq-link-eligibility.ts`, mock) |
| Tokens visuales | Tailwind ICONIC (`iconic-primary`, `iconic-cyan`, `iconic-ink`, `iconic-soft-blue`) — cero tokens nuevos |

No se crea ningún componente base nuevo en `components/ui/`; todo composición
de lo existente + componentes propios de `steel/_components/`.

## 5. Catálogo de estados a cubrir

- **Takeoff:** `draft → in_review → approved → locked` (+`archived`) — chips
  de `status-badge.tsx`.
- **Línea:** `unreviewed → auto_ok | needs_review → confirmed | edited |
  rejected` — badge + fila resaltada si `needs_review`.
- **Fuente:** `uploaded → parsing → parsed | partially_parsed | failed →
  reviewed`.
- **Pedido:** `draft → rfq_sent → quoted → approved → ordered →
  partially_received → received → closed` (+`cancelled`).
- **Alertas (mock, sin dominio real todavía):** severidad
  `critical|warning|info` renderizada con `InlineCallout`; umbrales D5
  visibles en `steel/settings` como valores editables (mock, no persisten).
- **Estados vacíos obligatorios (blueprint §8.9):** proyecto sin takeoff,
  takeoff sin fuentes, sin precios, sin pedidos — cada uno con copy de guía y
  CTA, nunca pantalla en blanco o rota.

## 6. Estructura de mocks

Nuevo archivo, siguiendo el patrón ya usado en `lib/utils/mocks/index.ts`
(comentario "MOCKS PROVISIONALES", tipos compartidos con el dominio real
futuro para minimizar reescritura cuando F1/F2 conecten):

```
apps/web/lib/steel/mocks.ts
```

Contenido tipado (interfaces locales en `lib/steel/types.ts`, alineadas —
no idénticas, es mock UI — con las entidades del blueprint §4):
`MOCK_STEEL_TAKEOFFS`, `MOCK_STEEL_ELEMENTS`, `MOCK_STEEL_LINES` (incluye
casos con `needs_review`, alertas, sin precio, sin vínculo BOQ),
`MOCK_STEEL_OFFCUTS`, `MOCK_STEEL_ORDERS` + `MOCK_STEEL_ORDER_LINES`,
`MOCK_STEEL_SUPPLIER_QUOTES`, `MOCK_STEEL_SPECS` (varillas #2-#8 + 2-3
perfiles IPE/HEA de ejemplo). Datos ficticios (nombres de elementos
genéricos tipo "Columna C-12", sin nombre de proyecto real), consistente con
D2 (nada sensible, ni siquiera en mock).

Test de humo: `apps/web/tests/unit/components/steel-mocks.test.ts` (espejo
de `mocks.test.ts` existente) — solo valida forma/tipos, no lógica de
dominio (eso es de F1).

## 7. Casos de prueba mínimos (UI, no dominio)

- Empty state se muestra cuando la lista mock correspondiente está vacía
  (probar con array vacío inyectado, no con los mocks poblados).
- `readOnlyMessage` de `EmptyState` se activa para rol sin escritura (mock de
  rol `presupuestos` vs `admin`).
- Fila con `verification_status: 'needs_review'` se resalta y muestra badge
  correcto.
- Alerta `critical` (desperdicio ≥12% refuerzo / ≥8% perfiles, D5) renderiza
  `InlineCallout` tono `warning` con severidad correcta vs `advertencia`
  (8-12% / 5-8%) — probar los 3 umbrales límite (justo debajo, en el límite,
  justo arriba).
- `isSteelUixPreviewEnabled`: matriz rol×env (4 roles permitidos/no ×
  flag on/off) — función pura, testeable sin servidor.
- Ruta `steel/*` sin flag activo → `notFound()` (test de integración ligero
  o al menos documentado como caso manual si el harness de rutas no cubre
  `notFound()` fácilmente).

## 8. Lista de archivos (rebanada 1 — hub + dashboard + estados vacíos)

Propongo ejecutar por rebanadas (PRs pequeños, patrón del blueprint §16), no
todo de una vez. Rebanada 1:

- `apps/web/lib/steel/preview-gate.ts` (nuevo)
- `apps/web/lib/steel/types.ts` (nuevo, tipos mock)
- `apps/web/lib/steel/mocks.ts` (nuevo)
- `apps/web/app/(dashboard)/steel/page.tsx` (nuevo — hub + dashboard)
- `apps/web/app/(dashboard)/steel/_components/steel-dashboard.tsx` (nuevo)
- `apps/web/app/(dashboard)/steel/_components/steel-empty-state.tsx` (nuevo, wrapper fino sobre `EmptyState`)
- `apps/web/tests/unit/components/steel-mocks.test.ts` (nuevo)
- `apps/web/tests/unit/lib/steel-preview-gate.test.ts` (nuevo)

Rebanadas siguientes (2-6), una vez aprobada la 1: takeoffs+workspace+tabla
AG Grid → sources (revisión documental) → optimize (plan de corte + banco de
sobrantes) → orders (+comparador quotes, export mock) → catalog+links+settings.

Ningún archivo de esta lista, en ninguna rebanada, está fuera de
`app/(dashboard)/steel/`, `lib/steel/`, o `tests/**/steel*` — cero
intersección con archivos que otros agentes (Codex F1/F2, agent-pricing,
agent-frontend-boq en su alcance actual) estén tocando.

## 9. Qué queda para más adelante, escalado a agent-orchestrator

No lo hago ahora, lo dejo explícito para cuando F1 (dominio) y F2 (datos)
estén aprobados y se decida activar el flujo real:

- Agregar `'steel'` a `ACCESS_MODULES` + fila en `MODULE_ACCESS` en
  `server/access/module-access.ts` (con la matriz de roles de D1: interno
  admin/gerencia/presupuestos desde F3, `compras`/`obra` según D1 abierta en
  el blueprint, `consulta` nunca en V1).
- Agregar entrada a `NAV_ITEMS` en `sidebar-nav.tsx` (ícono, label "Acero").
- Reemplazar `preview-gate.ts` por `requireModuleAccess('steel')` +
  `STEEL_OPS_ENABLED` real (doble candado del blueprint §17).
- Conectar mocks → dominio real (`modules/steel/*` de F1) → datos reales
  (`steel_*` de F2, vía server actions con RLS).
- Cualquier edición a `command-palette-data.ts` (⌘K) si se decide exponer
  Steel ahí.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Deep-link a `/steel/*` alcanzable por cualquiera que adivine la URL si `STEEL_OPS_UIX_PREVIEW=true` queda mal puesto en un entorno compartido | env var documentada como "solo local/preview personal", nunca en `.env` compartido ni CI; doble check de rol igual aplica aunque el env esté on |
| Mocks divergen de la forma real que definirá F1/F2, generando retrabajo al conectar | tipos de `lib/steel/types.ts` alineados deliberadamente a las entidades §4 del blueprint (mismos nombres de campo donde es razonable) |
| Tentación de adelantar lógica de negocio (desperdicio, FFD) en el cliente | prohibido explícitamente aquí (§0 no-alcance); toda "lógica" en mocks es estática, no calculada |
| Componentes quedan huérfanos si D1 final decide otra matriz de roles | bajo costo — son mocks + flag aislado, se ajustan en minutos, no hay dato real ni migración de por medio |

## 11. Checklist antes de dar por cerrada una rebanada

- [ ] `notFound()` confirmado sin flag / rol no autorizado
- [ ] Cero imports desde `modules/steel/*` (dominio) o `steel_*` (DB)
- [ ] Cero ediciones a `module-access.ts`, `sidebar-nav.tsx`, `lib/access/*`,
      `command-palette-data.ts`
- [ ] `ag-grid-enterprise` NO importado (solo `AllCommunityModule`)
- [ ] typecheck 0 · lint 0 · tests de la rebanada verdes
- [ ] Sin archivos `.xlsx/.xls`/reales del proyecto piloto en el commit
- [ ] HANDOFF_LOG actualizado
