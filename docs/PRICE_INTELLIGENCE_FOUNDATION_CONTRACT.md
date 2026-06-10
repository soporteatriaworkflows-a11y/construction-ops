# Price Intelligence Foundation — Contrato Congelado v1

**Fase**: 3A — Price Intelligence Foundation  
**Estado**: CONGELADO  
**Fecha**: 2026-06-10  
**Propietario**: agent-orchestrator  
**Agentes involucrados**: agent-db-rls, agent-pricing, agent-frontend-boq

---

## 1. Objetivo

Proveer una capa de inteligencia de precios que permita:
- Registrar observaciones históricas de precios por recurso (append-only).
- Gestionar proveedores con descuento negociado.
- Calcular precio neto sugerido con invariante en DB.
- Flujo de aprobación humana simple (pending → approved | rejected | expired).
- Detectar vigencia vencida (stale) en tiempo de ejecución.
- Aislar datos por organización mediante RLS.
- Mantener privacidad backend-first: campos sensibles nunca serializados a rol `cliente`.

---

## 2. Extensión de `suppliers`

Columnas nuevas (additive, non-breaking):

| Columna | Tipo | Restricción | Descripción |
|---|---|---|---|
| `website_url` | `text` | nullable | URL del sitio del proveedor |
| `default_discount_percent` | `NUMERIC(6,4)` | NOT NULL DEFAULT 0, CHECK 0..100 | Descuento por defecto (%) para observaciones |
| `notes` | `text` | nullable | Notas internas 🔒 |
| `created_by` | `uuid` | FK profiles ON DELETE SET NULL | Perfil creador (server-side) |

---

## 3. Tabla `resource_price_observations`

### Campos

| Columna | Tipo | Restricción | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | |
| `organization_id` | `uuid` | NOT NULL FK organizations CASCADE | Org del recurso y del observador |
| `resource_id` | `uuid` | NOT NULL FK resources RESTRICT | Recurso observado |
| `supplier_id` | `uuid` | FK suppliers SET NULL, nullable | Proveedor (opcional) |
| `observed_price` | `NUMERIC(20,10)` | NOT NULL, >= 0 | Precio público observado (Q8: base del cálculo) |
| `discount_percent` | `NUMERIC(6,4)` | NOT NULL DEFAULT 0, CHECK 0..100 | Descuento % (0–100) 🔒 |
| `suggested_net_price` | `NUMERIC(20,10)` | NOT NULL, DB-computed | = `round(observed_price × (1 − discount_percent/100), 10)` 🔒 |
| `unit` | `text` | NOT NULL | Unidad de la observación |
| `currency` | `text` | NOT NULL DEFAULT 'COP', CHECK ISO-4217 | Moneda ISO-4217 |
| `source_type` | `text` | NOT NULL, CHECK enum | Tipo de fuente de precio |
| `source_reference` | `text` | nullable | URL, SKU, número de cotización, etc. |
| `observed_at` | `timestamptz` | NOT NULL | Fecha/hora de la observación |
| `valid_until` | `timestamptz` | nullable | Fecha de expiración explícita (opcional) |
| `status` | `text` | NOT NULL DEFAULT 'pending', CHECK enum | Estado del workflow |
| `notes` | `text` | nullable | Notas del observador |
| `created_by` | `uuid` | NOT NULL FK profiles RESTRICT | Perfil creador — server-side SIEMPRE |
| `approved_by` | `uuid` | FK profiles SET NULL, nullable | Perfil aprobador/rechazador — server-side 🔒 |
| `approved_at` | `timestamptz` | nullable | Timestamp de revisión 🔒 |
| `rejection_reason` | `text` | nullable | Razón de rechazo |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |

### Enumeraciones

**`source_type`**: `official_api` | `official_feed` | `supplier_csv` | `manual` | `public_web` | `invoice` | `quotation`

**`status`**: `pending` | `approved` | `rejected` | `expired`

### Invariante DB

```sql
-- BEFORE INSERT OR UPDATE trigger en resource_price_observations
suggested_net_price = round(observed_price * (1 - discount_percent / 100.0), 10)
```

El campo `suggested_net_price` es DB-computed. Nunca se envía desde el cliente.

### Append-only

- No se permiten UPDATE de campos de observación (`observed_price`, `discount_percent`, `unit`, `source_type`, etc.).
- Solo se pueden actualizar: `status`, `approved_by`, `approved_at`, `rejection_reason`.
- No se permite DELETE (solo RLS + restricción de UPDATE).

### Stale State (runtime, no persistido)

```
isStale = status === 'approved' && (
  (valid_until != null && now > valid_until) ||
  (valid_until == null && now - approved_at > 30 days)
)
```

