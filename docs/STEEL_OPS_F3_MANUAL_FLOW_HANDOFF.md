# STEEL_OPS_F3_MANUAL_FLOW — Handoff

**Fecha:** 2026-07-03
**Rama:** `feature/steel-ops-f3-manual-takeoff-flow` (base `origin/main = 62dab9a`)
**PR:** `feat(steel): add manual takeoff flow preview` (contra `main`, SIN merge)
**Fase padre:** `docs/design-references/STEEL_OPS_V1_BLUEPRINT.md` — F3 (primer flujo
operativo manual), tras F1 dominio puro (#35), F2 blueprint docs-only (#39) y el
shell UIX preview (#38).

---

## 1. Qué es F3

Primer flujo operativo **manual** de Steel Ops, completo de punta a punta y **sin
persistencia real**: crear un takeoff local, digitar descripciones de despiece tal
como vienen del plano, verlas interpretadas/calculadas/alertadas por el dominio
real de F1, enviarlas al plan de corte FFD, ver el banco de sobrantes y generar un
pedido proveedor mock con preparación de export.

Todo vive detrás de `STEEL_OPS_UIX_PREVIEW` (env + rol admin/gerencia/presupuestos,
`lib/steel/preview-gate.ts` — sin cambios en esta oleada). Sin entrada en el
sidebar global; solo URL directa `/steel/takeoffs`.

## 2. Qué quedó FUNCIONAL (cálculo real, no simulado)

| Paso | Implementación | Fuente de verdad |
|---|---|---|
| Interpretación de descripciones (`5#5600`, `74E#3200`, `2X65E#3182`, `10#7205 @ 15CM`, `#4 L=0.62`, `15 + 35 + 15`) | Preview en vivo en el formulario + cálculo por línea | `parseSteelDescription` (F1 real) |
| Confianza, explicación y `needs_review` por línea | Mostrados antes de agregar y en tabla/alertas | Campos del parser F1 |
| ml, kg, unidades comerciales, costo estimado | Tabla de líneas + KPIs agregados | `calculateSteelLine` + specs de referencia F1 (`findDefaultRebarSpec`) |
| Desperdicio asumido y severidad OK/warning/critical | % por línea (input) + clasificación D5 | `calculateAssumedWasteMl`/`calculateWastePct`/`classifyWasteSeverity` |
| Alertas por línea (A4/A6/A9/A10/A13/A17/A18…) con explicación | Panel dedicado "por qué necesita revisión" | `evaluateSteelLineAlerts` (F1 real) |
| Plan de corte + sobrantes | Botón "enviar líneas válidas"; excluidas con razón explícita; barras agrupadas por varilla; banco de sobrantes y ahorro estimado | `optimizeSteelCutsFFD` (FFD real F1) + `groupBarsBySpec`/`computeOffcutSavings` (bridge existente) |
| Pedido proveedor (estructura) | Agrupación varilla × longitud comercial; unidades = barras del plan (no `ceil` por línea); kg/ml/subtotales | Motor puro `buildManualOrderDraft` sobre el plan FFD |
| Ciclo de estados `draft → in_review → approved → locked` | Botones de transición con matriz explícita; `locked` terminal (espejo de inmutabilidad); líneas editables solo en draft/in_review | `MANUAL_TAKEOFF_STATUS_TRANSITIONS` |
| Export CSV local | Blob en el navegador, BOM UTF-8, celdas sanitizadas contra formula injection (convención APU_EXPORTS_V1) | `buildManualExportCsv` (pura, testeada) |

## 3. Qué sigue MOCK / local

- **Persistencia**: localStorage del navegador (`steel-ops-preview.manual-takeoffs.v1`),
  solo INPUTS (descripción, % desperdicio, varilla manual); todo lo derivado se
  recalcula con F1 en cada carga. Parseo defensivo fail-safe (JSON corrupto ⇒ vacío).
  No hay DB, Supabase, RLS ni migraciones.
- **Precios y proveedores**: `MOCK_STEEL_SPECS` (catálogo preview). Los estados
  (`aprobado/proveedor/vencido/sin_precio`) son espejo del pipeline real de
  pricing pero NO leen `price_observations`.
- **Pedido proveedor**: no se persiste, no se envía, no crea `orders` reales.
- **Export**: CSV local de borrador. El export oficial (Excel/PDF con perfiles de
  privacidad por rol, backend-first) NO se implementa en F3.
- **Estados del takeoff**: transiciones locales sin auditoría ni permisos por rol
  más allá del gate del preview.

## 4. Qué falta para DB real (F2 → implementación)

1. Congelar el contrato F2 (`STEEL_OPS_F2_SCHEMA_DRAFT.md`: `steel_takeoffs`,
   `steel_takeoff_lines`, `steel_cut_plans`, `steel_offcuts`, `steel_orders`…) y
   ejecutar sus 4 migraciones gated (`STEEL_OPS_DB_APPLY_GATE`).
2. Sustituir `manual-store.ts`/`use-manual-takeoffs.ts` por repositorio RLS-bound +
   server actions (el motor `manual-takeoff.ts` está diseñado para sobrevivir: solo
   cambia la resolución de precio/proveedor y la persistencia).
3. Precio real: observaciones `pending` vía pipeline existente
   (`resources`/`supplier_products`/`price_observations`), jamás catálogo paralelo.
4. Estados con auditoría (`steel_actions` append-only) y permisos por `profiles.role`.
5. Integración APU/BOQ vía RPCs existentes (steel jamás escribe `boq_items`).
6. Reemplazo del gate interino por `STEEL_OPS_ENABLED` + `ACCESS_MODULES.steel`
   (escalado a agent-orchestrator; NO se tocó en F3).

## 5. Archivos de la oleada

**Nuevos (lib):**
- `apps/web/lib/steel/manual-takeoff.ts` — motor puro F3 (parser bridge, totales,
  plan de corte, pedido mock, CSV, transiciones).
- `apps/web/lib/steel/manual-store.ts` — persistencia local defensiva.
- `apps/web/lib/steel/use-manual-takeoffs.ts` — localStorage como external store
  (`useSyncExternalStore`, sync entre pestañas, sin setState-en-effect).

**Nuevos (UI, `app/(dashboard)/steel/takeoffs/_components/`):**
- `manual-takeoffs-section.tsx` (lista + creación), `manual-takeoff-workspace.tsx`
  (orquestador del flujo, 6 pasos), `manual-line-form.tsx` (form + preview del
  parser + varilla manual), `manual-lines-table.tsx`, `manual-alerts-panel.tsx`,
  `manual-cut-plan-section.tsx`, `manual-order-section.tsx`,
  `manual-export-section.tsx`.

**Modificados:**
- `app/(dashboard)/steel/takeoffs/page.tsx` — sección de takeoffs manuales + separación de mocks.
- `app/(dashboard)/steel/takeoffs/[id]/page.tsx` — ids `mtk-*` delegan al workspace cliente.

**Tests nuevos:**
- `tests/unit/steel/manual-takeoff.test.ts` (11) y `tests/unit/steel/manual-store.test.ts` (5).

## 6. Validaciones

- `pnpm --filter web typecheck` → 0 errores.
- `pnpm --filter web lint` → 0 errores (el hallazgo `react-hooks/set-state-in-effect`
  se resolvió migrando a `useSyncExternalStore`, no silenciándolo).
- `pnpm --filter web test -- tests/unit/steel` → 60/60 (16 nuevos).
- Suite completa `pnpm --filter web test` → ver resultado en HANDOFF_LOG (regresión).

## 7. Riesgos y decisiones

- **R-F3-1**: localStorage es por-navegador: un takeoff manual no es visible desde
  otra máquina/usuario. Aceptado: F3 es preview sin persistencia real por mandato.
- **R-F3-2**: la convención del parser F1 para notación compacta (`#5600` ⇒ varilla
  5 + 600 cm salvo #10–#18) puede leer mal casos límite; mitigado mostrando SIEMPRE
  la explicación + confianza y marcando `needs_review` (el humano decide).
- **R-F3-3**: el pedido usa unidades del plan FFD (heurístico, no óptimo global) y
  precios mock; cualquier uso comercial real queda explícitamente advertido en UI.
- **D-F3-1**: `locked` es terminal y sin vuelta atrás (espejo de la regla de
  snapshots emitidos inmutables); confirmación explícita antes de bloquear.
- **D-F3-2**: las líneas de perfil/estructura metálica NO entran al flujo manual F3
  (F1 solo parsea notación de refuerzo); el flujo mock de perfiles del preview #38
  sigue intacto en los takeoffs de ejemplo.

## 8. Confirmación de restricciones

Sin DB · sin Supabase · sin RLS · sin migraciones · sin `.env` · sin deploy · sin
producción · sin service role · sin tocar navegación global
(`ACCESS_MODULES`/`NAV_ITEMS`/sidebar/command palette) · sin tocar APU/BOQ/catálogo
real · todo detrás de `STEEL_OPS_UIX_PREVIEW` · PR contra main SIN merge.
