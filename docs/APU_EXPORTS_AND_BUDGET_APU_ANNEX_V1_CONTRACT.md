# Contrato congelado — APU_EXPORTS_V1 + BUDGET_EXPORT_WITH_APU_ANNEX_V1

> Estado: **CONGELADO v1** · Rama `feature/apu-budget-exports-v1` · Base `origin/main = d3c67bd`.
> Propiedad: agent-orchestrator. Read-only sobre datos; **sin migración**; sin escritura remota.

Este contrato congela el alcance, las reglas y los invariantes de las
exportaciones del presupuesto con anexo de APU vinculados. Complementa (no
reemplaza) `docs/BUDGET_EXPORT_CONTRACT.md` (presupuesto 4E.1), que permanece
intacto (golden master).

---

## 1. Exportaciones disponibles

Desde un presupuesto específico (`/projects/[id]/scopes/[scopeId]/estimates/[estimateId]`),
el usuario puede descargar **seis** documentos:

| # | Documento | Formato | `kind` | Generador |
|---|-----------|---------|--------|-----------|
| 1 | Presupuesto | PDF | `budget` | EXISTENTE (4E.1, intacto) |
| 2 | Presupuesto | Excel | `budget` | EXISTENTE (4E.1, intacto) |
| 3 | APU vinculados | PDF | `apu` | NUEVO |
| 4 | APU vinculados | Excel | `apu` | NUEVO |
| 5 | Paquete completo (presupuesto + anexos APU) | PDF | `package` | NUEVO |
| 6 | Paquete completo (presupuesto + hojas anexas APU) | Excel | `package` | NUEVO |

Los documentos 1 y 2 **no cambian** su salida (regresión golden master).

---

## 2. Presupuesto y versión seleccionados

- El presupuesto se identifica por `estimateId` (+ validación de cadena
  `projectId`/`scopeId`), igual que el export 4E.1.
- **Versión exportada: la versión ACTIVA** del presupuesto (paridad exacta con
  el export de presupuesto existente). Se admite `versionId` explícito como
  parámetro opcional para exportar un snapshot histórico concreto (misma
  semántica que `getEstimateExportPayload(versionId)`), pero la UI V1 exporta la
  versión activa. **No hay ambigüedad**: sin `versionId` ⇒ versión activa.
- `organizationId` y `userId` se derivan SIEMPRE server-side del viewer
  autenticado (`resolveViewer()`); nunca del navegador. RLS es la barrera real:
  cross-org/inexistente ⇒ 404.

---

## 3. APU vinculados (selección)

- Se exportan **únicamente los APU efectivamente vinculados** a los ítems BOQ de
  la versión objetivo, vía `boq_items.apu_template_id`.
- **Nunca** se exporta la biblioteca APU completa.
- **Deduplicación**: un mismo `apu_template_id` referenciado por varios ítems BOQ
  aparece **una sola vez** en el anexo.
- **Orden**: se preserva el orden del BOQ (capítulo `sort_order`, luego ítem
  `sort_order`); el APU toma la posición de su **primera** aparición.
- Cada APU vinculado registra todos los ítems BOQ que lo referencian (lista de
  vínculos), su capítulo y su número de componentes.
- Los ítems BOQ **sin** `apu_template_id` se cuentan como «sin vínculo» (no
  generan ficha APU; se reportan en los conteos/advertencias).

---

## 4. APU archivados (tratamiento)

Regla (mandato): **ocultar APU archivados de los exports por defecto** e impedir
exportarlos, **salvo** que estén históricamente vinculados a una versión ya
emitida.

- Un APU está archivado si `apu_templates.archived_at IS NOT NULL`.
- Familia **emitida** de versión = `issued | approved | archived`.
- Familia **editable** de versión = `draft | review`.
- Si la versión objetivo es **editable** ⇒ los APU archivados vinculados se
  **excluyen** del anexo y se reportan en `archivedExcludedCount` con advertencia.
- Si la versión objetivo es **emitida** ⇒ los APU archivados vinculados **se
  incluyen** (fidelidad del documento histórico ya emitido) y se reportan en
  `archivedIncludedCount` con nota de trazabilidad «APU archivado preservado por
  vínculo histórico».
