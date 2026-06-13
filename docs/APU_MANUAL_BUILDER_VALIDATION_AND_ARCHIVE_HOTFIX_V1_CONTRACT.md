# APU_MANUAL_BUILDER_VALIDATION_AND_ARCHIVE_HOTFIX_V1 — Contrato Congelado

**Fecha:** 2026-06-13  
**Estado:** CONGELADO  
**Rama:** `fix/apu-manual-builder-validation-archive-v1`  
**Base:** `origin/main = 3018f8b` (APU_MANUAL_BUILDER_V1 released)  
**Producción:** https://construction-ops-psi.vercel.app  

---

## 1. Antecedente

Tras liberar APU_MANUAL_BUILDER_V1, la usuaria creó en producción:

```
Código:   APU-PIS-PRUEBA-01
Actividad: Suministro e instalación de piso porcelanato
```

Resultado guardado con defectos:
- Material ACAB-01 · Placa de panel yeso 1/2" · rendimiento 1,0000 · subtotal $43.900
- Ayudante: rendimiento 0,0000 · subtotal $0
- Oficial: rendimiento 0,0000 · subtotal $0

El builder permitió guardar componentes de mano de obra con valor cero.
Además, no existía acción segura para descartar o corregir un APU manual equivocado.

---

## 2. Brechas identificadas (Fase 0)

| ID | Brecha | Migración | Riesgo | Decisión |
|----|--------|:---------:|--------|----------|
| G1 | Componentes con cantidad/rendimiento = 0 aceptados (validación usa `>= 0` en TS y SQL) | NO | Bajo | SAFE |
| G2 | UI permite submit con filas inválidas (`num('')→0`; `canSubmit` no valida valores) | NO | Muy bajo | SAFE |
| G3 | Sin preview/confirmación explícita bloqueante antes de guardar | NO | Bajo | SAFE/ADITIVO |
| G4 | `apu_templates` sin soporte de archivado (faltan `archived_at`, `archived_by`, `archive_reason`) | **SÍ** | Bajo (aditiva, NULL-default, retrocompatible) | SAFE |
| G5 | Sin acción "Archivar APU" en /apu/[id] ni RPC `archive_apu_template` | **SÍ** (extiende `action_type` CHECK) | Medio | SAFE |
| G6 | Sin "Duplicar para corregir" (`?copyFrom=`) en /apu/new | NO | Bajo | SAFE/ADITIVO |
| G7 | Sin badge "Archivado" / "Incompleto" en /apu y /apu/[id] | Depende G4 | Bajo | SAFE |
| G8 | `add_apu_to_boq` no bloquea APU archivado ni APU incompleto | **SÍ** (depende G4) | Medio | SAFE |
| G9 | Sin banner "APU incompleto" en /apu/[id] para componentes valor cero | NO | Bajo | SAFE |

---

## 3. Alcance congelado

### 3.1 Validación de encabezado (G1-server)
- `code`: string no vacío, máx 50 chars, sin caracteres especiales peligrosos
- `name`: string no vacío, máx 200 chars
- `unit`: string no vacío, pertenece a lista canónica de unidades
- Rechazar en `previewManualApu` y en RPC `create_manual_apu` antes de INSERT

### 3.2 Validación de componentes — cantidad/rendimiento estrictamente > 0 (G1-server)
- Todo componente que se INCLUYE (no esté marcado como vacío/ignorado) debe tener `quantity > 0` (materiales) o `performance_days > 0` con `worker_count > 0` (labor)
- Rechazar `quantity <= 0`, `performance_days <= 0`, `worker_count <= 0`
- Rechazar `NaN` e `Infinity` (ya rechazados, mantener)
- Recalcular siempre server-side; ignorar subtotales enviados por navegador
- Ignorar precios enviados por navegador (ya implementado, mantener)
- Mantener Decimal para todos los cálculos
- Devolver error específico por componente: `{rowIndex, field, code, message}`

