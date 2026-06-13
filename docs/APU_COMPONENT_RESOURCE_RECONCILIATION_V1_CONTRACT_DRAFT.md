# APU_COMPONENT_RESOURCE_RECONCILIATION_V1 — Contrato Preliminar (BORRADOR)

**Rama de auditoría:** `audit/apu-resource-reconciliation-v1`
**Fecha:** 2026-06-12
**Estado:** BORRADOR — requiere aprobación del orquestador antes de implementar
**Predecesor:** `docs/ENTRE_PATIOS_APU_IMPORT_V1_CONTRACT.md`
**Descubrimiento:** `docs/APU_COMPONENT_RESOURCE_RECONCILIATION_V1_DISCOVERY.md`

---

## 1. Alcance y objetivo

Diseñar el flujo para que un usuario interno (management/internal) pueda
asociar explícitamente recursos del catálogo a los componentes APU importados
que quedaron sin `resource_id` (164 de 217 componentes no-labor en el
importador real de Entre Patios).

```
/apu/[id] → ver componentes sin asociar
  → re-matching automático (sugerencias dinámicas)
  → aceptar sugerencia ó buscar manualmente ó crear recurso
  → confirmar individualmente ó aprobar masivo con preview
  → RPC safe → resource_id + unit_price_source + recálculo server-side
  → audit trail
```

Invariantes absolutos (heredados del importador):

- El catálogo nunca se modifica silenciosamente.
- Un `resource_id` de otra organización no puede asociarse (RLS + validación de dominio).
- `total_component_cost` SIEMPRE se recalcula server-side (nunca el del cliente).
- Snapshots de cálculo APU existentes (`apu_calculation_snapshots`) son inmutables.
- No se aprueba ningún precio automáticamente.
- Los roles sin permiso (obra/compras/consulta) ven solo lectura.

---

## 2. Sugerencias: persistencia y ciclo de vida

Las sugerencias del importador original **no sobreviven** a la confirmación
(ver Discovery §6). El motor de matching no persiste el `suggested_resource_id`.

**Decisión de diseño del borrador:** las sugerencias son **dinámicas y efímeras**
en la reconciliación también. Cada vez que el usuario abre el flujo de
reconciliación de un componente, el servidor re-ejecuta `matchMaterialComponent`
contra el catálogo actual. Esto tiene dos ventajas:

1. El catálogo puede haber crecido después del import (nuevos recursos = nuevas
   sugerencias que antes eran `unresolved`).
2. No requiere migración para persistir `suggested_resource_id`.

**No se guarda ninguna sugerencia en la DB** hasta que el usuario la acepta.

---

## 3. Schema mínimo requerido

### 3.1 Opciones evaluadas

**Opción A — Sin migración (solo RPC + trigger):**
Añadir un trigger `BEFORE UPDATE ON apu_components` que recalcule
`total_component_cost` cuando cambie `unit_price_snapshot`, `quantity` o
`waste_pct`. La reconciliación ocurre vía RPC `reconcile_apu_component`
(SECURITY INVOKER, RLS-bound, con validación de org y recálculo).

**Opción B — Migración mínima (campo `description` + `updated_at`):**
Añadir `description text` (extraída de `notes` en los componentes importados)
y `updated_at timestamptz` a `apu_components`. Habilita búsqueda estructurada
y audit trail completo.

**Opción C — Migración con campo `reconciliation_status`:**
Añadir además `reconciliation_status text CHECK ('pending','accepted','rejected')`
para distinguir post-hoc entre componentes aún no revisados, ya asociados y
explícitamente rechazados.

**Recomendación del borrador: Opción B** como mínimo. El campo `description` es
necesario para que la reconciliación sea operable (la búsqueda sobre `notes` como
texto libre es frágil). El campo `updated_at` es necesario para auditoría básica.
El campo `reconciliation_status` (Opción C) añade complejidad y puede derivarse
en la consulta (`resource_id IS NOT NULL` = aceptado; `resource_id IS NULL` = pending).

### 3.2 Migración propuesta (si se aprueba Opción B)