- En ningún caso se exporta un APU archivado que **no** esté vinculado a la
  versión.

Esto requiere que el read-model exponga `archived_at` por plantilla
(deuda `READ_MODEL_ARCHIVED_AT`). Fix acotado incluido en esta rama (§12).

---

## 5. APU incompletos (tratamiento)

- Un APU es «incompleto» si `unitCostTotal == 0` (Decimal) o si tiene componentes
  sin recurso/precio resuelto (estado de reconciliación no asociado).
- Los incompletos **se incluyen** en el anexo con una **advertencia clara**
  («APU incompleto: costo unitario en cero / componentes sin precio aprobado»).
- **No bloquean** la exportación del paquete completo (sí del presupuesto). El
  presupuesto se exporta siempre; el anexo APU advierte.

---

## 6. Snapshots históricos

- Los valores **presupuestales** (subtotales de ítem/capítulo, totales, AIU,
  resumen financiero) provienen SIEMPRE del **snapshot del BOQ** de la versión
  objetivo (vía `getEstimateExportPayload`). **No se recalculan** contra precios
  nuevos.
- La **ficha del APU** muestra el **cálculo actual del APU** (read-model
  `getApuDetail`, fuente única `modules/apu`), con una **nota de trazabilidad**
  indicando que el valor presupuestado del ítem BOQ usa el snapshot del momento
  del alta y puede diferir del costo actual del APU.
- Nunca se mutan documentos emitidos. Todo el flujo es **read-only**.

---

## 7. Excel — estructura

### B. APU vinculados Excel — `apu_vinculados_<codigo>_<version>.xlsx`
- **Hoja 1 «ÍNDICE APU»**: código APU · descripción · unidad · costo unitario ·
  ítem(s) BOQ relacionado(s) · capítulo · nº componentes · estado · origen.
- **Hojas siguientes**: una por APU (nombre `APU NN` para garantizar nombres de
  hoja ≤ 31 chars, únicos y seguros). Cada hoja incluye: encabezado (código,
  actividad, unidad, costo unitario), materiales, mano de obra, herramienta menor
  (derivada), equipos (si aplica), otros/subcontrato (si aplica), resumen de
  costos por tipo, trazabilidad y BOQ vinculado.

### C. Paquete completo Excel — `paquete_presupuesto_apu_<codigo>_<version>.xlsx`
- Hojas del presupuesto existentes (RESUMEN, PRESUPUESTO, TRAZABILIDAD), seguidas
  de ÍNDICE APU y las hojas por APU. Las cantidades vinculadas quedan **fuera de
  V1** (documentado §11; se evita estructura no garantizada).

### Sanitización Excel (formula injection)
- Toda celda de **texto** cuyo valor empiece por `=`, `+`, `-`, `@`, TAB, CR o LF
  se prefija con un apóstrofo (`'`) para forzar texto literal seguro. Las celdas
  **numéricas/monetarias** se escriben como `number` (no como texto) y no son
  vector de inyección.

---

## 8. PDF — estructura

### B. APU vinculados PDF — `apu_vinculados_<codigo>_<version>.pdf`
- Portada simple: proyecto, presupuesto, versión, fecha, branding ICONIC.
- Índice de APU.
- Ficha por cada APU vinculado: código, actividad, unidad, costo unitario,
  componentes por tipo (material/M.O./equipo/herramienta/otros), rendimiento /
  cantidad, desperdicio, precio snapshot del componente, subtotal por componente,
  herramienta menor derivada, total unitario, vínculo(s) BOQ, trazabilidad.

### C. Paquete completo PDF — `paquete_presupuesto_apu_<codigo>_<version>.pdf`
- Portada + ficha del proyecto + resumen financiero + presupuesto por capítulos
  (reutiliza el layout del PDF de presupuesto) + índice de APU + anexos APU.

