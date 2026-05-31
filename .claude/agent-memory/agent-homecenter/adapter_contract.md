---
name: adapter-contract
description: PRICING_ADAPTER_CONTRACT v1 - SupplierAdapter interface and types
metadata:
  type: reference
---

Source: `docs/PRICING_ADAPTER_CONTRACT.md` (frozen v1, do not edit)

Interface `SupplierAdapter`:
- `providerKey: string`
- `parseCatalog(input: CatalogInput): Promise<RawSupplierItem[]>`
- `mapToSupplierProducts(rows: RawSupplierItem[]): Promise<SkuMatchProposal[]>`
- `buildPreview(proposals: SkuMatchProposal[]): ImportPreview`
- `toPriceObservations(approved: SkuMatchProposal[]): RecordObservationInput[]`

Types: `RawSupplierItem`, `SkuMatchCandidate`, `SkuMatchProposal`, `ImportPreview`, `ImportResult`
Base types reused from `@/lib/utils/types`: `Uuid`, `IsoDateTime`, `DecimalString`
`RecordObservationInput` from `@/modules/pricing/types`

Idempotency key: providerKey + supplierProductId + observedAt + sourceType + optional content hash

Privacy (🔒 = never to client): sku, url, sourceReference, onlinePublicPrice, candidates, chosen, score, reviewNotes, approver data
