# AIU_CRUD_CONTRACT — AIU editable + costos indirectos + total general (Oleada 4D.2)

Estado: **CONGELADO v1** (2026-06-05). Propiedad: `agent-orchestrator`.
Implementan: `agent-db-rls` (repo) y `agent-frontend-boq` (UI/action).

Mantiene la disciplina de 4B/4C/4D.1: deny-by-default, RLS, aislamiento por
organización, todo monto derivado server-side, sin fallback silencioso db→fixture,
errores sanitizados. **Sin migración** (reutiliza `indirect_cost_rules`).

## §1 — Decisión funcional

Los porcentajes de AIU son **por `estimate_version`**, **editables**, y **NO**
hardcodeados como regla global de ICONIC ni precargados como defaults de
organización. El presupuesto real define los suyos manualmente desde la UI.

## §2 — Modelo persistido (reutilizado, sin migración)

Tabla `indirect_cost_rules` (mig. `20260530090700`), una fila por concepto, por
versión activa:

| code | name | base_type | percentage (fracción) | sort_order |
|------|------|-----------|------------------------|------------|
| `A`   | Administración        | `direct_cost` | adminFraction      | 0 |
| `I`   | Imprevistos           | `direct_cost` | contingencyFraction| 1 |
| `U`   | Utilidad              | `direct_cost` | utilityFraction    | 2 |
| `IVA` | IVA sobre utilidad    | `utility`     | utilityVatFraction | 3 |

`percentage` se persiste como **fracción** (`NUMERIC(20,10)`, `≥0`): la UI usa
formato humano `3.5` (= 3.5 %) y se guarda `0.035` (humano ÷ 100). Índice único
`(estimate_version_id, code)` ⇒ upsert idempotente. No se persisten montos (se
derivan). `base_type` ∈ {direct_cost, utility, custom} (CHECK existente).

## §3 — Fórmulas (server-side, Decimal/NUMERIC, sin float)

Fuente confiable: `directTotal` = **Σ** subtotales BOQ persistidos de la versión
activa (recalculada server-side; nunca del navegador).

```
administrationAmount = directTotal × administrationFraction
contingencyAmount    = directTotal × contingencyFraction
utilityAmount        = directTotal × utilityFraction
utilityVatAmount     = utilityAmount × utilityVatFraction
indirectTotal        = administrationAmount + contingencyAmount + utilityAmount + utilityVatAmount
grandTotal           = directTotal + indirectTotal
```

El navegador NO es fuente confiable de `directTotal`, montos, `indirectTotal` ni
`grandTotal`: solo envía los 4 **porcentajes** permitidos.

## §4 — Inputs / derivados / reglas

- **Inputs del navegador (únicos)**: `administrationRate`, `contingencyRate`,
  `utilityRate`, `utilityVatRate` (formato humano, p. ej. `3.5`).
- **Derivados server-side**: viewer, organizationId, estimateId, activeVersionId,
  directTotal, los 5 montos + grandTotal, timestamps.
- **Validación**: cada porcentaje `≥ 0` y `≤ 100` (humano); inválido/negativo/
  excesivo ⇒ error. Solo los 4 conceptos conocidos (kinds desconocidos bloqueados).
- **Edición por estado**: editable solo si la versión NO está emitida (status ∈
  {draft, review}); `approved`/`issued`/`archived` ⇒ **read-only** (la RLS de
  `indirect_cost_rules_update/insert` ya lo exige vía `NOT estimate_version_locked`).
- **Seguridad**: deny sin sesión/membresía; cross-org bloqueado (RLS); upsert
  atómico (un statement PostgREST con `onConflict`); sin service-role; sin fallback
  fixture en `db`. Fixture: lectura demo; escritura no soportada.

## §5 — Repositorio (`apps/web/server/estimates/`)

`EstimatesWriteRepository` (db RLS-bound + fixture):
- `getEstimateVersionAiu(viewer, estimateId)` → rates en formato humano de la
  versión activa (`isEmpty` si no hay reglas; `editable` por estado).
- `updateEstimateVersionAiu(viewer, estimateId, input)` → valida + upsert atómico
  de las 4 filas (fracciones). Solo `db`; fixture ⇒ `AiuWriteNotSupportedError`.
- `calculateEstimateFinancialSummary(viewer, estimateId)` → `directTotal` + montos
  + `grandTotal` (Decimal). Tipos client-safe en `@/lib/estimates/aiu-types`.

## §6 — UI

En `/projects/[id]/scopes/[scopeId]/estimates/[estimateId]`, sección **"AIU y costos
indirectos"** con indicador discreto **"AIU ajustable por versión"**:
- Formulario editable (Administración/Imprevistos/Utilidad/IVA sobre utilidad, en %
  humano) + resumen (Costos directos, A, I, U, IVA, Costos indirectos, **Total
  general**) con `formatCOP`. Preview client-side inmediata; cálculo definitivo
  server-side al **Guardar ajustes**; banner de éxito; errores sanitizados.
- NO precargar `3.5/2.5/4/19` como default global (vacío/cero si no hay reglas; la
  usuaria los escribe). Versión bloqueada ⇒ campos read-only + CTA deshabilitado +
  mensaje honesto.

## §7 — Fuera de alcance / deudas

NO: control de pagos, anticipo, actas, liquidación, retenciones, descuentos,
presets por organización, edición BOQ, nuevas versiones, exports. Deudas futuras:
- **`AIU_PRESETS_BY_ORGANIZATION`**: plantillas AIU sugeridas por empresa/tipo de
  obra (nunca defaults globales automáticos).
- **`AIU_IMPORT_PREFILL_FROM_EXCEL`**: el Preview de Excel podrá **sugerir** los
  porcentajes AIU detectados (sección excluida en 4C.2); la usuaria los confirma
  antes de guardar; nunca se convierten en defaults globales.
