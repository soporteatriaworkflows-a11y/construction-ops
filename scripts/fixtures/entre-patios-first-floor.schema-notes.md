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

## Muestra representativa vs detalle completo

Las secciones `resources`, `suppliers`, `apuTemplates`, `apuComponents`,
`boqItems`, `quantityGroups`, `quantityLines` son una **muestra
representativa** que ejercita el importador y respeta el contrato. El ítem
BOQ `9.99` ("Balanceo cantidades restantes") es **relleno declarado** para que
`Σ subtotales = costos_directos` exacto; NO es un dato real del Excel.

El detalle real fila a fila se poblará cuando se pueda ejecutar
`scripts/golden-master/dump-workbook.mjs` sobre el Excel privado (requiere
permiso de ejecución sobre `private/`). Hasta entonces, la regresión se valida
contra `estimateTotals` (autoritativo) y contra la cadena de fórmulas
recalculada.
