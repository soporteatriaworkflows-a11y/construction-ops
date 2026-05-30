---
name: pricing-frontier
description: How cost-domain consumes approved prices via PricingReadPort without touching pricing internals
metadata:
  type: project
---

cost-domain defines and consumes `PricingReadPort` in `apps/web/modules/apu/pricing-port.ts` (interface only; the adapter is agent-pricing's). The engine programs against the port and injects a fake in tests.

**Why:** Q8 (DECISIONS.md): only `budgetReferencePrice` (client-safe ✅) crosses into APU cost. Internal fields (online_public_price, negotiated_discount_pct, expected_purchase_price, savings, margin) are 🔒 and never enter client-visible APU. The domain must not recalculate discounts/savings or query pricing tables.

**How to apply:**
- Resolve `unitPriceSnapshot` from `ApprovedPriceContext.budgetReferencePrice` via `resolveUnitPriceSnapshot`/`calculateApuComponentWithPort`.
- Handle domain errors `no_approved_price` and `ambiguous_price` as `PricingResolutionError` — never invent a price.
- The contract referenced by the task as `docs/PRICING_READ_CONTRACT.md` did NOT exist as a file in the wave-1.5 worktree; the port was implemented from the task spec + the Q8 canonical formulas in `docs/API_CONTRACTS.md`. If pricing later ships a real port, reconcile signatures via INTEGRATION_REQUESTS.