### 3.3 Fila vacía no diligenciada (G2-server)
- Si una fila tiene código vacío Y cantidad 0 Y es labor sin texto → puede omitirse silenciosamente (row ignorada)
- Si una fila tiene código o texto pero cantidad 0 → error: se incluyó pero valor cero

### 3.4 Desperdicio válido
- `waste_pct`: rango `[0, 100)`. Rechazar negativo, ≥ 100, NaN, Infinity
- `default_tool_pct`: rango `[0, 100)`. Rechazar negativo, ≥ 100, NaN, Infinity

### 3.5 Materiales desde catálogo
- Precio baseline = última observación aprobada del recurso, re-resuelta EN SQL (ya implementado)
- Ignorar precio enviado por navegador (ya implementado)
- Rechazar `resource_id` que no exista en la org o no tenga precio aprobado (ya implementado)

### 3.6 Mano de obra
- Costo diario integral del dominio canónico (`calculateLaborCost`, ya implementado)
- Rechazar `labor_role_id` que no exista en la org
- Rechazar worker_count ≤ 0
- Rechazar performance_days ≤ 0

### 3.7 Herramienta menor derivada
- Un único registro derivado de `default_tool_pct × Σ total_labor` (ya implementado)
- No crear duplicados (ya implementado)

### 3.8 Preview obligatorio (G3)
- Antes del submit final: UI renderiza preview server-side via `previewManualApu`
- Botón "Crear APU" solo activo cuando el preview no reporta errores
- Advertencia visible: "Revisa que los materiales correspondan a la actividad. El sistema valida consistencia numérica, pero no reemplaza el criterio técnico."
- No crear registro hasta confirmación explícita del preview

### 3.9 Archivo lógico de APU manuales equivocados (G4, G5)

**Schema (migración aditiva):**
```sql
ALTER TABLE apu_templates
  ADD COLUMN archived_at  timestamptz    NULL,
  ADD COLUMN archived_by  uuid           NULL REFERENCES profiles(id),
  ADD COLUMN archive_reason text         NULL;

CREATE INDEX apu_templates_not_archived_idx
  ON apu_templates (organization_id, active)
  WHERE archived_at IS NULL;
```

**RPC `archive_apu_template` (nuevo, SECURITY INVOKER):**
- Parámetros: `p_apu_template_id uuid`, `p_reason text`
- Precondiciones:
  - `origin_type = 'manual'` (solo APU manuales)
  - `archived_at IS NULL` (no ya archivado)
  - Sin `boq_items` vinculados activos o históricos en la org
  - Rol: management/internal (verificación de perfil server-side)
  - `organization_id` derivado server-side del APU (no del cliente)
  - Actor derivado server-side de `auth.uid()`
  - `p_reason` no vacío
- Acción:
  - SET `archived_at = now()`, `archived_by = auth.uid()`, `archive_reason = p_reason`
  - Insertar en `apu_manual_actions` con `action_type = 'archive_apu_template'`
- Restricciones:
  - NUNCA DELETE físico
  - NUNCA modificar `boq_items` existentes
  - APUs importados (`origin_type = 'workbook_import'`): bloqueados (devolver error `apu_not_archivable_type`)
  - Cross-org: bloqueado (org del APU ≠ org del actor → error)
  - Auditoría en `apu_manual_actions`: append-only

**Extensión `action_type` CHECK en `apu_manual_actions`:**
```sql
-- Aditivo: ampliar CHECK existente
ALTER TABLE apu_manual_actions
  DROP CONSTRAINT apu_manual_actions_action_type_check,
  ADD CONSTRAINT apu_manual_actions_action_type_check
    CHECK (action_type IN (
      'create_manual_apu',
      'add_apu_to_boq',
      'archive_apu_template',
      'duplicate_apu_template'
    ));
```

