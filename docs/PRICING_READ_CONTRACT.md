# PRICING READ CONTRACT — Construction Ops

> **Contrato congelado v1 para Oleada 2A — cambios únicamente mediante
> `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad: **agent-orchestrator** (congelado). Implementa: **agent-pricing**.
> Consume: **agent-cost-domain**. Ningún agente edita este documento por su
> cuenta; toda propuesta de cambio pasa por `docs/INTEGRATION_REQUESTS.md` y la
> aprueba el orquestador.
>
> **FUENTE ÚNICA DE CÓDIGO (integración 2A):** los tipos/puertos de este contrato
> viven en **`apps/web/lib/contracts/pricing-read.ts`**. `agent-cost-domain`
> los importa (vía `apps/web/modules/apu/pricing-port.ts`, re-export);
> `agent-pricing` los implementa (vía `apps/web/modules/pricing/types.ts`,
> re-export). No debe existir ninguna otra definición de `PricingReadPort` /
> `ApprovedPriceContext`.
>
> **Aclaraciones de la integración 2A (compatibles, documentadas):**
> 1. `PricingReadPort.getApprovedPrice` es **async** y devuelve un
>    `PricingReadResult` (`{ok:true,value}|{ok:false,error}`). Para estilo
>    excepción se proveen las clases `ApprovedPriceNotFoundError` y
>    `AmbiguousApprovedPriceError` + el helper `throwOnPricingError`.
> 2. `PricingReadQuery` incluye `estimateVersionId?` (opcional) para congelar el
>    precio por versión de presupuesto (lo usa cost-domain; pricing puede
>    ignorarlo y resolver por `asOf`).

Define la **interfaz estable de lectura de precios** que `agent-cost-domain`
consume y que `agent-pricing` implementa. Su objetivo es desacoplar el motor
financiero (cost-domain) de la lógica comercial y de persistencia de precios
(pricing), manteniendo **una sola fuente de verdad** y **privacidad
backend-first** (Q8/Q9 ya resueltas en `docs/DECISIONS.md`).

**Principio de frontera:** `agent-cost-domain` **no** consulta tablas de pricing
(`supplier_products`, `price_observations`, `pricing_rules`) directamente, **no**
recalcula descuentos/ahorros y **no** duplica reglas comerciales. Solo consume el
puerto `PricingReadPort` (o un DTO `ApprovedPriceContext` compatible). `pricing`
es el único dueño de la derivación comercial.

---

## 1. Tipos base

Reutilizan los alias ya congelados en `docs/API_CONTRACTS.md` (no se redefinen,
se referencian para evitar divergencia):

```ts
// De docs/API_CONTRACTS.md (contrato congelado v1) — NO redefinir.
export type Uuid = string;          // UUID v4 canónico
export type IsoDateTime = string;   // ISO-8601 con zona (timestamptz)
export type DecimalString = string; // decimal serializado como string (NUNCA number)

export type PriceSourceType =
  | 'official_api' | 'official_feed' | 'supplier_csv'
  | 'manual' | 'public_web' | 'invoice' | 'quotation';

export type PricingRuleType =
  | 'preventive_variation' | 'negotiated_discount' | 'tax'
  | 'commercial_markup' | 'rounding' | 'manual_adjustment';

export type SyncStatus = 'manual' | 'synced' | 'pending' | 'error';
```

**Reglas de tipos:**
- Todo valor **monetario** viaja como `DecimalString` (p. ej. `"28000.0000000000"`).
- Todo **porcentaje** viaja como `DecimalString` en forma decimal
  (p. ej. `3 %` → `"0.03"`), NO como `number` ni como entero de puntos básicos.
- Prohibido `number` para operaciones financieras (sin `float` JS).
- Prohibido redondear valores intermedios. La presentación `ROUND_HALF_UP`
  (Q9) ocurre **solo** en UI/exportes, fuera de este contrato.

---

## 2. `ApprovedPriceContext`

Snapshot **aprobado e inmutable** del precio de un recurso en un momento dado.
Es el DTO que cost-domain recibe para fijar el `unit_price_snapshot` de un
componente de APU. Todos los derivados ya vienen calculados por `pricing` según
las fórmulas canónicas de Q8.

```ts
export interface ApprovedPriceContext {
  // --- Identidad / cliente-safe ---
  resourceId: Uuid;
  supplierProductId: Uuid;          // 🔒 cuando no aplique exponer el proveedor
  currency: string;                 // ISO-4217, p. ej. 'COP'
  observedAt: IsoDateTime;          // momento de la observación de origen
  approvedAt: IsoDateTime;          // momento de aprobación humana
  sourceType: PriceSourceType;

