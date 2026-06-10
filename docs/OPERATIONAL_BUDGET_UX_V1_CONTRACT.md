# OPERATIONAL BUDGET UX V1 — Contrato de la oleada

**Estado:** Implementada y validada localmente (2026-06-09/10)
**Rama:** `feature/operational-budget-ux-v1`
**Base:** `origin/integration/iconic-ui-price-intelligence-v1` @ `d944bc1`
**Propiedad:** agent-orchestrator (integración); subdominios según AGENT_REGISTRY.
**Cambios a este contrato:** solo vía `docs/INTEGRATION_REQUESTS.md`.

---

## 1. Objetivo

Transformar la experiencia del presupuesto en un workspace operativo denso,
rápido y comercialmente claro, **sin** alterar la arquitectura multiusuario/
multiempresa, los invariantes financieros ni los exports existentes.

## 2. Alcance implementado

| Bloque | Entregable | Ruta/módulo |
|---|---|---|
| A | BOQ Workspace denso (sticky header, capítulos colapsables, búsqueda, filtros, subtotales, total visible, badges, metadata secundaria, archive/restore) | `app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/` |
| B | Edición rápida segura de `quantity`/`unitPrice` (reutiliza `updateItemAction` 4E.2A) | `workspace/boq-workspace.tsx` |
| C | Resumen financiero visual (7 cards ICONIC server-derived) | `workspace/boq-workspace.tsx` (sección summary) |
| D | Desglose por capítulos (participación server-side) | `server/estimates/breakdown.ts` + `workspace/page.tsx` |
| E | Simulador comercial V1 (read-only, sin persistencia) | `modules/estimates/commercial-simulation.ts` + `workspace/simulator-actions.ts` + `workspace/commercial-simulator.tsx` |
| F | Vista previa comercial (lectura limpia del resultado) | `workspace/commercial-simulator.tsx` |
| G | Dashboard operativo (KPIs + accesos rápidos) | `app/(dashboard)/dashboard/page.tsx` |

Fuera de alcance (NO implementado, por mandato): drag-and-drop/reorder,
tareas/calendario/fotos/compras/pagos/costos reales, `BOQ_REORDER`,
`lineage_id`, audit trail completo, scraping, Phase 3B, exports nuevos.

## 3. BOQ Workspace (A+B)

- **Ruta:** `…/estimates/[estimateId]/workspace` (Server Component request-time;
  CTA "Abrir workspace" en el detalle del presupuesto).
- **Lectura:** compone EXCLUSIVAMENTE `EstimatesWriteRepository` existente:
  `listChaptersByEstimateVersion` + `listItemsByChapter` con
  `includeArchived: true`. El filtro (activos/archivados/todos) y la búsqueda
  son **visibilidad client-side** sobre datos server-derived
  (`lib/estimates/workspace-view.ts`, helpers puros SIN matemática financiera).
- **Edición rápida:** el navegador envía solo
  `code/description/unit/quantity/unitPrice` a `updateItemAction` (4E.2A).
  `subtotal` y el resumen financiero vuelven del servidor (trigger DB +
  `aiu-calc`); la fila y las cards se actualizan con la respuesta y
  `router.refresh()` re-sincroniza subtotales de capítulo y desglose.
- **Inmutabilidad:** `issued/approved/archived` ⇒ banner + edición deshabilitada
  (guard server-side ya existente `BoqVersionLockedError` se mantiene como
  barrera real).
- **Feedback:** estados por fila `Guardando… / Guardado / error` (sanitizado).
- **RLS:** sin cambios; cross-org ⇒ `notFound()`; la barrera real es RLS.

## 4. Desglose confiable (D)

- `computeChapterBreakdown` (`server/estimates/breakdown.ts`): participación
  (`share`, fracción Decimal `toFixed(6)`) de cada capítulo ACTIVO sobre el
  costo directo; base cero ⇒ shares `"0"` sin división.
- **Decisión de confiabilidad:** `boq_items` NO clasifica tipo de costo
  (`apu_template_id` es nullable; ítems importados/manuales no lo traen y no
  existe columna de tipo). Por tanto NO se inventa breakdown por
  materiales/mano de obra/equipos/subcontratos. Deuda registrada:
  **COST_TYPE_BREAKDOWN_FOUNDATION** (clasificación en catálogo/snapshot BOQ
  antes de poder desglosar por tipo de costo).

## 5. Simulador comercial V1 (E+F)

- **Dominio puro:** `modules/estimates/commercial-simulation.ts`
  (`simulateCommercialPrice`, Decimal.js, sin float, sin efectos secundarios).
- **Fórmula (congelada):**

```text
subtotal_comercial     = base × (1 + ajuste_comercial/100)
descuento              = subtotal_comercial × descuento_pct/100
subtotal_con_descuento = subtotal_comercial − descuento
impuesto               = subtotal_con_descuento × impuesto_pct/100
precio_final           = subtotal_con_descuento + impuesto
diferencia_objetivo    = precio_final − precio_objetivo   (si hay objetivo)
```

