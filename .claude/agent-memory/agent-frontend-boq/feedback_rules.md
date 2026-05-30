---
name: feedback-rules
description: Non-negotiable implementation rules from project setup confirmed before starting Oleada 1
metadata:
  type: feedback
---

ZERO financial logic in components. All DecimalString values displayed as-is from mocks/props; never add, multiply, or derive them in React components.
**Why:** cost-domain owns all calculation logic; duplicating it in frontend would create two sources of truth and break the immutability guarantee for snapshots.
**How to apply:** If a subtotal or total needs to appear, it must be in the mock data object already — never compute it inline.

Mock data must match API_CONTRACTS.md interfaces EXACTLY (camelCase, DecimalString for money, no invented or renamed fields).
**Why:** Oleada 2 will replace mocks with real types from cost-domain; any divergence breaks the integration.
**How to apply:** Import types directly from the types file; run tsc --noEmit before declaring done.

"use client" only where state or browser events are required (AG Grid, forms with useState).
**Why:** Server Components reduce bundle size; Next 16 App Router defaults to SC.
**How to apply:** AG Grid grids must be client components. Static table displays can be server components.

Never show 🔒 fields (negotiated_discount_pct, observedPrice, baseSalary, etc.) in any client-facing view.
**Why:** Privacy rule is backend-enforced but frontend must also respect it in mock data display.
**How to apply:** Client-role pages never render those fields even in mock mode.

AG Grid Community only — never import from ag-grid-enterprise.
**Why:** Enterprise requires paid license; Community is MIT.
**How to apply:** Import only from "ag-grid-community" and "ag-grid-react".
