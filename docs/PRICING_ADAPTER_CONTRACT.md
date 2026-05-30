# PRICING ADAPTER CONTRACT — Construction Ops

> **Contrato congelado v1 para Oleada 2B — cambios únicamente mediante
> `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad: **agent-orchestrator** (congelado). Implementa: **agent-homecenter**.
> Consume: el dominio de **pricing** (`PricingApprovalPort`, tipos compartidos).
> Ningún agente edita este documento por su cuenta; toda propuesta de cambio
> pasa por `docs/INTEGRATION_REQUESTS.md` y la aprueba el orquestador.

Define la **interfaz estable de adaptadores de proveedor** para importar
catálogos/precios externos (Homecenter como primera implementación) hacia el
dominio de precios, **siempre con aprobación humana** y **privacidad
backend-first**. Cierra **Q11** (aprobación humana) y **Q14** (canal Homecenter)
— ver `docs/DECISIONS.md`.

---

## 1. Frontera del módulo

`agent-homecenter` **implementa exclusivamente**:
- `apps/web/modules/pricing/adapters/`
- `scripts/catalog-sync/`
- `apps/web/tests/unit/pricing-adapters/`

**Consume** (no modifica):
- `PricingApprovalPort` (escritura interna de pricing, `apps/web/modules/pricing/types.ts`).
- Tipos compartidos de pricing y del contrato de lectura
  (`@/lib/contracts/pricing-read`, `@/modules/pricing`).
- Contratos congelados existentes (`PRICING_READ_CONTRACT`, `API_CONTRACTS`,
  `DATABASE_SCHEMA`).

**NO implementa** (frontera dura):
- cálculos de APU, BOQ, AIU ni lógica de snapshots;
- nuevas capas de pricing (variación/descuento/ahorros) — eso es de `agent-pricing`;
- UI compleja, deploy ni conexión remota;
- escritura directa en base de datos.

**Regla de oro:** ningún adaptador escribe en DB directamente. **Toda**
persistencia ocurre vía `PricingApprovalPort`, tras **aprobación humana**, y deja
**auditoría**.

---

## 2. Interface `SupplierAdapter`

```ts
export interface SupplierAdapter {
  /** Clave estable del proveedor, p. ej. 'homecenter'. */
  readonly providerKey: string;

  /** Lee un catálogo crudo (CSV/Excel) y lo normaliza a filas. No persiste. */
  parseCatalog(input: CatalogInput): Promise<RawSupplierItem[]>;

  /** Propone coincidencias SKU→recurso/producto con candidatos y score. No persiste. */
  mapToSupplierProducts(rows: RawSupplierItem[]): Promise<SkuMatchProposal[]>;

  /** Construye el preview (resumen + conflictos). No persiste. */
  buildPreview(proposals: SkuMatchProposal[]): ImportPreview;

  /**
   * Convierte SÓLO las propuestas APROBADAS por humano en entradas append-only
   * para `PricingApprovalPort.recordObservation`. No persiste por sí mismo.
   */
  toPriceObservations(approved: SkuMatchProposal[]): RecordObservationInput[];
}
```

**Reglas:**
1. Ningún adaptador escribe en DB; toda persistencia pasa por `PricingApprovalPort`.
2. Toda aprobación deja auditoría (ver §6 / Q11).
3. Los imports son **idempotentes** (§4): no duplican observaciones idénticas.
4. Los conflictos y ambigüedades quedan **visibles en el preview**, nunca
   aprobados automáticamente.
5. `parseCatalog`/`mapToSupplierProducts`/`buildPreview` son de **solo lectura**.
6. `toPriceObservations` solo procesa propuestas con `status='approved'`.

`CatalogInput` (forma mínima): `{ fileName: string; mimeType?: string; content: string | Uint8Array; }` (sin rutas a archivos privados reales).

---

## 3. Tipos compartidos

```ts
export interface RawSupplierItem {
  sku?: string;                  // 🔒
  name: string;
  onlinePublicPrice: DecimalString; // 🔒 precio público observado
  currency: string;              // ISO-4217, p. ej. 'COP'
  url?: string;                  // 🔒
  unit?: string;
  observedAt: IsoDateTime;
  sourceReference?: string;      // 🔒
  rawRowIndex: number;           // fila de origen (trazabilidad)
}

export interface SkuMatchCandidate {
  resourceId: Uuid;
  supplierProductId?: Uuid;      // 🔒 si no aplica exponer
  score: number;                 // 0..1
  reason: string;                // explicación del match
}

