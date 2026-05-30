# Fixture sanitizado — ENTRE PATIOS / Primer piso

Propiedad de **agent-excel-mapper**. Archivo de datos derivado del golden
master `COT.ENTRE PATIOS 1 PISO (1).xlsx` (NO versionado).

## Contrato

Respeta **API_CONTRACTS v1** (congelado 2026-05-29):

- TypeScript `camelCase` para campos.
- Dinero/decimales/porcentajes como **`string` decimal** (`DecimalString`),
  nunca `number`.
- UUID como `string`; fechas como ISO 8601 (`string`).
- Las interfaces de cada bloque son exactamente las de `docs/API_CONTRACTS.md`
  (`Organization`, `Project`, `ProjectScope`, `Resource`, `Supplier`,
  `SupplierProduct`, `PriceObservation`, `PricingRule`, `LaborRole`,
  `ApuTemplate`, `ApuComponent`, `Estimate`, `EstimateVersion`, `Chapter`,
  `BoqItem`, `IndirectCostRule`, `QuantityGroup`, `QuantityLine`).

## Bloque `estimateTotals` (fuente de verdad de regresión)

No corresponde a una entidad del contrato: es un bloque auxiliar que
transcribe **exactos** los 9 indicadores de `PROJECT_MASTER §3.4`. Es la
fuente de verdad de la regresión financiera. Lo consumen:

- `scripts/golden-master/first-floor.regression.test.ts`
- `agent-cost-domain` (Oleada 2) como oráculo
- `agent-qa` (Oleada 4)

## Sanitización aplicada

| Categoría | Tratamiento |
|---|---|
| Nombre del cliente / razón social | Reemplazado por `Constructora Demo S.A.S.` / `Proyecto Entre Patios` |
| NIT / RUT | Eliminado (no se incluye) |
| Dirección / teléfono / contacto | Eliminado (`contactData: null`) |
| Nombres de proveedores reales | Reemplazados por `Proveedor *** Demo` |
| Precios de nómina | Valores ficticios plausibles (no reales) |
| SKU / URL de proveedor | Ficticios o `null` |

## BOQ real fila por fila (v2.0.0 — 2026-05-30)

`chapters` (14) y `boqItems` (131) se extraen **fila por fila** del Excel real
con `scripts/golden-master/build-fixture.mjs` (lee `COTIZACION 1 PISO` y
`RESUMEN 1 PISO`). **NO hay ítem de balanceo artificial**: `Σ subtotales =
costos_directos` dentro de ±0.01 COP (residual float ~2e-8 propio de las sumas
del Excel). `estimateTotals` lleva los 9 valores autoritativos leídos de
`RESUMEN 1 PISO!E27:E35`.

Las secciones `resources`, `suppliers`, `apuTemplates`, `apuComponents`,
`quantityGroups`, `quantityLines` son una **muestra representativa** sanitizada
que ejercita el importador y respeta el contrato v1 (el detalle de APU/cantidades
por ítem se poblará en oleadas posteriores; los `boqItems` cargan su
`unitPriceSnapshot`/`subtotal` directamente, como define el contrato).

Privacidad: contratante/contratista/encargado/N° de cotización del Excel NO se
copian; verificación de fugas por **hash** (sin almacenar nombres en el repo).
