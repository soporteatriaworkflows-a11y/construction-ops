# EXPORT_PROFILES_CONTRACT — Perfiles y exportaciones (Oleada 3C)

> **Contrato congelado v1 para Oleada 3C — cambios únicamente mediante
> `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad de evolución: `agent-orchestrator`. Implementación: `agent-exports`.
> Fecha de congelación: 2026-06-01.

Este contrato define los **perfiles de exportación**, la **whitelist de datos
por perfil**, las **exportaciones del MVP** y los **contratos de código** del
módulo de exportaciones de Construction Ops.

---

## 0. Principios no negociables

1. **Proyección server-side antes de generar el archivo.** El módulo de
   exportación consume **DTOs ya proyectados por rol** del read-model canónico
   (`apps/web/server/read-model/` → `apps/web/lib/contracts/read-model.ts`).
   **Nunca** se ocultan campos sensibles después de generar el archivo, ni en
   frontend.
2. **No recalcular finanzas.** Los totales, AIU, IVA, ahorros y márgenes vienen
   ya calculados en los DTOs del read-model. El módulo de exportación **no**
   recalcula ni reordena cálculos financieros.
3. **No leer tablas crudas.** Prohibido el acceso directo a la DB / Drizzle /
   `postgres` desde `modules/exports` o `server/exports`. La única fuente es el
   `ReadModelPort`.
4. **Sin float para dinero.** Se usa `DecimalString` (string decimal) y la
   política Q9 (`ROUND_HALF_UP` solo en presentación). Snapshots intactos.
5. **Privacidad por perfil = whitelist, no blacklist.** Cada perfil declara la
   lista explícita de campos permitidos. Lo no listado, se omite.
6. **Sin secretos, credenciales, tokens, `.env` ni datos fuera de la
   organización** en ninguna exportación, ningún perfil.
7. **Sin `.mpp` ni XML de MS Project** en esta oleada. El CSV de cronograma se
   prepara como base futura, sin implementar el formato MS Project.

---

## 1. Perfiles (`ExportProfile`)

`ExportProfile` se mapea 1:1 con `ViewerRole` del read-model canónico
(`apps/web/lib/contracts/read-model.ts`):

| `ExportProfile` | `ViewerRole` | Audiencia | Ve internos 🔒 |
|---|---|---|---|
| `client` | `client` | Cliente final / propietario | **No** |
| `site` | `site` | Residente / obra / interventoría interna | Parcial (ejecución) |
| `management` | `management` | Gerencia / dirección | Sí (financiero) |
| `internal` | `internal` | Técnico interno / auditoría | Sí (superset) |

**Regla**: cada exportación recibe el `ViewerContext` correspondiente al perfil
y consume el read-model proyectado por ese rol. La generación del archivo opera
exclusivamente sobre datos ya filtrados.

---

## 2. Matriz whitelist por perfil

Notación: ✅ permitido · ❌ omitido (no debe aparecer en el archivo).

### 2.1 Datos de presupuesto / BOQ / APU

| Campo | client | site | management | internal |
|---|:---:|:---:|:---:|:---:|
| Proyecto autorizado (nombre, ubicación pública) | ✅ | ✅ | ✅ | ✅ |
| Capítulos (código, nombre) | ✅ | ✅ | ✅ | ✅ |
| Ítem: código, actividad, descripción autorizada | ✅ | ✅ | ✅ | ✅ |
| Unidad | ✅ | ✅ | ✅ | ✅ |
| Cantidad | ✅ | ✅ | ✅ | ✅ |
| Precio unitario de **venta** | ✅ | ✅ | ✅ | ✅ |
| Subtotal / total de venta | ✅ | ✅ | ✅ | ✅ |
| AIU agregado | ✅ | ✅ | ✅ | ✅ |
| IVA autorizado | ✅ | ✅ | ✅ | ✅ |
| Total con IVA | ✅ | ✅ | ✅ | ✅ |
| APU de **ejecución** (rendimientos, cuadrillas) | ❌ | ✅ | ✅ | ✅ |
| Costo directo interno desglosado | ❌ | ❌ | ✅ | ✅ |
| AIU desglosado (A/I/U) | ❌ | ❌ | ✅ | ✅ |
| **Precio de compra** | ❌ | ❌ | ✅ | ✅ |
| **Descuento negociado** | ❌ | ❌ | ✅ | ✅ |
| **Ahorro** (proyectado/realizado) | ❌ | ❌ | ✅ | ✅ |
| **Margen** | ❌ | ❌ | ✅ | ✅ |
| Comparativo presupuestado vs esperado vs real | ❌ | ❌ | ✅ | ✅ |
| Cobertura de pricing | ❌ | ❌ | ✅ | ✅ |
| Proveedor | ❌ | ❌ | ❌¹ | ✅ |
| SKU | ❌ | ❌ | ❌¹ | ✅ |
| URL del producto | ❌ | ❌ | ❌¹ | ✅ |
| `sourceReference` | ❌ | ❌ | ❌¹ | ✅ |
| Overrides / aprobadores | ❌ | ❌ | ❌¹ | ✅ |
| Trazabilidad / snapshots autorizados | ❌ | ❌ | ❌¹ | ✅ |
| Notas privadas gerenciales | ❌ | ❌ | ✅ | ✅ |

¹ Gerencia ve agregados financieros (ahorro/margen) pero **no** el detalle de
auditoría técnica profunda (proveedor/SKU/URL/sourceReference). Ese detalle es
exclusivo del perfil `internal`.

### 2.2 Datos de cronograma / avance (planning)

| Campo | client | site | management | internal |
|---|:---:|:---:|:---:|:---:|
| Tareas autorizadas (wbs, nombre, fechas) | ✅ | ✅ | ✅ | ✅ |
| Hitos | ✅ | ✅ | ✅ | ✅ |
| Duración planificada | ✅ | ✅ | ✅ | ✅ |
| Avance físico autorizado (`progressPct`) | ✅ | ✅ | ✅ | ✅ |
| Dependencias (`dependencyType`, `lagDays`) | ❌ | ✅ | ✅ | ✅ |
| **Holguras** (total/libre) | ❌ | ✅ | ✅ | ✅ |
| **Ruta crítica** (`isCritical`, `CriticalPathSummary`) | ❌ | ✅ | ✅ | ✅ |
| Recursos asignados autorizados | ❌ | ✅ | ✅ | ✅ |
| **Avance financiero interno** (`financialProgressPct`) | ❌ | ❌ | ✅ | ✅ |
| `external_reference` (MS Project) | ❌ | ❌ | ❌ | ✅ |
| Responsables internos (`createdBy`) | ❌ | ❌ | ❌ | ✅ |
| Notas privadas de avance | ❌ | ❌ | ❌ | ✅ |

### 2.3 Prohibido en TODO perfil (incluido `internal`)

Secretos · credenciales · tokens · contenido de `.env` · datos de otra
organización (multitenant) · rutas de archivos internas del servidor · stack
traces / detalles técnicos de error.

---

## 3. Exportaciones del MVP

| `ExportFormat` | Perfil(es) | `contentType` |
|---|---|---|
| `xlsx-client` | `client` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `xlsx-internal` | `internal` | idem xlsx |
| `pdf-client` | `client` | `application/pdf` |
| `pdf-management` | `management` | `application/pdf` |
| `csv-schedule` | según perfil (proyección por rol) | `text/csv; charset=utf-8` |

### A. `xlsx-client` — Excel presupuesto cliente
Capítulos · ítems · cantidades · precio venta · subtotales · AIU agregado ·
IVA · total · encabezado/portada básica. **Sin** campos internos (§2).

### B. `xlsx-internal` — Excel técnico interno
Presupuesto · capítulos · BOQ · APU · catálogo · pricing autorizado ·
trazabilidad · cronograma · avance. Superset técnico del perfil `internal`.

### C. `pdf-client` — PDF presupuesto cliente
Encabezado · proyecto · resumen · capítulos · total · términos básicos.
**Sin** campos internos.

### D. `pdf-management` — PDF gerencial
Resumen financiero · directos · indirectos · AIU desglosado · IVA · ahorros ·
margen · capítulos · cronograma · alertas autorizadas.

### E. `csv-schedule` — CSV cronograma base
Columnas:
`wbs_code`, `name`, `planned_start`, `planned_end`, `planned_duration_days`,
`progress_pct`, `predecessor_wbs`, `dependency_type`, `lag_days`,
`is_milestone`, y `external_reference` **únicamente en perfil `internal`**.

> Preparado como base futura para MS Project. **No** implementar `.mpp` ni XML
> todavía.

---

## 4. Contratos de código

Ubicación canónica de tipos: `apps/web/modules/exports/` (dominio de exportación,
puro y testeable) + `apps/web/server/exports/` (orquestación server-side que
consume el `ReadModelPort`).

```ts
/** Perfil de exportación (1:1 con ViewerRole). */
export type ExportProfile = 'client' | 'site' | 'management' | 'internal';