```sql
-- Aditiva, reversible, sin DROP ni DELETE.
ALTER TABLE apu_components
  ADD COLUMN description text,   -- extrae de notes al momento de migrar (backfill opcional)
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX apu_components_template_unresolved_idx
  ON apu_components (apu_template_id)
  WHERE resource_id IS NULL
    AND labor_role_id IS NULL
    AND unit_price_source = 'manual';

CREATE TRIGGER apu_components_set_updated_at
  BEFORE UPDATE ON public.apu_components
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
```

> **Nota sobre el backfill de `description`:** se puede derivar de `notes` para
> los componentes ya importados (extrayendo el texto entre comillas de
> "Sin asociar al catálogo: '...'"). El backfill es opcional; si no se hace, la
> descripción queda NULL para los componentes históricos y la UI muestra `raw_code`
> como fallback.

### 3.3 RPC propuesta: `reconcile_apu_component`

```sql
-- SECURITY INVOKER: RLS aplica a cada lectura/escritura.
-- Sin service-role. Solo autenticado con rol admin/gerencia/presupuestos.
CREATE OR REPLACE FUNCTION public.reconcile_apu_component(
  p_component_id  uuid,
  p_resource_id   uuid,           -- nuevo resource_id (NOT NULL: acción = asociar)
  p_keep_snapshot boolean DEFAULT true  -- true = conservar unit_price_snapshot del Excel
                                        -- false = usar precio aprobado más reciente
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER ...
```

Lógica interna:

1. Leer el componente (RLS verifica org via template).
2. Verificar que el componente NO es de tipo labor (`unit_price_source != 'labor_role'`).
3. Verificar que el recurso existe y pertenece a la misma org.
4. Si `p_keep_snapshot = false`: leer el precio baseline aprobado de
   `resource_price_observations`; si no hay, error informativo con opción de
   continuar con snapshot existente.
5. Calcular `total_component_cost = round(quantity × (1 + waste_pct) × price, 10)`.
6. UPDATE con `resource_id`, `unit_price_source = 'resource'`, `unit_price_snapshot`,
   `total_component_cost`, `updated_at = now()`.
7. Devolver `{ componentId, resourceId, newTotal, snapshotSource }`.

**Variante bulk:** `reconcile_apu_components_bulk(p_pairs jsonb)` — array de
`{componentId, resourceId, keepSnapshot}` con máximo 50 pares por llamada,
misma transacción, misma validación individual, conteos de éxito/error.

### 3.4 Trigger de recálculo (complementario a la RPC)

Para cerrar el riesgo de UPDATE directo vía PostgREST (RLS actual permite ALL):

```sql
CREATE OR REPLACE FUNCTION public.apu_component_recompute_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.total_component_cost :=
    round(NEW.quantity * (1 + NEW.waste_pct) * NEW.unit_price_snapshot, 10);
  RETURN NEW;
END;
$$;

CREATE TRIGGER apu_components_recompute_total
  BEFORE INSERT OR UPDATE ON public.apu_components
  FOR EACH ROW EXECUTE FUNCTION public.apu_component_recompute_total();
```

Este trigger garantiza la invariante financiera independientemente de si el UPDATE
viene de la RPC, de PostgREST o de cualquier otro camino.

---

## 4. Estrategia de matching para reconciliación

El re-matching reutiliza el motor puro existente (`matching.ts`) con los mismos
índices y orden de prioridad.

### 4.1 Entrada del matching en reconciliación

Para cada componente con `resource_id IS NULL` (no-labor):

```ts
const input = {
  rawCode: component.raw_code ?? '',
  description: component.description ?? parseDescriptionFromNotes(component.notes),
  rawUnit: component.raw_unit ?? '',
};
const outcome = matchMaterialComponent(index, input);
```

### 4.2 Salida esperada por componente

| outcome.kind | Acción sugerida en UI |
|---|---|
| `exact` | Badge verde "Coincidencia exacta"; aceptar en 1 clic |
| `suggested` | Badge amarillo "Sugerido por nombre"; mostrar recurso + advertencia de unidad si aplica; aceptar explícitamente |
| `ambiguous` | Badge naranja "Ambiguo"; mostrar candidatos; el usuario elige |
| `unresolved` | Badge rojo "Sin coincidencia"; el usuario busca manualmente o crea recurso |

### 4.3 Búsqueda manual