export interface SkuMatchProposal {
  rawItem: RawSupplierItem;
  candidates: SkuMatchCandidate[];   // 🔒
  chosen?: SkuMatchCandidate;        // 🔒 (elección humana)
  status: 'pending' | 'approved' | 'rejected';
  requiresManualReview: boolean;     // true si ambiguo / sin candidato claro
  reviewNotes?: string;              // 🔒
}

export interface ImportPreview {
  providerKey: string;
  sourceFileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  ambiguousRows: number;
  approvedRows: number;
  proposals: SkuMatchProposal[];
  warnings: string[];
}

export interface ImportResult {
  recorded: number;
  skipped: number;
  rejected: number;
  duplicates: number;
  errors: string[];
}
```

Reusan los alias base (`Uuid`, `IsoDateTime`, `DecimalString`) de
`@/lib/utils/types`. `RecordObservationInput` es el tipo existente de
`@/modules/pricing` (no se redefine).

---

## 4. Idempotencia

Clave idempotente conceptual de una observación importada:
- `providerKey`
- `supplierProductId`
- `observedAt`
- `sourceType`
- (opcional) hash del contenido normalizado de la fila cuando aporte unicidad.

Reglas:
- No se duplican observaciones idénticas (misma clave) — se cuentan como
  `duplicates` en `ImportResult`, no se vuelven a registrar.
- Re-ejecutar el mismo import produce el mismo resultado (cero nuevas
  observaciones si nada cambió).
- `price_observations` permanece **append-only** (sin UPDATE/DELETE); la
  idempotencia se resuelve ANTES de llamar a `recordObservation`.

---

## 5. Aprobación humana (Q11)

- **MVP: aprobación SIMPLE** por un usuario interno autorizado.
- Una importación **no persiste automáticamente**: primero `buildPreview`; el
  humano revisa, elige candidato (`chosen`) y aprueba/rechaza por fila.
- Coincidencias **ambiguas** (`requiresManualReview=true` o sin candidato claro)
  quedan `pending`; **nunca** se persisten como aprobadas.
- Ningún precio nuevo modifica **snapshots emitidos** ni versiones
  `approved/issued/archived`.
- **Auditoría obligatoria** por aprobación (vía `PricingApprovalPort` +
  metadatos): aprobador, timestamp, fuente, motivo, override aplicado,
  observación previa, resultado aprobado, `supplierProductId`, `resourceId`,
  `observedAt`, `sourceType`, `sourceReference` (cuando exista).
- **Doble aprobación**: soporte **futuro configurable** (umbral superado,
  anomalía, proveedor crítico, organización lo exige, rol insuficiente). NO se
  implementa obligatoriamente en 2B; el diseño debe dejar el punto de extensión.

---

## 6. Privacidad (backend-first)

Marcados **🔒 INTERNOS** (nunca a rol cliente; el backend los **omite** antes de
serializar — no basta ocultarlos en UI):
- `sku`, `url`, `sourceReference`;
- proveedor interno (datos de `supplier`/`supplierProduct`);
- `onlinePublicPrice` (precio público observado);
- `candidates`, `chosen`, `score`;
- `reviewNotes` y observaciones privadas;
- usuario aprobador, motivos y overrides.

El adaptador **no** conoce ni expone descuentos/ahorros/márgenes (eso es de
pricing). La única superficie cliente-safe de precio sigue siendo
`ClientSafePrice` (de `PRICING_READ_CONTRACT`).

---

## 7. Canal Homecenter (Q14)

- **MVP**: adaptador genérico + implementación Homecenter por **archivo
  CSV/Excel** con preview + aprobación humana.
- Permitir `sku` y `url` cuando existan; matching con candidatos y score;
  **fallback manual** siempre disponible; trazabilidad completa.
- **NO asumir** API pública, feed estable, endpoints internos ni acceso
  empresarial concedido.
- **Prohibido**: scraping agresivo, automatización opaca, modificar presupuestos
  emitidos, persistir coincidencias ambiguas como aprobadas.
- Interfaz **sustituible** para soportar luego: API oficial, feed oficial,
  cotización empresarial, carga manual controlada, automatización n8n
  supervisada (diseño documentado, no integración productiva en 2B).

---

_Congelado el 2026-05-30 (Oleada 2B). Referencias: Q11/Q14 en
`docs/DECISIONS.md`; `PricingApprovalPort` en `apps/web/modules/pricing/types.ts`;
contrato de lectura en `docs/PRICING_READ_CONTRACT.md`._