### Sanitización PDF
- `@react-pdf/renderer` no interpreta HTML; el texto es contenido literal. Se
  normalizan strings (eliminación de caracteres de control, recorte de longitud
  defensivo) antes de renderizar. Nunca se incrustan secretos, UUID internos,
  filas de origen del Excel ni identidades de sesión.

### Branding
- Reutiliza `branding.ts` / `logo-asset.ts` (paleta ICONIC oficial, sin dorado,
  logos embebidos base64). No se rediseña branding ni se depende de imágenes
  externas.

---

## 9. Nombres de archivo

- `presupuesto_<codigo>_<version>.xlsx|pdf` (alias semántico; el budget export
  existente conserva su nombre `PROYECTO_ALCANCE_PRESUPUESTO_VERSION` por
  regresión — los nombres del mandato aplican a los documentos NUEVOS).
- `apu_vinculados_<codigo>_<version>.xlsx|pdf`
- `paquete_presupuesto_apu_<codigo>_<version>.xlsx|pdf`
- `<codigo>` = `estimate.code` sanitizado; `<version>` = etiqueta `V0N`.
- Sanitización: sólo `[A-Za-z0-9_]`, sin separadores de ruta ni `..`.

---

## 10. Permisos, RLS y seguridad

- `management` / `internal` pueden exportar los seis documentos.
- `site` / `client`: el sistema ya permite lectura/export del presupuesto y del
  detalle APU para cualquier viewer autenticado con acceso RLS; por tanto se
  mantiene el mismo nivel (read-only) **con privacidad backend-first**:
  `getApuDetail` ya **omite** `laborRoleCode`/`laborRoleName` (🔒) para rol
  `client`. No se exponen descuentos internos, precios públicos ni proveedor en
  ningún documento de export.
- `organizationId`/`userId` server-side; ownership de project/scope/version
  verificado; cross-org ⇒ 404 (RLS). Sin `service_role` en cliente.
- Sin HTML arbitrario; texto sanitizado en PDF/Excel; protección formula
  injection (§7).
- GET protegido (patrón existente de `/api/estimates/export`).
- **Sin escritura remota; sin mutación de datos; sin auditoría nueva en V1**
  (no existe patrón de export logs reutilizable; no se introduce).

---

## 11. Límites de tamaño

- Límite por archivo: `EXPORT_MAX_BYTES` = 15 MB (compartido con 4E.1). Excedido
  ⇒ 413.

---

## 12. Deuda READ_MODEL_ARCHIVED_AT (fix acotado en esta rama)

- Causa raíz: el schema Drizzle `apuTemplates` **no mapeaba** las columnas
  `archived_at`, `archived_by`, `archive_reason`, `origin_type`, `created_by`
  (sí existen en la BD desde `20260618090000` + `20260619090000`). Drizzle sólo
  selecciona columnas mapeadas ⇒ el read-model nunca podía exponer `archivedAt`.
- Fix (aditivo, **sin migración**): se sincroniza el mapeo ORM y se popula
  `archivedAt` + `originType` en `listApus` (`ApuSummary`) y `getApuDetail`
  (`ApuDetail`). Habilita la selección de export del §4 y completa la limitación
  registrada en `INTEGRATION_REQUESTS`.

---

## 13. Fuera de alcance (V1)

- Edición avanzada de APU · versionamiento de APU · SMTP / envío por correo ·
  firma digital · exportación masiva multi-proyecto · personalización avanzada de
  plantillas · chat/asistente · cantidades vinculadas en el paquete · paginación
  real de BD · usuarios · auditoría de exports.

---

## 14. Invariantes no negociables

1. Una sola fuente de verdad financiera (snapshots BOQ para presupuesto;
   `modules/apu` para fichas APU). No se duplican fórmulas.
2. Snapshots emitidos inmutables; documentos emitidos preservados.
3. Sólo APU vinculados; jamás la biblioteca completa.
4. Descuentos internos / precios públicos / proveedor nunca en exports.
5. RLS + organizationId server-side; cross-org ⇒ 404.
6. Read-only total: sin INSERT/UPDATE/DELETE; sin db push remoto; sin deploy.
7. Golden master del presupuesto intacto.