Si el matching no sugiere nada útil, la UI ofrece una búsqueda inline sobre
`resources` de la org (filtro por `name ILIKE`, `code ILIKE`, `resource_type`).
La búsqueda es RLS-bound; no se diseña un endpoint nuevo: reutiliza el
`listResourceIdentifiers` del repositorio del importador.

Máximo 20 resultados en la búsqueda inline para evitar overhead de lectura.

### 4.4 Creación de recurso (opcional)

Si el insumo no existe en el catálogo, el usuario puede crear el recurso mínimo
(code, name, resource_type, unit) usando la ruta existente `/catalog/resources/new`.
Flujo:
1. Botón "Crear recurso nuevo" abre `/catalog/resources/new` en pestaña nueva.
2. Tras crear, el usuario regresa a la reconciliación y recarga; el recurso
   ya aparecerá en el matching o en la búsqueda manual.
3. **No se crea el recurso inline** en la reconciliación (principio de mínimo alcance).

---

## 5. Aprobación individual

### 5.1 Flujo UX

```
/apu/[id] → sección "Componentes sin asociar" (collapsada si 0)
  → listado de componentes con resource_id = NULL (no-labor)
  → por cada componente:
      → descripción (del campo o de notes)
      → raw_code / raw_unit
      → sugerencia dinámica (si existe) con badge de confianza
      → botón "Aceptar sugerencia" (si kind = suggested | exact)
      → botón "Buscar en catálogo" → panel de búsqueda inline
      → botón "Crear recurso" → link a /catalog/resources/new
  → al seleccionar recurso:
      → modal de confirmación con:
          → nombre del recurso seleccionado
          → precio snapshot del Excel vs precio baseline aprobado (si existe)
          → opción: conservar precio Excel / usar precio aprobado
          → advertencia si unidades difieren
      → confirmar → Server Action → RPC reconcile_apu_component
      → costo total del APU se recalcula y muestra actualizado
```

### 5.2 Server Action

```ts
// apps/web/app/(dashboard)/apu/[id]/actions.ts
export async function reconcileApuComponentAction(
  componentId: string,
  resourceId: string,
  keepSnapshot: boolean,
): Promise<{ success: boolean; newTotal?: string; error?: string }>
```

- `organizationId` y `userId` siempre server-side.
- Llama a RPC `reconcile_apu_component`.
- Solo roles management/internal (mismo guard que el importador).

---

## 6. Aprobación masiva segura

### 6.1 Condiciones de seguridad

La aprobación masiva es **opt-in con preview obligatorio**. No hay auto-aprobación.

Precondiciones:
- Mostrar tabla de preview: componente → recurso sugerido → precio → delta.
- Selección explícita por checkbox (no "seleccionar todos" por defecto).
- Modal de confirmación con conteo y advertencias agregadas.
- Máximo 50 componentes por acción masiva.
- No permite mezclar "mantener snapshot" y "usar precio aprobado" en una sola
  acción masiva: el usuario elige la política para todo el lote.

### 6.2 Flujo UX masivo

```
/apu/[id] → botón "Reconciliar lote" (visible si ≥2 componentes sin asociar)
  → preview: tabla con (descripción, recurso sugerido, confianza, precio, delta)
  → checkboxes de selección
  → selección de política de precio (conservar Excel / usar aprobado)
  → modal: "Vas a asociar N componentes. Esta acción actualiza los costos del APU."
  → confirmar → Server Action → RPC reconcile_apu_components_bulk
  → reporte: N asociados, M fallidos (con razón), nueva tabla de costos
```

### 6.3 Idempotencia del bulk

La RPC verifica por componente: si `resource_id` ya está seteado (carrera de
concurrencia), la fila se salta con `status: 'already_reconciled'`, no falla.
El resultado reporta cuántos fueron nuevos vs ya asociados.

---

## 7. Advertencias a exponer

| Advertencia | Cuándo mostrar |
|---|---|
| Unidad del recurso difiere de la unidad del APU (`raw_unit`) | Siempre que `!unitsEquivalent(resource.unit, raw_unit)` |
| Precio del catálogo difiere del snapshot Excel (>0.01 COP) | Cuando `p_keep_snapshot = false` y el precio aprobado difiere |
| Sin precio baseline aprobado para el recurso elegido | Cuando `p_keep_snapshot = false` y no hay observación aprobada |
| Recurso inactivo en el catálogo | Cuando `resource.active = false` |
| Reconciliación cambia el costo total del APU significativamente (>5%) | Comparar `recalculatedTotal_after vs before` |

