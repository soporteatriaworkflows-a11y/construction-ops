---
name: project-context
description: Construction Ops Wave 2B context for agent-homecenter
metadata:
  type: project
---

Wave 2B of Construction Ops. agent-homecenter owns:
- `apps/web/modules/pricing/adapters/`
- `scripts/catalog-sync/`
- `apps/web/tests/unit/pricing-adapters/`

Key constraints:
- No DB writes directly; all via PricingApprovalPort
- No scraping, no assumed public API for Homecenter
- CSV fallback first; Excel via xlsx (devDep) only in tests/scripts
- Human approval required before any persistence
- Idempotency: no duplicate observations
- Privacy backend-first: sku/url/sourceReference/candidates/score/reviewNotes never to client role

**Why:** Q11 (human approval) and Q14 (Homecenter channel) resolved 2026-05-30.
**How to apply:** Every piece of code must enforce preview-first, no-auto-approve-ambiguous, append-only observations.
