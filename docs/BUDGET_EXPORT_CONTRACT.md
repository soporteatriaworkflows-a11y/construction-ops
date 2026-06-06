# BUDGET_EXPORT_CONTRACT — Exportación protegida del presupuesto real (4E.1)

> Contrato v1. Propiedad de gobierno: `agent-orchestrator`. Implementación de
> datos: capa `EstimatesWriteRepository` (agent-db-rls). Generación de archivos:
> servicio `apps/web/server/estimates/export` (agent-exports / orquestación 4E.1).
>
> **Fuente única de datos**: el presupuesto persistido en Construction Ops
> (tablas `estimates`, `estimate_versions`, `chapters`, `boq_items`,
> `indirect_cost_rules`, `projects`, `project_scopes`, `organizations`). **NUNCA**
> se lee el Excel original ni archivos privados. Cálculo financiero reutiliza
> `calculateEstimateFinancialSummary` (4D.2); **no se duplica** lógica financiera.

## 1. Alcance

Desde el detalle del presupuesto (`ENTRE PATIOS → PRIMER PISO → PRESUPUESTO
BASE → V01`) se ofrecen dos descargas server-side:

- **Exportar Excel** (`.xlsx`)
- **Exportar PDF** (`.pdf`)

Ambos reflejan la **versión activa** (mayor `version_number`) del presupuesto,
con su BOQ, AIU persistido y total general.

## 2. Formatos y MIME

| Formato | `format` | Extensión | MIME |
|---|---|---|---|
| Excel | `xlsx` | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| PDF | `pdf` | `.pdf` | `application/pdf` |

`Content-Disposition: attachment; filename="<sanitizado>"`, `Cache-Control: no-store`.

## 3. Estructura del Excel

### Hoja 1 — `RESUMEN`
organización, proyecto, ciudad, alcance, presupuesto, versión, estado, fecha de
exportación, # capítulos, # ítems, costos directos, administración (% y valor),
imprevistos (% y valor), utilidad (% y valor), IVA sobre utilidad (% y valor),
costos indirectos, total general.

### Hoja 2 — `PRESUPUESTO`
Columnas: capítulo, nombre de capítulo, código del ítem, descripción, unidad,
cantidad, valor unitario, subtotal. Agrupación visual por capítulo (fila de
capítulo + subtotal por capítulo).

### Hoja 3 — `TRAZABILIDAD` (uso interno y secundario)
tipo, código canónico, código original (`source_code`), fila original
(`source_row`), indicador de normalización. **No se incluye en el PDF de
cliente.** Documentado: puede ocultarse/excluirse por rol en una fase posterior
(deuda `EXPORT_TRACEABILITY_BY_ROLE`).

## 4. Estructura del PDF

Encabezado sobrio; organización; proyecto; alcance; presupuesto; versión; fecha;
tabla de capítulos → actividades (código, descripción, unidad, cantidad, valor
unitario, subtotal); costo directo; AIU (A/I/U/IVA con % y valor); costos
indirectos; total general; paginación; footer discreto.

**Prohibido en el PDF**: UUID, `source_row`, detalles técnicos internos,
variables, secretos, trazabilidad histórica, texto de fixture, datos demo.

## 5. Cálculo

- `directTotal` = Σ subtotales BOQ persistidos (server-side, `Decimal`).
- AIU + montos + `indirectTotal` + `grandTotal` provienen de
  `calculateEstimateFinancialSummary` (4D.2). **No se recalcula** en el export ni
  en el navegador. Sin `float` para dinero.
- Porcentajes AIU mostrados en formato humano (`3.5` = 3.5 %).

## 6. Filename

Patrón legible y **sanitizado**:
`<PROYECTO>_<ALCANCE>_<PRESUPUESTO>_<VERSION>.<ext>`, p. ej.
`ENTRE_PATIOS_PRIMER_PISO_PRESUPUESTO_BASE_V01.xlsx`.

Sanitización: mayúsculas; diacríticos removidos; sólo `[A-Z0-9_]`; espacios →
`_`; colapso de `_`; sin separadores de ruta (`/ \\`), sin `..`, sin `:`. Si
queda vacío ⇒ `PRESUPUESTO`. Longitud acotada.

## 7. Permisos y seguridad

- **Viewer requerido** vía `resolveViewer()` (demo → viewer fixture; supabase →
  `resolveAuthenticatedViewer()`; sin sesión ⇒ 401). Sin fallback entre modos.
- Validación de cadena: el `estimateId` debe resolver a un presupuesto visible
  (RLS) cuyo `projectScopeId === scopeId` y `projectId === projectId` de la ruta.
  Discrepancia o cross-org ⇒ **404** (RLS es la barrera real).
- **Sin service-role.** Cliente server RLS-bound.
- No se confía en IDs sin validar; no se exponen rutas públicas sin sesión.
- Generación **100 % server-side**, en memoria (`Uint8Array`); sin temporales en
  disco; el archivo no se persiste. Logs sin contenido completo ni datos
  sensibles (sólo formato/tamaño/HTTP).
- Sin fallback silencioso db→fixture (selector `READ_MODEL_SOURCE`).

## 8. Errores (sanitizados, JSON `{ error: string }`)

| Situación | HTTP |
|---|---|
| `format` ausente/no válido | 400 |
| `estimateId`/`projectId`/`scopeId` ausente | 400 |
| Sin sesión (modo supabase) | 401 |
| Presupuesto inexistente / cross-org / cadena inconsistente | 404 |
| Export supera tamaño máximo | 413 |
| Error interno de generación | 500 |

Nunca se propaga SQL/stack al consumidor.

## 9. Límites

- `EXPORT_MAX_BYTES` razonable (≈ 15 MB). El presupuesto real (~14 capítulos /
  ~132 ítems) genera archivos < 1 MB.
- Runtime `nodejs` (no edge) por `@react-pdf/renderer` y `exceljs`. Render
  síncrono en memoria; muy por debajo del timeout de función.

## 10. Comportamiento fixture/db

- **db**: lee el presupuesto real RLS-bound; AIU y total reflejan lo persistido.
- **fixture**: lee el golden master sanitizado; sin reglas AIU ⇒ total general =
  costo directo (consistente con 4D.2). Útil para la demo sin datos privados.

## 11. Rollback

Funcionalidad puramente aditiva (rutas/UI/servicio nuevos; sin migración; sin
cambios en datos productivos). Rollback = revertir el merge de
`integration/wave-4e1-budget-exports`. Tag estable previo:
`wave-4d2-editable-aiu-production-v1`.

## 12. Deudas registradas (`docs/INTEGRATION_REQUESTS.md`)

- `EXPORT_TRACEABILITY_BY_ROLE` — ocultar/excluir hoja TRAZABILIDAD según rol.
- `EXPORT_PROFILES_FOR_ESTIMATE` — perfiles de privacidad (cliente vs interno)
  para el export del presupuesto real, reusando la noción de perfiles de la
  Oleada 3 sobre este nuevo camino de datos.