### 3.10 Trazabilidad del archivo
- `apu_manual_actions` registra: `action_type='archive_apu_template'`, `actor_id`, `created_at`, `idempotency_key`
- `archive_reason` obligatorio (p_reason vacío → error)
- `organization_id` siempre server-side
- `actor_id` siempre server-side (`auth.uid()`)

### 3.11 Duplicación para corregir (G6)
- Acción visible en /apu/[id] (solo APU manual, archivado o no)
- Flujo: abrir `/apu/new?copyFrom=<apuTemplateId>`
- Precargar: código editable (sufijo `-COPIA` o contador), nombre, unidad, componentes (sin precios del navegador)
- NO crear registro automáticamente (usuario debe revisar y confirmar)
- Los precios se re-resuelven server-side al guardar (como nuevo APU manual)
- Nunca modificar el APU fuente
- Cross-org bloqueado: si `copyFrom` pertenece a otra org → ignorar silenciosamente o error controlado
- APU archivado: SÍ puede duplicarse
- APU importado: SÍ puede duplicarse con aviso informativo
- Registrar en `apu_manual_actions` con `action_type = 'duplicate_apu_template'` al confirmar

### 3.12 Restricciones si existe vínculo BOQ (G8)
- `add_apu_to_boq` rechaza APU con `archived_at IS NOT NULL` → error `apu_archived`
- `add_apu_to_boq` advierte (no bloquea) APU con `unitCostTotal = 0` → `apu_incomplete` warning (decisión: ADVERTIR no bloquear, para no impedir APUs legítimamente en cero en edge cases)
- `listApusForBoqAdd`: excluir `archived_at IS NOT NULL` por defecto
- Archivar APU con BOQ vinculado: BLOQUEADO → error `apu_has_boq_items`

### 3.13 Compatibilidad retroactiva
- Todas las columnas nuevas son `NULL` con `DEFAULT NULL` → filas existentes no se modifican
- RPC `create_manual_apu`: CREATE OR REPLACE (no rompe callers)
- RPC `add_apu_to_boq`: CREATE OR REPLACE (no rompe callers)
- `boq_items` existentes: NUNCA se tocan (snapshots inmutables)
- APU productivo existente (`APU-PIS-PRUEBA-01`): NO modificado por scripts. La usuaria lo archivará desde la UI.

### 3.14 Permisos
- Crear APU manual: `management | internal` (ya implementado)
- Archivar APU manual: `management | internal` (admin/gerencia)
- Duplicar APU: `management | internal`
- Ver APU archivados: `management | internal`
- Roles `site` y `client`: sin acceso a estas acciones

### 3.15 RLS
- `apu_templates` ya tiene RLS ENABLE + FORCE (verificado)
- `apu_manual_actions` ya tiene RLS ENABLE + FORCE (verificado)
- Migración de archivo: sin cambio de políticas RLS (columnas aditivas dentro de tabla ya protegida)
- `archived_at IS NOT NULL` se respeta como filtro de negocio, no de RLS
- `organization_id` siempre server-side en toda escritura

### 3.16 Idempotencia
- `archive_apu_template`: si ya está archivado → error `apu_already_archived` (no silenciar)
- `create_manual_apu`: ya tiene `idempotency_key` (mantener)
- `add_apu_to_boq`: ya tiene `idempotency_key` (mantener)

### 3.17 Auditoría
- Toda acción de archivo registrada en `apu_manual_actions` (append-only, sin UPDATE/DELETE)
- Actor y org siempre server-side

---

## 4. UX del builder congelada

### /apu/new
- Distinguir claramente: campo "Cantidad" (materiales) vs "Días de trabajo / Trabajadores" (labor)
- Texto de ayuda bajo cada campo numérico: "Debe ser mayor que cero. El subtotal se recalcula en el servidor."
- Mostrar unidad del recurso
- Mostrar precio baseline aprobado (read-only, informativo)
- Mostrar subtotal estimado por componente (float en vivo, no vinculante)
- Mostrar total estimado global (float en vivo, no vinculante)
- **Paso de Preview obligatorio:**
  - Al hacer clic en "Revisar APU": llamada a `previewManualApu` server-side
  - Mostrar resultado con errores por fila (si los hay)
  - Solo habilitar "Confirmar y crear APU" cuando el preview no tiene errores
  - Advertencia fija: "Revisa que los materiales correspondan a la actividad."