---

## 8. Manejo de componentes sin resolver (unresolved)

Los 19 componentes verdaderamente sin resolver (sin coincidencia en el catálogo)
requieren una de estas acciones:

1. **Crear el recurso** en el catálogo (`/catalog/resources/new`) y volver.
2. **Reconciliar con recurso existente aproximado** (el usuario elige manualmente).
3. **Dejar sin asociar** (mantener `resource_id = NULL`, `unit_price_source = 'manual'`).
   En este caso el componente sigue usando el precio del Excel como snapshot; no es
   incorrecto financieramente, pero no está vinculado al catálogo.

No hay acción de "rechazar permanentemente" en este borrador (no se añade
`reconciliation_status = 'rejected'`). Si se desea marcar un componente como
"deliberadamente sin catálogo", se puede añadir `notes` descriptivo o diferir
al slice `APU_UI_ADVANCED_EDITING_V1`.

---

## 9. Permisos y RLS

### 9.1 Restricción de rol en la RPC

La RPC `reconcile_apu_component` debe verificar explícitamente el rol del
invocador antes de ejecutar:

```sql
IF (SELECT role FROM profiles WHERE id = app._auth_uid())
   NOT IN ('admin', 'gerencia', 'presupuestos') THEN
  RAISE EXCEPTION 'insufficient_role' USING ERRCODE = '42501';
END IF;
```

Paridad con el importador (roles 'admin'/'gerencia' en la policy de
`apu_import_batches`; 'management'/'internal' = 'admin'/'gerencia'/'presupuestos'
en la app).

### 9.2 Políticas RLS de `apu_components` a endurecer

La política actual `apu_components_all FOR ALL` es demasiado permisiva para UPDATE.
Se propone añadir una política específica que restrinja UPDATE:

```sql
-- Reemplazar el FOR ALL genérico o añadir política UPDATE específica
CREATE POLICY apu_components_update_authorized ON apu_components
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM apu_templates a
    WHERE a.id = apu_components.apu_template_id
      AND a.organization_id = app.current_org()
  ))
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
    IN ('admin', 'gerencia', 'presupuestos')
    AND EXISTS (...)
  );
```

> **Advertencia:** modificar la política `apu_components_all FOR ALL` afecta
> los 22 checks del harness RLS sección [21]. Actualizar el harness antes de
> hacer `db push`.

### 9.3 Validación cross-org del recurso seleccionado

La RPC debe verificar que `resources.organization_id = v_org` para el recurso
proporcionado, aunque la RLS de `resources` lo haga también. La verificación
explícita en el dominio previene errores informativos confusos (no-found vs
cross-org).

---

## 10. Idempotencia

- La reconciliación individual es idempotente: llamar `reconcile_apu_component`
  con el mismo `componentId` + `resourceId` + `keepSnapshot` produce el mismo
  resultado.
- Llamar con un `resourceId` diferente sobre un componente ya reconciliado:
  **actualiza** el vínculo (es una operación válida, no un error). La política
  de rol (admin/gerencia/presupuestos) es el guard.
- El bulk maneja carreras marcando las filas ya reconciliadas como
  `already_reconciled` sin fallo.

---

## 11. Auditoría

Mínimo viable con la migración propuesta (Opción B):