- **Validación:** ajuste ∈ [−100, 100]; descuento ∈ [0, 100]; impuesto ∈
  [0, 100]; objetivo ≥ 0 opcional; vacío ⇒ 0; coma decimal y sufijo `%`
  aceptados. Errores por campo (`CommercialSimulationValidationError`).
- **Estado vs objetivo:** comparación exacta de la diferencia:
  `0 ⇒ on_target` (dentro), `>0 ⇒ above_target` (por encima),
  `<0 ⇒ below_target` (por debajo).
- **Base técnico SIEMPRE server-derived:** `simulateCommercialAction` toma
  `grandTotal` de `calculateEstimateFinancialSummary` (RLS-bound). El
  navegador NUNCA envía la base. La preview client-side es solo UX (mismo
  precedente que `AiuForm`); el resultado definitivo es server-side.
- **No-modificación:** la acción es READ-ONLY (no toca BOQ/AIU/versiones/
  exports). Disclaimer obligatorio visible:
  *"Esta simulación comercial no modifica el presupuesto técnico ni sus
  exportaciones."*
- **Persistencia: NO en esta oleada (decisión).** Persistir escenarios exigiría
  tabla nueva + políticas RLS + FORCE RLS count + harness; amplía el alcance de
  una oleada ya extensa. El simulador queda read-only en UI; la persistencia
  (tenant-scoped, trazable, aditiva) se documenta como **siguiente slice**:
  `COMMERCIAL_SIMULATION_PERSISTENCE` (ver INTEGRATION_REQUESTS).
- **Vista previa comercial (F):** card "Vista previa comercial" con total
  técnico, ajuste, descuento, impuesto, objetivo, precio final y diferencia.
  Sin PDF nuevo; exports existentes intactos.

## 6. Dashboard operativo (G)

- Sección "Operación": proyectos visibles, presupuestos activos, versiones
  emitidas, y (🔒 solo `management`/`internal`) observaciones de precio
  pendientes. Conteos tolerantes a fallo (`—` si la lectura falla; la página
  no rompe).
- Accesos rápidos: Proyectos, Catálogo, Proveedores, Inteligencia de precios.
- **Extensiones aditivas de contrato** (registradas en INTEGRATION_REQUESTS):
  - `EstimatesWriteRepository.countIssuedEstimateVersions(viewer)` (db: count
    head RLS-bound sobre `estimate_versions.status='issued'`; fixture: derivado).
  - `PriceObservationRepository.countPendingResourcePriceObservations(viewer)`
    (db: count head con filtro explícito `organization_id` + `status='pending'`;
    fixture: derivado). 🔒 expuesto solo a roles autorizados en la página.

## 7. Seguridad e invariantes (sin cambios)

- `organizationId`/`userId` server-side; RLS intacto (sin migraciones nuevas:
  **0 migraciones** en esta oleada); Decimal.js; issued inmutable;
  archive/restore intactos; Price Intelligence intacto; exports intactos;
  stashes intactos; golden master COP **372.247.170** intacto.
- Ningún derivado financiero se acepta desde el navegador (guard test:
  `tests/unit/estimates/workspace-route-config.test.ts`).

## 8. Pruebas de la oleada

| Archivo | Cobertura |
|---|---|
| `tests/unit/cost-domain/commercial-simulation.test.ts` (23) | fórmula, base cero, objetivo (3 estados), porcentajes inválidos, pureza, precisión Decimal, disclaimer |
| `tests/unit/estimates/workspace-view.test.ts` (13) | filtros activos/archivados/todos, búsqueda código/descripción sin tildes, collapse helpers, issued no editable, breakdown (shares, base cero, orden) |
| `tests/unit/estimates/workspace-route-config.test.ts` (26) | guardas de fuente: server-derived, sin subtotal del navegador, issued banner, simulador read-only/base server-side/disclaimer/sin persistencia, dashboard 🔒, sin drag-and-drop |
| `tests/unit/estimates/operational-counts.test.ts` (4) | conteos fixture + aislamiento cross-org |

## 9. Validación ejecutada (2026-06-09/10, local)

typecheck 0 · lint 0 · **875 tests PASS** (42 gated aparte) · build Next 16.2.6
(ruta `/workspace` presente) · `supabase db reset --local` 26 migraciones +
5 seeds · **RLS runtime 106/106** · **read-model isolation 12/12** ·
**gm:regression 22/22** · **gm:import PASS** (total $372.247.170, diff 1.9e-8)
· smoke E2E gated `BOQ_SMOKE_DB=1` **42/42** · `validate-claude-agents`
**214/0/0** · `git diff --check` limpio.

**main (`22a408c`) intacta · producción intacta · sin deploy · sin db push
remoto · Phase 3B NO iniciada.**
