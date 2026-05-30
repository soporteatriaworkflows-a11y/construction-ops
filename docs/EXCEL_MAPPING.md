# Excel Mapping — Construction Ops

Este documento es propiedad de **agent-excel-mapper**. Mapea el Excel
golden master del cliente a las entidades de la base de datos y
documenta fórmulas, inputs y dependencias cruzadas.

> ⏳ **Pendiente**: el detalle se completa durante la Oleada 1 cuando
> agent-excel-mapper procese el archivo real ubicado en `private/`.
> El archivo Excel original NO debe estar en Git.

---

## Archivo fuente

- **Ubicación**: `private/` (no versionado).
- **Sanitización**: nombres propios, NITs, RUTs, direcciones y teléfonos
  se reemplazan en los fixtures.
- **No subir** `*.xlsx` ni `*.xls` al repositorio.

---

## Hojas a documentar

| Hoja | Propósito | Estado |
|------|-----------|--------|
| RESUMEN | Resumen general del presupuesto | ⏳ Por mapear |
| COTIZACION FULL | Cotización completa | ⏳ Por mapear |
| APU | Análisis de precios unitarios | ⏳ Por mapear |
| COTIZACION 1 PISO | Cotización primer piso | ⏳ Por mapear |
| ACTA DE MODIFICACION 01 | Órdenes de cambio | ⏳ Por mapear |
| RESUMEN 1 PISO | Resumen primer piso | ⏳ Por mapear |
| CANTIDADES 1 PISO | Cantidades primer piso | ⏳ Por mapear |
| CANTIDADES | Cantidades generales | ⏳ Por mapear |
| LISTADO MATERIALES | Catálogo de materiales | ⏳ Por mapear |
| CANT COMPLETO | Cantidades completas | ⏳ Por mapear |

Para cada hoja documentar:

- Propósito y rango de datos.
- Columnas y su significado.
- Celdas input (manuales) vs derivadas (fórmulas).
- Fórmulas exactas de celdas clave.
- Referencias a otras hojas.
- Formato condicional relevante.
- Datos a sanitizar.

---

## Valores de regresión — Primer piso

Fuente de verdad para validar que la importación y los cálculos del
sistema reproducen fielmente el Excel.

| Campo | Valor exacto | Tolerancia |
|-------|-------------|------------|
| costos_directos      | 336 084 479.93690735 | ±0.01 COP |
| administracion       |  11 762 956.797791759 | ±0.01 COP |
| imprevistos          |   8 402 111.998422684 | ±0.01 COP |
| utilidad             |  13 443 379.197476294 | ±0.01 COP |
| iva_sobre_utilidad   |   2 554 242.047520496 | ±0.01 COP |
| costos_indirectos    |  36 162 690.04121123  | ±0.01 COP |
| total_costo          | 372 247 169.9781186   | ±0.01 COP |
| area_construida      |        236.77900000000005 | ±0.001 |
| valor_m2             |   1 572 129.1583211287 | ±0.01 COP |

> **No alterar fórmulas** para forzar coincidencia: si hay diferencia,
> registrar en `docs/OPEN_QUESTIONS.md` y reportar al orquestador.

---

## Mapeo Excel → DB (a completar)

| Hoja Excel | Celda/Col | Entidad DB | Campo DB | Notas |
|------------|-----------|-----------|---------|-------|
| _por completar_ | | | | |

---

## Fixture JSON

- Ubicación: `scripts/fixtures/`.
- Formato: JSON sanitizado y validado contra el esquema.
- Idempotencia: el importador puede ejecutarse N veces produciendo el
  mismo estado.

---

## Importador

- Ubicación: `scripts/excel-import/`.
- Stack preferido: TypeScript + ExcelJS o SheetJS.
- Reglas:
  1. Idempotente.
  2. Valida campos requeridos antes de insertar.
  3. Sanitiza datos personales.
  4. Reporta diferencias contra valores de regresión.
  5. No altera el Excel original.