/** Formato/variante de exportación. */
export type ExportFormat =
  | 'xlsx-client'
  | 'xlsx-internal'
  | 'pdf-client'
  | 'pdf-management'
  | 'csv-schedule';

/** Petición de exportación. */
export interface ExportRequest {
  profile: ExportProfile;
  projectId: Uuid;
  estimateVersionId?: Uuid;
  format: ExportFormat;
  includeSchedule?: boolean;
  includeProgress?: boolean;
  requestedBy: Uuid;
  requestedAt: IsoDateTime;
}

/** Resultado de exportación (archivo en memoria). */
export interface ExportResult {
  fileName: string;       // sanitizado, sin datos sensibles ni rutas internas
  contentType: string;    // ver §3
  buffer: Uint8Array;     // o Buffer; generado en memoria
  sizeBytes: number;
  generatedAt: IsoDateTime;
  profile: ExportProfile;
}

/** Servicio de exportación (única entrada pública). */
export interface ExportService {
  generate(request: ExportRequest): Promise<ExportResult>;
}
```

### Reglas de `ExportService.generate`
- Consume **read-model proyectado** por `profile` (vía `ReadModelPort` con el
  `ViewerContext` del perfil). No accede a tablas crudas.
- No recalcula finanzas. No usa float para dinero. Aplica política Q9.
- Genera el archivo **en memoria**; no escribe temporales sensibles en disco.
- Nombres de archivo **sanitizados** (sin PII, sin rutas, sin caracteres
  peligrosos). Patrón sugerido:
  `<tipo>_<proyecto-slug>_<YYYYMMDD>.<ext>`.
- Errores **explícitos** y tipados; **no** se expone stack técnico al consumidor.
- Trazabilidad: registrar `requestedBy`/`requestedAt`/`profile`/`format`
  (sin volcar datos sensibles en logs).
- **Límites razonables de tamaño** (rechazar peticiones desproporcionadas).
- Combinación `profile` × `format` validada: p. ej. `pdf-client` solo con
  perfil `client`; `xlsx-internal` solo con `internal`; `pdf-management` solo con
  `management`. `csv-schedule` admite cualquier perfil (proyectado por rol).

---

## 5. Formato

### COP (dinero)
- Política Q9: `ROUND_HALF_UP` solo en **presentación**.
- UI / **PDF cliente**: COP **sin decimales**.
- **Excel técnico interno**: hasta **2 decimales**.
- **No** modificar snapshots raw. **No** recalcular totales.

### PDF
- Diseño sobrio y legible. Sin depender de fuentes privadas ni fuentes
  embebidas externas no autorizadas. Sin exponer internals al cliente.

### Excel
- Hojas con **nombres estables**. Filtros (autoFilter) en tablas. Encabezados
  claros. Ancho de columnas razonable. **Freeze panes** en encabezado. Formato
  monetario COP. Totales. **Validación mediante reapertura programática** en
  tests (parsear el `.xlsx` generado y verificar hojas/celdas).

---

## 6. Pruebas exigidas (resumen; detalle en AGENT_REGISTRY / tarea del agente)

Privacidad por perfil (client/site/management/internal) · totales financieros
(cuadre con golden master) · formato COP · Excel válido reabierto
programáticamente · hojas correctas · PDF válido · PDF cliente sin internals ·
PDF gerencial con campos autorizados · CSV cronograma (hitos, dependencias,
`external_reference` solo `internal`) · filenames sanitizados · content-types ·
errores sin stack · límites de tamaño · route handlers de descarga · ausencia
de recálculo financiero · ausencia de acceso a tablas crudas · ausencia de
datos privados.

---

## 7. Fuera de alcance (Oleada 3C)

- Formato `.mpp` de MS Project.
- XML de MS Project (MSPDI).
- Programación/scheduling de exportaciones (cron, colas).
- Almacenamiento persistente de archivos generados.
- Envío por correo / integración con terceros.

Estos quedan **reservados** para oleadas futuras; el CSV de cronograma deja la
base de columnas para una futura conversión MS Project.