- `canSubmit` client-side: bloquear si hay filas con valor ≤ 0 (validación temprana)
- Errores específicos por fila visibles
- Precarga `?copyFrom=`: cargar componentes del APU origen (sin precios)

### /apu/[id]
- Mostrar acción "Archivar APU" cuando: `origin_type = 'manual'` + `archived_at IS NULL` + rol management/internal
- Mostrar acción "Duplicar para corregir" cuando: `origin_type = 'manual'` o con aviso para importados
- Mostrar badge "Archivado" cuando `archived_at IS NOT NULL`
- Mostrar banner "APU incompleto" cuando algún componente tiene `totalComponentCost = 0`:
  "Este APU tiene componentes con valor cero. Revisa sus componentes antes de usarlo en un presupuesto."
  - CTA en el banner: "Duplicar para corregir"
- Bloquear "Agregar al presupuesto" si archivado (botón oculto/deshabilitado con tooltip)

### /apu
- Ocultar APU archivados por defecto
- Filtro "Mostrar archivados" (toggle)
- Badge claro por APU:
  - "Activo" (default, sin badge especial)
  - "Archivado" (badge gris/rojo)
  - "Incompleto" (badge amarillo: `unitCostTotal = 0` o componente en cero)
- Crear APU manual en /apu: CTA ya existe, mantener

---

## 5. Fuera de alcance (registrado para deuda)

| Deuda | Registro |
|-------|---------|
| APU_ADVANCED_EDITOR_V2 | Edición avanzada in-place de componentes existentes |
| APU_VERSIONING_V1 | Versionamiento completo de APU con linaje |
| APU_EXPORTS_V1 | Exportación de ficha técnica APU a PDF/Excel |
| BUDGET_EXPORT_WITH_APU_ANNEX_V1 | Presupuesto + anexo APU en exports |

No se implementa en este hotfix:
- Edición destructiva in-place
- Versionamiento completo de APU
- Exports de APU
- SMTP / usuarios / chat
- Quantities
- AIU

---

## 6. Tests mínimos (43 casos)

### Validación (13)
1. Componente material cantidad > 0 → permitido
2. Componente material cantidad = 0 → rechazado (`apu_component_zero_quantity`)
3. Componente labor performance_days > 0 → permitido
4. Componente labor performance_days = 0 → rechazado
5. Negativo → rechazado
6. NaN → rechazado
7. Infinity → rechazado
8. waste_pct = 100 → rechazado; waste_pct = 99.99 → permitido
9. Subtotal cliente ignorado (recalculado server-side)
10. Precio cliente ignorado
11. Recálculo Decimal correcto (paridad con módulo APU canónico)
12. Herramienta derivada sin duplicado
13. Preview retorna errores por fila con rowIndex

### Archivo (13)
14. Archivar APU manual sin BOQ vinculado → permitido
15. Archivar APU importado → bloqueado (`apu_not_archivable_type`)
16. Archivar APU con BOQ items vinculados → bloqueado (`apu_has_boq_items`)
17. Archivar sin razón → bloqueado
18. `organization_id` siempre server-side (no del cliente)
19. Actor siempre server-side
20. Rol `site`/`client` bloqueado
21. Sin DELETE físico (filas siguen existiendo)
22. Auditoría en `apu_manual_actions` append-only
23. APU archivado: oculto por defecto en listado
24. Filtro archivados muestra APU archivados
25. `add_apu_to_boq` bloquea APU archivado (`apu_archived`)
26. APU ya archivado → `archive_apu_template` retorna `apu_already_archived`

