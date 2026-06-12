# APU_COMPONENT_RESOURCE_RECONCILIATION_V1 — Informe de Descubrimiento

**Rama de auditoría:** `audit/apu-resource-reconciliation-v1`
**Fecha:** 2026-06-12
**Autor:** agent-orchestrator (inspección read-only)
**Estado:** BORRADOR — solo descubrimiento, sin implementación

---

## 1. Contexto

El importador `ENTRE_PATIOS_APU_IMPORT_V1` (FASE 4B.2, `main=d68d113`) importó
54 actividades y 217 componentes desde la hoja APU del workbook real. Los números
clave del import real, antes de la confirmación supervisada, son:

| Concepto | Cantidad |
|---|---|
| Actividades detectadas | 54 |
| Componentes detectados | 217 |
| Asociaciones exactas (code/reference/sku) | 0 |
| Sugerencias por descripción normalizada | 145 |
| Sin resolver (unresolved) | 19 |
| Ambiguos | 0 |
| Actividades BOQ vinculables | 51 |

> **Decisión de confirmación (contrato §4):** al confirmar sin aceptar sugerencias
> explícitamente, los 145 componentes sugeridos se importan **sin `resource_id`**
> (igual que los 19 sin resolver). Esa es la situación actual en producción.

---

## 2. Estado del esquema post-import

### 2.1 Tabla `apu_components`

Esquema actual (migraciones `20260530090600` + `20260613090000` + `20260615090000`):

| Columna | Tipo | Null | Relevante para reconciliación |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `apu_template_id` | uuid | NOT NULL | FK apu_templates |
| `resource_id` | uuid | NULL | **Brecha — NULL en 164 componentes** |
| `labor_role_id` | uuid | NULL | Seteado en labor; irrelevante aquí |
| `component_type` | text | NOT NULL | 'material'/'equipment'/'tool' para reconciliar |
| `quantity` | numeric(20,10) | NOT NULL | |
| `waste_pct` | numeric(20,10) | NOT NULL | |
| `unit_price_source` | text | NOT NULL | 'manual' en no-asociados; 'resource' cuando asociado |
| `unit_price_snapshot` | numeric(20,10) | NOT NULL | Precio del Excel (evidencia) |
| `total_component_cost` | numeric(20,10) | NOT NULL | Requiere recálculo si cambia snapshot |
| `sort_order` | integer | NOT NULL | |
| `notes` | text | NULL | Contiene `"Sin asociar al catálogo: '...'"`|
| `source_row` | integer | NULL | Fila Excel (provenance) |
| `source_occurrence_index` | integer | NULL | Ocurrencia (provenance) |
| `raw_code` | text | NULL | Código original del Excel |
| `raw_unit` | text | NULL | Unidad original del Excel |