`staleAfterDays = 30` es una constante de runtime, no un campo DB.

---

## 4. Contrato TypeScript (servidor)

### Tipos nuevos en `apps/web/server/pricing/types.ts`

```typescript
export type ObservationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ProviderView {
  id: Uuid;
  name: string;
  supplierType: SupplierType;
  websiteUrl: string | null;
  defaultDiscountPercent: DecimalString;  // 🔒
  notes: string | null;                   // 🔒
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ProviderCreateInput {
  name: string;
  supplierType?: SupplierType;
  websiteUrl?: string | null;
  defaultDiscountPercent?: DecimalString;
  notes?: string | null;
}

export interface ProviderUpdateInput {
  name?: string;
  websiteUrl?: string | null;
  defaultDiscountPercent?: DecimalString;
  notes?: string | null;
  active?: boolean;
}

export interface ResourcePriceObservationView {
  id: Uuid;
  resourceId: Uuid;
  supplierId: Uuid | null;
  supplierName: string | null;
  observedPrice: DecimalString;       // 🔒
  discountPercent: DecimalString;     // 🔒
  suggestedNetPrice: DecimalString;   // 🔒
  unit: string;
  currency: string;
  sourceType: PriceSourceType;
  sourceReference: string | null;
  observedAt: IsoDateTime;
  validUntil: IsoDateTime | null;
  status: ObservationStatus;
  isStale: boolean;                   // runtime
  notes: string | null;
  createdAt: IsoDateTime;
  approvedAt: IsoDateTime | null;     // 🔒
  rejectionReason: string | null;
}

export interface CreateObservationInput {
  resourceId: Uuid;
  supplierId?: Uuid | null;
  observedPrice: DecimalString;
  discountPercent?: DecimalString;
  unit: string;
  currency?: string;
  sourceType: PriceSourceType;
  sourceReference?: string | null;
  observedAt: IsoDateTime;
  validUntil?: IsoDateTime | null;
  notes?: string | null;
}

export interface ApproveObservationInput {
  observationId: Uuid;
}

export interface RejectObservationInput {
  observationId: Uuid;
  rejectionReason: string;
}

export interface ResourcePriceIntelligenceSummary {
  resourceId: Uuid;
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  approvedCount: number;
  pendingCount: number;
  latestApprovedPrice: DecimalString | null;       // 🔒
  latestApprovedAt: IsoDateTime | null;
  latestApprovedIsStale: boolean;
}
```

---

## 5. Políticas RLS

### `resource_price_observations`

| Operación | Roles permitidos | Restricción adicional |
|---|---|---|
| SELECT | todos los miembros de la org | `organization_id = app.current_org()` |
| INSERT | admin, gerencia, presupuestos, compras | `organization_id = app.current_org()` AND `created_by = auth.uid()` |
| UPDATE | admin, gerencia | Solo columnas: `status`, `approved_by`, `approved_at`, `rejection_reason` |
| DELETE | nadie | DENY ALL |

### Extensión de `suppliers`

Las columnas nuevas heredan la RLS existente de la tabla `suppliers`.

---

## 6. Privacidad backend-first

Campos 🔒 NUNCA serializados a rol `cliente` ni `consulta`:

- `observed_price`
- `discount_percent`
- `suggested_net_price`
- `approved_by`
- `approved_at`
- `created_by`
- `notes` (de la observación)
- `defaultDiscountPercent` del proveedor
- `notes` del proveedor

Los roles `presupuestos` y `obra` pueden ver el estado (`status`, `isStale`) pero no los precios internos.

Los roles `admin`, `gerencia`, `compras` ven todos los campos.

---

## 7. Reglas de negocio

1. `organization_id`, `created_by` y `approved_by` SIEMPRE se derivan server-side. Nunca del navegador.
2. Las observaciones son append-only: no se sobreescribe historia.
3. Solo una observación `approved` por recurso puede estar vigente (no stale) como precio activo.
4. Aprobar una observación NO modifica presupuestos emitidos (`issued`/`approved`/`archived`).
5. `suggested_net_price` tiene invariante en DB (trigger BEFORE INSERT OR UPDATE).
6. Si `valid_until` no está definida, la vigencia es 30 días desde `approved_at`.
7. El proveedor puede ser `null` (observación sin proveedor específico).
8. Rechazo requiere `rejection_reason` no vacío.

---

## 8. No aplica en Fase 3A

- Double approval (queda como feature futura — ver OPEN_QUESTIONS Q12).
- Integración automática con BOQ/APU (no se tocan snapshots).
- Scraping ni APIs externas.
- Phase 3B ni funcionalidades de compras/pagos.