### Duplicación (7)
27. `?copyFrom` precarga encabezado y componentes
28. No crea registro automáticamente (solo carga el form)
29. Origen no se modifica tras duplicar
30. Cross-org bloqueado (copyFrom de otra org → ignorado/error)
31. Código del duplicado editable (no heredado automáticamente con conflicto)
32. Recálculo al guardar (precios re-resueltos, no copiados del origen)
33. APU archivado puede duplicarse

### Regresión (10)
34. Manual builder intacto (flujo happy path completo)
35. `add_apu_to_boq` intacto (APU activo y completo)
36. Import APU (`import_apu_batch`) intacto
37. Reconciliación intacta (`reconcile_apu_component`)
38. Quantities intacto (`import_quantity_takeoff_batch`)
39. Catálogo intacto (recursos, proveedores, precios)
40. Price monitor intacto (`/api/cron/price-monitor`)
41. Golden master financiero intacto ($372.247.170)
42. `gm:import` intacto
43. Smoke intacto (rutas HTTP 200/307/401)

---

## 7. Migración (nueva, aditiva)

**Número:** `20260619090000_apu_archive_support.sql`

**Contenido conceptual:**
```sql
-- Columnas de archivo en apu_templates
ALTER TABLE apu_templates
  ADD COLUMN archived_at    timestamptz NULL DEFAULT NULL,
  ADD COLUMN archived_by    uuid        NULL DEFAULT NULL
    REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN archive_reason text        NULL DEFAULT NULL;

-- Índice parcial para consultas de activos
CREATE INDEX apu_templates_not_archived_idx
  ON apu_templates (organization_id, active)
  WHERE archived_at IS NULL;

-- Ampliar CHECK de action_type en apu_manual_actions
ALTER TABLE apu_manual_actions
  DROP CONSTRAINT apu_manual_actions_action_type_check,
  ADD CONSTRAINT apu_manual_actions_action_type_check
    CHECK (action_type IN (
      'create_manual_apu',
      'add_apu_to_boq',
      'archive_apu_template',
      'duplicate_apu_template'
    ));

-- RPC archive_apu_template (SECURITY INVOKER, STABLE ROLES)
-- RPC create_manual_apu (CREATE OR REPLACE — endurece validación > 0)
-- RPC add_apu_to_boq (CREATE OR REPLACE — bloquea archivados)
```

**DOWN:** DROP columnas (safe si no se han archivado registros) + restaurar CHECK original + DROP RPC.

**FORCE count:** 36 → 37 (1 migración nueva).

---

## 8. Restricciones absolutas de esta oleada

- Sin DELETE físico de APU ni componentes
- Sin modificar `boq_items` existentes (snapshots inmutables)
- Sin merge a main
- Sin deploy remoto
- Sin db push remoto
- Sin escrituras remotas
- Sin importar datos dummy remotos
- Sin borrar APU productivo de prueba (usuaria lo archivará desde UI)
- Sin implementar exports, SMTP, usuarios, chat, quantities ampliadas
- Sin ampliar alcance más allá de las 9 brechas documentadas

---

## 9. Propiedad por agente

| Agente | Responsabilidad |
|--------|----------------|
| `agent-db-rls` | Migración `20260619090000`, RPCs `archive_apu_template` + endurecer `create_manual_apu`/`add_apu_to_boq`, RLS runtime sección [24] ampliar |
| `agent-cost-domain` | Endurecer dominio `previewManualApu` + `createManualApu` server-side (validación > 0 por componente, errores por fila) |
| `agent-frontend-boq` | UI validación filas, paso preview/confirm, badges, banner incompleto, acción archivar, acción duplicar, `?copyFrom` en /apu/new, filtro archivados en /apu |
| `agent-qa` | Ampliar `builder.test.ts` (13 tests adicionales), tests archivo (13), tests duplicación (7), tests regresión (10) |
| `agent-orchestrator` | Coordinación, contrato, docs maestros, integración final, validación suite |
