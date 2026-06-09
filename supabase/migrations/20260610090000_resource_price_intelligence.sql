-- Migration: PRICE INTELLIGENCE FOUNDATION — resource_price_observations + suppliers extension
-- Agent: agent-db-rls
-- Contrato: docs/PRICE_INTELLIGENCE_FOUNDATION_CONTRACT.md v1
-- Fase 3A — Price Intelligence Foundation
--
-- Additive. No modifica tablas existentes destructivamente.
-- La tabla price_observations (Wave 2B / Homecenter) se conserva intacta.
--
-- UP

-- -----------------------------------------------------------------------
-- A. Extender suppliers (columnas nuevas, non-breaking)
-- -----------------------------------------------------------------------

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS website_url           text,
  ADD COLUMN IF NOT EXISTS default_discount_percent numeric(6,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes                 text,
  ADD COLUMN IF NOT EXISTS created_by            uuid REFERENCES profiles (id) ON DELETE SET NULL;

ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_default_discount_range
    CHECK (default_discount_percent >= 0 AND default_discount_percent <= 100);

-- -----------------------------------------------------------------------
-- B. Función trigger: invariante suggested_net_price
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.set_rpo_suggested_net_price()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.suggested_net_price :=
    round(NEW.observed_price * (1.0 - NEW.discount_percent / 100.0), 10);
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------
-- C. Tabla resource_price_observations
-- -----------------------------------------------------------------------

CREATE TABLE resource_price_observations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  resource_id          uuid NOT NULL REFERENCES resources (id) ON DELETE RESTRICT,
  supplier_id          uuid REFERENCES suppliers (id) ON DELETE SET NULL,
  observed_price       numeric(20,10) NOT NULL,
  discount_percent     numeric(6,4) NOT NULL DEFAULT 0,
  suggested_net_price  numeric(20,10) NOT NULL,
  unit                 text NOT NULL,
  currency             text NOT NULL DEFAULT 'COP',
  source_type          text NOT NULL,
  source_reference     text,
  observed_at          timestamptz NOT NULL,
  valid_until          timestamptz,
  status               text NOT NULL DEFAULT 'pending',
  notes                text,
  created_by           uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  approved_by          uuid REFERENCES profiles (id) ON DELETE SET NULL,
  approved_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rpo_observed_price_nonneg
    CHECK (observed_price >= 0),
  CONSTRAINT rpo_discount_range
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT rpo_currency_iso
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT rpo_source_type_valid CHECK (
    source_type IN (
      'official_api','official_feed','supplier_csv',
      'manual','public_web','invoice','quotation'
    )
  ),
  CONSTRAINT rpo_status_valid CHECK (
    status IN ('pending','approved','rejected','expired')
  ),
  CONSTRAINT rpo_rejection_requires_reason CHECK (
    status <> 'rejected' OR (rejection_reason IS NOT NULL AND rejection_reason <> '')
  ),
  CONSTRAINT rpo_approved_requires_approver CHECK (
    status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

-- Trigger: mantiene invariante suggested_net_price en EVERY INSERT/UPDATE.
CREATE TRIGGER rpo_set_suggested_net_price
  BEFORE INSERT OR UPDATE ON resource_price_observations
  FOR EACH ROW EXECUTE FUNCTION app.set_rpo_suggested_net_price();

-- Índices de acceso frecuente
CREATE INDEX rpo_organization_resource_idx
  ON resource_price_observations (organization_id, resource_id);

CREATE INDEX rpo_resource_status_created_idx
  ON resource_price_observations (resource_id, status, created_at DESC);

CREATE INDEX rpo_supplier_id_idx
  ON resource_price_observations (supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX rpo_status_idx
  ON resource_price_observations (status);

-- DOWN
-- ALTER TABLE suppliers
--   DROP CONSTRAINT IF EXISTS suppliers_default_discount_range,
--   DROP COLUMN IF EXISTS website_url,
--   DROP COLUMN IF EXISTS default_discount_percent,
--   DROP COLUMN IF EXISTS notes,
--   DROP COLUMN IF EXISTS created_by;
-- DROP TABLE IF EXISTS resource_price_observations;
-- DROP FUNCTION IF EXISTS app.set_rpo_suggested_net_price();