- `apu_components.updated_at` — timestamp de última modificación.
- `notes` — ya contiene el historial textual ('Asociado por sugerencia aceptada
  explícitamente.' / 'Sin asociar al catálogo: "..."').

Auditoría completa (diferida al slice `BOQ_AUDIT_TRAIL` o `APU_UI_ADVANCED_EDITING_V1`):
- Tabla `apu_component_audit_log (component_id, action, old_resource_id,
  new_resource_id, changed_by, changed_at)` — fuera del alcance de este borrador.

---

## 12. UI — Especificación de pantallas

### 12.1 `/apu` — indicador de reconciliación pendiente

- Badge "N sin asociar" en cada card de APU template donde haya componentes
  con `resource_id IS NULL` y `unit_price_source = 'manual'`.
- El badge es informativo, no bloquea. Solo visible para management/internal.

### 12.2 `/apu/[id]` — sección de reconciliación

```
[Sección: Componentes sin asociar al catálogo]  ← collapsable; oculto si 0
  Descripción de la sección con el total (N de M componentes sin recurso)
  Tabla:
    | Fila | Código original | Descripción | Unidad | Sugerencia | Acciones |
    | 42   | C-ARENA-1       | Arena lavada| m³     | 🟡 Arena de río (catálogo) | [Aceptar] [Buscar] |
    | 57   | EQ-COMP-1       | Compactador | día    | 🔴 Sin coincidencia | [Buscar] [Crear] |

  Panel de búsqueda inline (toggle por fila):
    Input de búsqueda → resultados (código, nombre, unidad, tipo)
    → seleccionar → modal de confirmación

  Botón "Reconciliar lote seleccionado" (visible si ≥2 seleccionados con sugerencia)
    → preview masivo → confirmar
```

### 12.3 Modal de confirmación individual

```
Asociar recurso al componente
─────────────────────────────
Componente: Arena lavada de río (fila 42, código C-ARENA-1)
Recurso seleccionado: ARENA-RIO-01 — Arena de río lavada (m³)

⚠ La unidad del catálogo (m³) coincide con la del APU (m3) [equivalentes]

Precio actual en APU:  $18,500 / m³  (del Excel)
Precio aprobado en catálogo:  $19,200 / m³  (aprobado 2026-06-10)

● Conservar precio del Excel ($18,500)   ← default
○ Usar precio aprobado del catálogo ($19,200)

[Cancelar]   [Confirmar asociación]
```

---

## 13. Tests requeridos

### 13.1 Unitarios / dominio

| # | Descripción |
|---|---|
| T-01 | Re-matching devuelve `exact` cuando catálogo tiene el código exacto (código creado después del import) |
| T-02 | Re-matching devuelve `suggested` con `unitMismatch` correcto |
| T-03 | Re-matching devuelve `unresolved` cuando catálogo no tiene el recurso |
| T-04 | `reconcile_apu_component` recalcula correctamente `total_component_cost` |
| T-05 | `reconcile_apu_component` rechaza recurso de otra organización |
| T-06 | `reconcile_apu_component` rechaza componente de tipo labor |
| T-07 | Bulk idempotente: segunda llamada sobre componente ya reconciliado → `already_reconciled` |
| T-08 | Trigger `apu_component_recompute_total` recalcula al cambiar `unit_price_snapshot` directamente |

### 13.2 Regresión financiera

| # | Descripción |
|---|---|
| T-09 | El costo total del APU template se recalcula correctamente tras reconciliar N componentes |
| T-10 | El golden master (`gm:regression`) no regresa: la reconciliación NO toca `boq_items` ni snapshots |
| T-11 | `apu_calculation_snapshots` son inmutables (no UPDATE/DELETE) con o sin reconciliación |

### 13.3 RLS estáticos (paridad con tests 43–47 del importador)

| # | Descripción |
|---|---|
| T-12 | La RPC `reconcile_apu_component` es SECURITY INVOKER (no SECURITY DEFINER) |
| T-13 | La RPC deniega a roles `obra`/`compras`/`consulta` |
| T-14 | Cross-org bloqueado: recurso de org B no puede asociarse a componente de org A |
| T-15 | `apu_components` ENABLE + FORCE RLS verifica que el tenant-scope se mantiene |

### 13.4 Integración / e2e

| # | Descripción |
|---|---|
| T-16 | Flujo completo: import sin aceptes → re-matching → aceptar sugerencia → verificar `resource_id` y `total_component_cost` en DB |
| T-17 | Bulk: preview masivo → confirmar → verificar conteos en reporte |
| T-18 | Crear recurso nuevo → aparece en matching de reconciliación |

---

## 14. Riesgos del diseño propuesto

| Riesgo | Mitigación |
|---|---|
| La modificación de `apu_components_all FOR ALL` requiere actualizar el harness RLS | Actualizar harness antes de `db push`; protocolizar como gate de release |
| El trigger de recálculo puede cambiar `total_component_cost` en inserts históricos del seed | Verificar que el seed ya produce los valores correctos; el trigger es `round(qty×(1+waste)×price, 10)` igual que la RPC del importador |
| La opción "usar precio aprobado" cambia el costo del APU desde un precio del Excel que fue validado contra el golden master | Advertencia obligatoria en UI; default = conservar snapshot del Excel |
| La descripción en `notes` puede haberse truncado o modificado | El campo `description` nuevo (Opción B) es la solución canónica; `notes` queda para notas libres |

---

## 15. Advertencias de solapamiento

### 15.1 Con `APU_UI_ADVANCED_EDITING_V1`

La reconciliación es un subconjunto de la edición avanzada de APU. Si se
implementan juntos, la RPC de reconciliación puede ser el núcleo de una
operación más amplia de edición de componentes. Si se implementan por separado,
la RPC de reconciliación debe ser lo suficientemente genérica como para no
entrar en conflicto con la edición futura.

**Recomendación:** implementar `reconcile_apu_component` con una firma acotada
(solo `resource_id` + `unit_price_snapshot`), sin editar `quantity` ni
`waste_pct`. La edición completa es responsabilidad de `APU_UI_ADVANCED_EDITING_V1`.

### 15.2 Con `BOQ_APU_RELINK_WITH_CONFIRMATION`

Ortogonales. La reconciliación opera sobre `apu_components.resource_id`;
el re-linking opera sobre `boq_items.apu_template_id`. No comparten tablas
principales ni lógica de validación.

### 15.3 Con `COST_TYPE_BREAKDOWN_FOUNDATION`

La reconciliación es el requisito funcional previo. Una vez que los componentes
tengan `resource_id`, la FK al `resource_type` permite desgloses confiables.

---

## 16. Orden recomendado de implementación

```
Fase 0 (prerequisito — ya completado):
  ✅ Import APU (54 actividades, 217 componentes en DB)
  ✅ Catálogo base con recursos importados (Decorcerámica, etc.)
  ✅ Price observation review center (aprobación de precios)

Fase 1 — Schema y RPC (agent-db-rls):
  1a. Migración: ADD COLUMN description + updated_at + índice unresolved
  1b. Trigger apu_component_recompute_total
  1c. RPC reconcile_apu_component (individual + bulk)
  1d. Endurecimiento de política UPDATE de apu_components (solo management/internal)
  1e. Actualización del harness RLS (sección nueva [22] o extensión de [21])

Fase 2 — Dominio puro (agent-cost-domain):
  2a. Re-uso de matchMaterialComponent para re-matching en reconciliación
  2b. Server: reconcile-apu-component service (previewReconciliation, confirmReconciliation)
  2c. Tests unitarios T-01 a T-11

Fase 3 — UI (agent-frontend-boq):
  3a. Badge "N sin asociar" en /apu (listado)
  3b. Sección de reconciliación en /apu/[id] (tabla + matching inline + búsqueda)
  3c. Modal de confirmación individual con opciones de precio
  3d. Preview masivo y confirmación bulk
  3e. Tests RLS T-12 a T-15, integración T-16 a T-18

Fase 4 — Release controlado:
  4a. db push --dry-run (gate: N migraciones aditivas esperadas)
  4b. db push --linked
  4c. Smoke: reconciliar 1 componente real desde /apu/[id] con usuario real
  4d. HANDOFF_LOG + DECISIONS + OPEN_QUESTIONS actualizados
```

---

## 17. Deudas registradas al cierre de este borrador

| Deuda | Descripción | Diferido a |
|---|---|---|
| `APU_COMPONENT_AUDIT_LOG` | Tabla de auditoría completa (quién/cuándo/qué cambió) | `BOQ_AUDIT_TRAIL` / `APU_UI_ADVANCED_EDITING_V1` |
| `APU_COMPONENT_DESCRIPTION_BACKFILL` | Backfill del campo `description` desde `notes` para componentes ya importados | Migración de datos (post-release) |
| `APU_COMPONENT_REJECT_STATUS` | Marcar componentes como "deliberadamente sin catálogo" | `APU_UI_ADVANCED_EDITING_V1` |
| `COST_TYPE_BREAKDOWN_FOUNDATION` | Desglose material/MO/equipos en BOQ (habilitado tras reconciliación) | Slice siguiente |