  // --- Capa de precio interna (🔒 — nunca a rol cliente) ---
  onlinePublicPrice: DecimalString;        // 🔒 base del cálculo (Q8)
  preventiveVariationPct: DecimalString;   // 🔒 variación preventiva (decimal)
  budgetReferencePrice: DecimalString;     // 🔒 precio presupuestado (derivado)
  negotiatedDiscountPct: DecimalString;    // 🔒 descuento interno (decimal)
  expectedPurchasePrice: DecimalString;    // 🔒 precio esperado de compra (derivado)
  actualPurchasePrice?: DecimalString;     // 🔒 precio real (factura/compra), opcional
  projectedSaving: DecimalString;          // 🔒 ahorro proyectado (derivado)
  realizedSaving?: DecimalString;          // 🔒 ahorro realizado (derivado), opcional

  // --- Trazabilidad (🔒) ---
  sourceReference?: string;         // 🔒 URL/SKU/factura interna de origen
  manualOverride: boolean;          // true si el contexto proviene de un override manual aprobado
}
```

### 2.1 Fórmulas canónicas (Q8 — base = `onlinePublicPrice`)

Calculadas por `pricing`; cost-domain **no** las recalcula. Todas en `Decimal.js`,
sin redondeo intermedio:

```
budgetReferencePrice  = onlinePublicPrice × (1 + preventiveVariationPct)
expectedPurchasePrice = onlinePublicPrice × (1 − negotiatedDiscountPct)
projectedSaving       = budgetReferencePrice − expectedPurchasePrice
realizedSaving        = budgetReferencePrice − actualPurchasePrice   // solo si existe actualPurchasePrice
```

- La **base del descuento es `onlinePublicPrice`** (Q8), no
  `budgetReferencePrice`. Excepciones configurables por proveedor/producto vía
  `pricing_rules` siguen produciendo un `ApprovedPriceContext` con estos campos
  ya resueltos.
- `realizedSaving` y `actualPurchasePrice` son opcionales: ausentes hasta que
  exista una compra/factura real.

### 2.2 Precio que consume cost-domain

Para fijar el snapshot del componente de APU, cost-domain usa
**`budgetReferencePrice`** como `unit_price_snapshot` (precio presupuestado,
cliente-safe a nivel de BOQ/total). Los campos 🔒 acompañan el contexto para
trazabilidad y reporting interno, pero **no** entran en ninguna proyección de
cliente.

---

## 3. `PricingReadPort`

Puerto estable de **lectura**. cost-domain depende de esta interfaz (o de un DTO
`ApprovedPriceContext` compatible inyectado), nunca de tablas de pricing.

```ts
export interface PricingReadQuery {
  resourceId: Uuid;            // obligatorio
  asOf?: IsoDateTime;          // fecha de corte (default: ahora) → snapshot vigente a esa fecha
  projectId?: Uuid;            // contexto de proyecto cuando aplique precedencia
  projectScopeId?: Uuid;       // contexto de alcance cuando aplique
  supplierId?: Uuid;           // desambiguar por proveedor
  supplierProductId?: Uuid;    // desambiguar por producto de proveedor
}

export type PricingReadResult =
  | { ok: true; value: ApprovedPriceContext }
  | { ok: false; error: PricingReadError };

export type PricingReadError =
  | { kind: 'no_approved_price'; resourceId: Uuid; asOf?: IsoDateTime }
  | { kind: 'ambiguous_price'; resourceId: Uuid; candidates: PricingCandidateRef[] };

export interface PricingCandidateRef {
  supplierProductId: Uuid;     // 🔒 si no aplica exponer
  observedAt: IsoDateTime;
  sourceType: PriceSourceType;
}

