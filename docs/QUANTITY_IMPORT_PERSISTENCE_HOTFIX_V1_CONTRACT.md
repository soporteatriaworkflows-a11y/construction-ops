# QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1 — Contrato

**Versión:** 1.0  
**Fecha:** 2026-06-14  
**Branch:** `fix/quantity-import-persistence-v1`  
**Base:** `origin/main = 06bfb10`  
**Propietario:** agent-orchestrator  

---

## A. Problema reportado

En producción autenticada, la usuaria importó una hoja de cantidades desde
`/quantities → Importar memorias`. La interfaz mostró éxito pero no quedó
ningún registro visible en `/quantities`.

---

## B. Causa raíz

Dos causas independientes que se combinan:

### B.1 — Visibilidad: familias de tablas distintas

| Tabla | Quién escribe | Quién lee |
|---|---|---|
| `quantity_groups` / `quantity_lines` | (legacy) | `rm.listQuantities` → `/quantities` |
| `quantity_takeoff_groups` / `quantity_takeoff_lines` | `import_quantity_takeoff_batch` RPC | **nadie en la UI** |
| `quantity_workspace_groups` / `quantity_workspace_lines` | workspace actions | `rm.listWorkspaceGroups` → `/quantities/workspace` |

`/quantities` llama `rm.listQuantities(viewer, scopeId)` que lee
`quantity_groups` filtrados por `project_scope_id`. Los grupos importados
viven en `quantity_takeoff_groups` (sin `project_scope_id`; solo
`organization_id` + opcional `estimate_version_id`). El read-model nunca
los lee → pantalla vacía aunque la RPC haya creado los registros.

### B.2 — Cache: falta `revalidatePath` en `confirmQuantityImportAction`

El Server Action no llama `revalidatePath('/quantities')` después de un
import exitoso. Next.js 16 cachea la página → aunque se corrigiera B.1,
la pantalla seguiría mostrando el estado anterior de la caché.

---

## C. Flujo esperado tras el hotfix

```
Usuario en /quantities/import
  → sube workbook + analiza (preview)
  → confirma importación
    ↓
confirmQuantityImport (server)
  → RPC import_quantity_takeoff_batch (supabase RLS-bound)
    → inserta quantity_import_batches  (inmutable)
    → inserta quantity_takeoff_groups  (inmutable)
    → inserta quantity_takeoff_lines   (inmutable)
  → devuelve QuantityImportResult
    { duplicate, batchId, groupsCreated, linesCreated, linkedBoqItems, ... }
  → si groupsCreated + linesCreated = 0 Y no duplicate → error explícito
  → revalidatePath('/quantities')
  → revalidatePath('/quantities/import')
  ↓
Wizard paso 3 (éxito):
  → muestra conteos reales (grupos, líneas, vinculados)
  → botón "Ver memorias importadas" → /quantities (sección de takeoff)
  ↓
/quantities muestra TRES secciones:
  1. Memorias importadas (quantity_takeoff_groups por org — nueva lectura)
  2. Cantidades del workspace (quantity_workspace_groups — ya existente)
  3. Cantidades heredadas (quantity_groups — ya existente)
  (si una sección está vacía, se omite o muestra empty-state acotado)
```

---

## D. Persistencia

| Invariante | Regla |
|---|---|
| `quantity_takeoff_groups` son inmutables | No hay UPDATE/DELETE (RLS) |
| `quantity_import_batches` son inmutables | Digest UNIQUE por org |
| `boq_items` no se modifica | El vínculo vive en `quantity_takeoff_groups.boq_item_id` |
| `quantity_groups` legacy no se toca | No hay cambio en esa familia |

---

## E. Visibilidad requerida

1. `/quantities` muestra grupos importados de `quantity_takeoff_groups`
   filtrados por `organization_id` (RLS).
2. Muestra al menos: descripción, unidad, total calculado, líneas,
   fecha de importación, archivo fuente.
3. Si no hay grupos importados: no mostrar la sección (u omitirla
   con texto "Sin memorias importadas").
4. Después de import exitoso: `revalidatePath('/quantities')` →
   la página muestra los nuevos grupos inmediatamente.

---

## F. Conteos y mensajes de resultado

Después de una importación exitosa el wizard debe mostrar:
- `groupsCreated` — grupos creados
- `linesCreated` — líneas creadas
- `linkedBoqItems` — ítems BOQ vinculados
- `unresolvedGroups` — grupos sin vínculo exacto

Si `groupsCreated + linesCreated = 0` (y `!duplicate`):
- **NO** mostrar éxito.
- mostrar error: "No se importaron líneas. Revisa hoja, rango o formato."
- (Nota: la RPC ya lanza `no_groups` en ese caso; el servicio lo propaga.)

---

## G. Manejo de errores

| Escenario | Comportamiento |
|---|---|
| RLS/auth bloquea la RPC | `confirmQuantityImportAction` devuelve `{ ok: false, error }` visible en UI |
| RPC lanza `no_session` / `no_membership` | Error mostrado al usuario (vía sanitizeError genérico) |
| Digest mismatch | `QuantityImportDigestMismatchError` — mensaje específico |
| No importable (0 grupos) | `QuantityImportNotImportableError` — mensaje específico |
| Modo demo (fixture) | `QuantityImportNotSupportedError` — mensaje específico |
| Error genérico de DB | Mensaje sanitizado genérico (nunca stacktrace) |

**Invariante: NUNCA mostrar éxito si `ok: false` o si `groupsCreated = 0 AND !duplicate`.**

---

## H. Link "Ver memorias importadas"

El paso 3 (éxito) del wizard debe incluir:
- Botón principal: "Ver memorias importadas" → `/quantities` (con anchor `#imported-batches` si aplica).
- El texto debe ser "Ver memorias importadas" (no el genérico "Ver cantidades").

---

## I. Fuera de alcance

- Cronograma.
- OCR / planos.
- Edición avanzada de cantidades importadas (cantidad_takeoff_groups son inmutables).
- Sync automático de totales al BOQ sin preview.
- Usuarios / SMTP.
- Exports nuevos.
- APU (sin cambios).
- Workspace (sin cambios funcionales).
- Migración remota (no se requiere; tablas ya existen en producción).

---

## J. No duplicación / no mutación BOQ

- Los grupos de takeoff son INMUTABLES una vez creados.
- El mismo workbook (mismo digest) no genera un segundo batch.
- `boq_items` no recibe ningún UPDATE.
- APU, AIU, precios y exportaciones no se tocan.

---

## K. Migración

**No se requiere migración.** Las tablas `quantity_import_batches`,
`quantity_takeoff_groups` y `quantity_takeoff_lines` ya existen en
producción (migraciones `20260616090000` y `20260616090100` aplicadas
en el release `quantity-takeoff-import-release-v1`).

---

## L. Tests requeridos (mínimo)

1. import válido persiste grupo/lote (`groupsCreated > 0`).
2. import válido persiste líneas (`linesCreated > 0`).
3. resultado devuelve conteos reales.
4. import con 0 filas válidas arroja `QuantityImportNotImportableError` (no éxito).
5. error RLS/auth no se traga (devuelve `{ ok: false, error }`).
6. grupos importados visibles en la nueva función de listado.
7. `revalidatePath` se llama tras import exitoso (o equivalente comprobable).
8. no sync automático a BOQ.
9. no modifica APU.
10. no modifica catálogo.
11. gm:import total intacto.
12. build limpio.
