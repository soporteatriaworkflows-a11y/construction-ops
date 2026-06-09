-- Fix: widen discount_percent columns from NUMERIC(6,4) to NUMERIC(7,4).
-- NUMERIC(6,4) can only hold up to 99.9999, so discount_percent=100 triggers
-- a numeric overflow before the CHECK constraint fires. NUMERIC(7,4) allows
-- values up to 999.9999 — the CHECK(<=100) remains the semantic enforcer.
-- Non-destructive: existing data (all in [0,99.9999]) is unaffected.
--
-- PostgreSQL requires dropping policies that reference the altered column
-- before ALTER COLUMN TYPE, then recreating them.

-- 1. Drop policy that references discount_percent
DROP POLICY IF EXISTS rpo_update_review_only ON resource_price_observations;

-- 2. Widen column types
ALTER TABLE resource_price_observations
  ALTER COLUMN discount_percent TYPE NUMERIC(7,4);

ALTER TABLE suppliers
  ALTER COLUMN default_discount_percent TYPE NUMERIC(7,4);

-- 3. Recreate the policy (identical logic, compatible with wider type)
CREATE POLICY rpo_update_review_only ON resource_price_observations
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid())
      IN ('admin','gerencia')
    )
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND resource_id = resource_id
    AND observed_price = observed_price
    AND discount_percent = discount_percent
    AND unit = unit
    AND currency = currency
    AND source_type = source_type
    AND observed_at = observed_at
    AND created_by = created_by
    AND created_at = created_at
  );

-- DOWN (reference only, not executed)
-- DROP POLICY IF EXISTS rpo_update_review_only ON resource_price_observations;
-- ALTER TABLE resource_price_observations ALTER COLUMN discount_percent TYPE NUMERIC(6,4);
-- ALTER TABLE suppliers ALTER COLUMN default_discount_percent TYPE NUMERIC(6,4);
-- CREATE POLICY rpo_update_review_only ... (original definition)