export interface PricingReadPort {
  getApprovedPrice(query: PricingReadQuery): Promise<PricingReadResult>;
}
```

**Reglas del puerto:**
- Devuelve **un único** `ApprovedPriceContext` cuando hay un precio aprobado
  resoluble sin ambigüedad.
- Devuelve `error.kind = 'no_approved_price'` (error de dominio explícito) cuando
  no existe precio **aprobado** para el recurso a la fecha de corte. cost-domain
  debe propagar/registrar este error, **no** inventar un precio.
- Devuelve `error.kind = 'ambiguous_price'` con `candidates` cuando hay varias
  observaciones aprobadas válidas y la query no las desambigua. La resolución de
  ambigüedad (elegir/aprobar) es responsabilidad de `pricing` + humano, no de
  cost-domain.
- Resultado **determinista** para una misma query + estado de datos (necesario
  para snapshots reproducibles y regresión).
- `getApprovedPrice` es de **solo lectura**: no muta estado.

---

## 4. `PricingApprovalPort`

Puerto **interno de escritura**, responsabilidad **exclusiva de `agent-pricing`**.
cost-domain **no** lo consume. Se define aquí solo para fijar la frontera.

```ts
export interface PricingApprovalPort {
  // Registrar una observación de precio (append-only; nunca UPDATE/DELETE).
  recordObservation(input: RecordObservationInput): Promise<{ observationId: Uuid }>;
  // Aprobación humana de una observación (trazable, con aprobador y timestamp).
  approveObservation(input: ApproveObservationInput): Promise<ApprovedPriceContext>;
  // Override manual aprobado y trazable (genera nueva observación + aprobación).
  applyManualOverride(input: ManualOverrideInput): Promise<ApprovedPriceContext>;
}
```

**Responsabilidades (solo `pricing`):**
- Registrar observación (append-only sobre `price_observations`).
- Aprobar observación (aprobación humana; `approved`, `approvedBy`, `approvedAt`).
- Aplicar override manual (trazable, con fuente y aprobador).
- Conservar histórico append-only (sin UPDATE/DELETE; ya validado por RLS runtime).
- Identificar fuente (`sourceType`, `sourceReference`).
- Exigir trazabilidad (aprobador interno + timestamps).
- **No** modificar snapshots emitidos ni versiones `issued/approved/archived`.

Las formas exactas de `RecordObservationInput`, `ApproveObservationInput` y
`ManualOverrideInput` las define `pricing` en su módulo; este contrato solo fija
que existen y que pertenecen a pricing. Cambios que afecten a cost-domain pasan
por `INTEGRATION_REQUESTS`.

---

## 5. Privacidad (backend-first)

### 5.1 Campos 🔒 INTERNOS (prohibidos para rol cliente)
Nunca se serializan en respuestas para el rol cliente. **No basta ocultarlos en
UI**: el backend los **omite** antes de serializar.

- `onlinePublicPrice`
- `preventiveVariationPct`
- `negotiatedDiscountPct`
- `expectedPurchasePrice`
- `actualPurchasePrice`
- `projectedSaving`
- `realizedSaving`
- `sourceReference`
- `budgetReferencePrice` cuando se exponga al margen del BOQ (ver 5.3)
- proveedor interno (`supplierProductId`/datos de proveedor) cuando no aplique mostrarlo
- notas privadas (observaciones)
- aprobador interno (identidad de quien aprobó)

### 5.2 Proyección cliente-safe separada
`pricing` expone una proyección distinta, sin campos 🔒:

```ts
export interface ClientSafePrice {
  resourceId: Uuid;
  unitPrice: DecimalString;   // = budgetReferencePrice (precio presupuestado)
  currency: string;
  // SIN onlinePublicPrice, SIN descuentos, SIN ahorros, SIN proveedor interno,
  // SIN sourceReference, SIN aprobador, SIN notas.
}
```

### 5.3 Regla de exposición del precio presupuestado
El **precio presupuestado** (`budgetReferencePrice`) es cliente-safe **solo** a
nivel de ítem BOQ (`unitPriceSnapshot`) y de los totales del presupuesto. La capa
de precio interna que lo origina (público + variación + descuento) permanece 🔒.
La proyección cliente nunca revela cómo se compone el precio.

**Regla operativa:** cualquier endpoint o export para rol cliente usa
`ClientSafePrice` / proyección equivalente. El proyector de privacidad por perfil
es responsabilidad de `pricing`/`exports` (ver `docs/API_CONTRACTS.md §4`).

---

## 6. Resumen de frontera (quién hace qué)

| Responsabilidad | Dueño | Notas |
|---|---|---|
| Persistir proveedores/productos/observaciones/reglas | pricing | tablas con RLS (ya en `main`) |
| Calcular `budget/expected/projected/realized` (Q8) | pricing | fórmulas §2.1, `Decimal.js`, raw |
| Aprobación humana + override trazable | pricing | `PricingApprovalPort` |
| Exponer `getApprovedPrice` | pricing | implementa `PricingReadPort` |
| Proyección `ClientSafePrice` (privacidad) | pricing | backend-first |
| Consumir `ApprovedPriceContext` para snapshot de APU | cost-domain | vía `PricingReadPort`/DTO |
| Calcular APU/BOQ/AIU/total y snapshots | cost-domain | no recalcula precios |
| Congelar/cambiar este contrato | orchestrator | vía `INTEGRATION_REQUESTS` |

---

_Congelado el 2026-05-30 (Oleada 2A). Referencias: Q8/Q9 en `docs/DECISIONS.md`;
entidades en `docs/DATABASE_SCHEMA.md`; tipos base y matriz de privacidad en
`docs/API_CONTRACTS.md`._
