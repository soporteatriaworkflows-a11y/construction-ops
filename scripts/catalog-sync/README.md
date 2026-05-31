# scripts/catalog-sync — Sincronización de catálogo de proveedores

> **Nota de privacidad**: este directorio contiene SOLO archivos sanitizados
> (ejemplos de formato). NO incluir archivos CSV/Excel con datos reales ni precios
> de contratos vigentes. Los archivos reales pertenecen a `private/` (ignorado por Git).

## Uso

### 1. Preview de importación CSV

Genera un preview sin persistir datos:

```bash
corepack pnpm tsx scripts/catalog-sync/preview-import.ts \
  --file private/catalogo-homecenter-2026-05.csv \
  --provider homecenter
```

### 2. Convertir Excel a CSV (requiere xlsx devDep)

```bash
corepack pnpm tsx scripts/catalog-sync/convert-excel.ts \
  --input private/catalogo-homecenter.xlsx \
  --output private/catalogo-homecenter.csv \
  --sheet "Precios"
```

### 3. Formato esperado del CSV

Ver `sample-catalog.csv` para el formato esperado.

**Columnas obligatorias:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `nombre` | string | Nombre o descripción del producto |
| `precio` | número positivo | Precio público observado (COP) |
| `moneda` | string | ISO-4217 (p. ej. `COP`) |

**Columnas opcionales:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `sku` | string | SKU del proveedor (🔒 interno) |
| `url` | string | URL del producto (🔒 interno) |
| `unidad` | string | Unidad de medida (p. ej. `und`, `m2`, `kg`) |
| `fecha` | ISO 8601 | Fecha de observación del precio |
| `referencia_fuente` | string | Referencia interna de origen (🔒) |

### 4. Reglas de privacidad

- Los campos `sku`, `url`, `referencia_fuente` son **internos (🔒)**.
- NUNCA exponer estos campos a roles cliente.
- El CSV real debe estar en `private/` (ignorado por Git).
- NO incluir nombres de clientes, NIT, contraseñas ni credenciales.

### 5. Flujo de importación (aprobación humana)

```
CSV/Excel fuente (private/)
  ↓
parseCatalog()         — validación de columnas, parseo de filas
  ↓
mapToSupplierProducts() — matching por descripción, candidatos + score
  ↓
buildPreview()         — resumen para revisión humana
  ↓
[REVISIÓN HUMANA]      — aprobación/rechazo por ítem
  ↓
toPriceObservations()  — solo ítems aprobados → RecordObservationInput[]
  ↓
PricingApprovalPort    — persistencia vía puerto de pricing (append-only)
  ↓
approveObservation()   — aprobación trazable (aprobador + timestamp)
```

### 6. Integración futura n8n

El diseño del adaptador es compatible con automatización supervisada via n8n:

```
Trigger (cron diario / webhook manual)
  ↓
n8n: descargar CSV de fuente oficial (Homecenter Empresas)
  ↓
n8n: llamar endpoint interno /api/catalog-sync/preview
  ↓
n8n: notificar al equipo de compras (Slack/email)
  ↓
[APROBACIÓN HUMANA en la plataforma]
  ↓
n8n: confirmar importación vía /api/catalog-sync/confirm
  ↓
PricingApprovalPort.recordObservation + approveObservation
```

**Puntos de extensión ya diseñados:**
- `SupplierAdapter` es sustituible (API oficial, feed XML/JSON, cotización empresarial).
- `buildPreview` = punto de integración para webhook de revisión.
- `toPriceObservations` = input listo para el puerto de aprobación.
- Idempotencia garantizada (no duplicados en re-ejecuciones).
- Rate limiting: configurable en el adaptador (no hardcodeado).

### 7. Alertas de variación fuerte

Al registrar una observación, comparar con la última aprobada:
- Si la variación supera el umbral configurado → alertar (no bloquear).
- Ver `apps/web/modules/pricing/approval-flow.ts` (`assessVariation`).