**Ausente:** no hay `description` propia en `apu_components`. La descripción del
material se embebe en el campo `notes` como texto libre ("Sin asociar al catálogo:
'Arena lavada de río'"). Esta brecha dificulta la búsqueda estructurada.

**Ausente:** no hay `created_at`/`updated_at` en `apu_components` (el contrato
original lo marcó como "línea de detalle sin timestamps"). Esto impide auditar
cuándo se asoció un `resource_id` post-import.

### 2.2 Distribución de componentes tras la importación sin aceptes

| Estado | Conteo estimado | `resource_id` | `unit_price_source` |
|---|---|---|---|
| Labor (M.O.) | ~53 | NULL | 'labor_role' |
| Sugerido — no aceptado | 145 | NULL | 'manual' |
| Sin resolver (unresolved) | 19 | NULL | 'manual' |
| Asociado exacto | 0 | set | 'resource' |
| **Total** | **217** | | |

> **Indistinguibilidad post-import:** un componente "sugerido no aceptado" y uno
> "sin resolver" son **idénticos en la DB** después de la importación: ambos tienen
> `resource_id = NULL` y `unit_price_source = 'manual'`. Solo el `raw_code` y el
> fragmento de texto en `notes` pueden diferenciarlos indirectamente, pero no hay
> campo estructurado `match_status` ni `suggested_resource_id` que sobreviva.

### 2.3 Tabla `resources`

Esquema (migración `20260530090300` + `20260611090000`):

| Columna | Relevante para reconciliación |
|---|---|
| `id` | Identidad |
| `organization_id` | RLS |
| `code` | Matching exacto (índice UNIQUE) |
| `name` | Matching por descripción normalizada |
| `resource_type` | Filtro UI por tipo |
| `unit` | Verificación de compatibilidad |
| `external_reference` | Matching exacto (índice parcial) |
| `external_sku` | Matching exacto (índice parcial) |
| `active` | Filtro UI |

> El catálogo tiene recursos con `external_sku` (Decorcerámica) y `external_reference`
> importados desde listas de proveedor. Los códigos APU de la hoja (`raw_code`) no
> coinciden con `code` ni con ningún identificador externo: de ahí los 0 exactos.
> Las 145 sugerencias vinieron por descripción normalizada.

### 2.4 Tabla `resource_price_observations`

El campo relevante para la reconciliación es el precio baseline aprobado
(`status = 'approved'`). Ya existe soporte en `DbApuImportRepository.getApprovedBaselinePrices`
que lo lee durante el preview del importador. Ese mismo mecanismo es reutilizable
para mostrar el precio aprobado sugerido al reconciliar.

---

## 3. Soporte actual en las rutas `/apu` y `/apu/[id]`

### 3.1 `/apu` (catálogo de plantillas)

- Lista `apu_templates` vía `rm.listApus(viewer)`.
- Cards con código, nombre, unidad, `componentCount`, costo unitario total.
- CTA "Importar APU" (solo `management|internal`).
- **Sin soporte de reconciliación**: no hay indicador de cuántos componentes
  están sin asociar, ni enlace a flujo de reconciliación.

### 3.2 `/apu/[id]` (detalle de plantilla)

- Tabla de componentes con tipo, descripción (`resourceName ?? laborRoleName ?? '—'`),
  rendimiento, desperdicio, precio unitario, total.
- Herramienta menor derivada mostrada como fila calculada.
- Desglose por tipo de costo.
- **Sin soporte de reconciliación**: los componentes con `resource_id = NULL`
  muestran `'—'` en descripción. No hay acción para asociarlos.

---

## 4. Análisis de RLS y permisos actuales

### 4.1 `apu_templates`

- `ENABLE + FORCE ROW LEVEL SECURITY`.
- Políticas: SELECT/INSERT/UPDATE/DELETE por `organization_id = app.current_org()`.
- No hay inmutabilidad post-import (a diferencia de `apu_import_batches`).
- El UPDATE de `import_batch_id` está cubierto por el trigger `apu_template_import_batch_same_org`
  (validación cross-org); no hay política que lo restrinja a gerencia.

### 4.2 `apu_components`

- `ENABLE + FORCE ROW LEVEL SECURITY`.
- Una sola política `apu_components_all FOR ALL` con USING/WITH CHECK:
  ```sql
  EXISTS (SELECT 1 FROM apu_templates a
    WHERE a.id = apu_components.apu_template_id
      AND a.organization_id = app.current_org())
  ```
- **Cualquier rol autenticado de la org puede hacer UPDATE de `resource_id` vía
  PostgREST directamente.** No hay restricción de rol en la política.
- **No hay trigger que recalcule `total_component_cost` al cambiar `resource_id`
  o `unit_price_snapshot`.** El trigger `boq_items_recompute_subtotal` solo aplica
  a `boq_items`, no a `apu_components`.
- Riesgo: un UPDATE que cambie `unit_price_snapshot` sin recalcular
  `total_component_cost` dejaría el APU internamente inconsistente.

### 4.3 `resources`

- `ENABLE + FORCE ROW LEVEL SECURITY`.
- SELECT disponible para cualquier rol autenticado de la org.
- INSERT/UPDATE/DELETE disponibles para cualquier rol autenticado (las políticas
  actuales no restringen por rol para recursos).

### 4.4 Roles de la aplicación relevantes

| Role DB | ViewerRole app | ¿Puede importar APU? | ¿Debería reconciliar? |
|---|---|---|---|
| admin / gerencia | management | Sí | Sí |
| presupuestos | internal | Sí | Sí |
| obra / compras / consulta | — / external | No | No (readonly) |

---

## 5. Matching existente: capacidades y brechas

### 5.1 Motor de matching (matching.ts)

Orden congelado (contrato §4):

1. `raw_code` == `resource.code` (exacto, normalizado) → `exact via code`
2. `raw_code` == `resource.external_reference` → `exact via reference`
3. `raw_code` == `resource.external_sku` → `exact via sku`
4. `normalize(description)` == `normalize(resource.name)` → `suggested` (unidad opcional)
5. Sin coincidencia → `unresolved`

El motor existe como función pura en `server/apu-import/matching.ts` y
`buildResourceMatchIndex` opera sobre `ResourceIdentifier[]`. Es completamente
reutilizable para re-ejecutar el matching en la reconciliación post-import.

### 5.2 Brechas del matching para reconciliación post-import

| Brecha | Descripción |
|---|---|
| No hay `description` en `apu_components` | La descripción del insumo se guardó solo en `notes` como texto libre |
| El motor no corre over existing components | Solo corre durante el import (preview/confirm) |
| Sin persistencia del resultado del matching | No hay `suggested_resource_id` ni `match_score` |
| Sin distinción unresolved vs suggested-no-aceptado | Indistinguibles en DB |
| Sin re-matching automático cuando el catálogo crece | El catálogo puede adquirir nuevos recursos después del import |

---

## 6. Sugerencias: ¿sobreviven a la confirmación?

**No.** El campo `suggested_resource_id` no existe en `apu_components`. Al confirmar
la importación sin aceptar las 145 sugerencias:

```
// preview.ts líneas 381-399
if (acceptedId !== undefined && acceptedId === outcome.resource.id) {
  resourceForPlan = acceptedId;  // acepte explícito → resource_id en DB
} // sin acepte → resourceForPlan = null → resource_id = NULL en DB
```

El ID del recurso sugerido **no se persiste en ningún campo**. La sugerencia se
deriva dinámicamente al vuelo durante el preview; no sobrevive como dato estructurado.

**Consecuencia para la reconciliación:** hay que re-ejecutar el matching contra el
catálogo actual cada vez que se abra el flujo de reconciliación, no leer de una
sugerencia guardada. Esto es correcto: el catálogo puede haber crecido entre el
import y la reconciliación, y nuevas sugerencias podrían ser más precisas.

---

## 7. Análisis de la deuda técnica registrada

### 7.1 `BOQ_APU_RELINK_WITH_CONFIRMATION` (INTEGRATION_REQUESTS)

Deuda existente: reemplazo confirmado de `apu_template_id` en ítems BOQ.
**Diferente** de la reconciliación de componentes APU. Son deudas ortogonales:

- `BOQ_APU_RELINK_WITH_CONFIRMATION`: reemplazar el vínculo APU→BOQ ya existente.
- `APU_COMPONENT_RESOURCE_RECONCILIATION_V1`: asociar recursos del catálogo a
  componentes APU que quedaron sin `resource_id`.

### 7.2 `APU_UI_ADVANCED_EDITING_V1` (INTEGRATION_REQUESTS)

Deuda existente: editor manual de APU/componentes. La reconciliación es un
subconjunto especializado de esa deuda (editar `resource_id` de componentes
específicos). **Pueden implementarse juntos o por separado.**

### 7.3 `COST_TYPE_BREAKDOWN_FOUNDATION`

Los 164 componentes sin `resource_id` impiden el desglose materiales/MO/equipos
en BOQ. La reconciliación es el requisito previo funcional de esa deuda.

---

## 8. Solapamiento con `QUANTITY_TAKEOFF_IMPORT_V1` (FASE 4B.3)

`QUANTITY_TAKEOFF_IMPORT_V1` importa cantidades de obra (grupos/líneas de
`quantity_groups`/`quantity_lines`) y las vincula a `boq_items.quantity_group_id`.
No toca `apu_components`, `resource_id` ni precios de insumos.

El solapamiento es **nulo en lógica de negocio**. Sí comparten:
- El mismo estilo arquitectónico (preview + confirm + RPC SECURITY INVOKER).
- La reutilización del catálogo para validación de unidades.

**No hay dependencia de orden entre ambos slices**. Pueden ejecutarse en cualquier
secuencia. Sin embargo, la reconciliación de componentes APU habilita
`COST_TYPE_BREAKDOWN_FOUNDATION`, que es funcionalmente más valiosa antes de
`QUANTITY_TAKEOFF_IMPORT_V1`.

---

## 9. Riesgos identificados

| Riesgo | Severidad | Descripción |
|---|---|---|
| R-01: UPDATE sin recálculo | **ALTO** | La RLS actual permite UPDATE directo de `apu_components.resource_id` vía PostgREST sin recalcular `total_component_cost`. Un UPDATE parcial dejaría el APU inconsistente. Requiere RPC o trigger. |
| R-02: Cambio de precio snapshot | **ALTO** | Si la reconciliación permite actualizar `unit_price_snapshot` (precio del catálogo vs precio del Excel), el `total_component_cost` y el costo total del APU cambian. Requiere decisión explícita del usuario y recalculación server-side. |
| R-03: Sin audit trail | **MEDIO** | `apu_components` no tiene `updated_at`. Una reconciliación no deja rastro de cuándo ni quién asoció el recurso. |
| R-04: Indistinguibilidad unresolved/suggested | **BAJO** | El motor de re-matching re-derivará sugerencias; no es necesario distinguir históricamente, pero puede crear confusión en la UI. |
| R-05: Asociación cross-org | **BAJO** | La RLS de `apu_components` deriva la organización desde `apu_templates`, no de `resources`. Un recurso de otra org no pasaría la RLS (resources tiene su propia policy), pero una RPC explícita cierra el riesgo a nivel de dominio. |
| R-06: Solapamiento con bulk approval de precios | **BAJO** | Aceptar un recurso del catálogo no es lo mismo que aprobar su precio; ambos flujos deben mantenerse separados. La reconciliación asocia la identidad del recurso; la aprobación de precio es ortogonal. |

---

## 10. Resumen de brechas a cubrir

| # | Brecha | Impacto |
|---|---|---|
| G-01 | No hay `description` estructurada en `apu_components` | El re-matching requiere parsear `notes` |
| G-02 | No hay `updated_at` en `apu_components` | Sin audit de reconciliación |
| G-03 | No hay RPC safe de reconciliación (solo PostgREST directo) | Riesgo de inconsistencia de `total_component_cost` |
| G-04 | No hay UI de reconciliación en `/apu/[id]` | Los 164 componentes sin recurso son invisibles para el usuario |
| G-05 | El re-matching no corre automáticamente | Las sugerencias no son persistentes ni actualizadas |
| G-06 | Sin distinción visual en `/apu` de plantillas con componentes sin resolver | No hay badge ni indicador de "pendiente de reconciliación" |
| G-07 | Sin tests de reconciliación (solo tests del importador original) | Riesgo de regresión en la lógica de asociación |
