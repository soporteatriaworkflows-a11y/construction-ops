-- Migration: PROVEEDORES — suppliers, supplier_products, price_observations
-- Agent: agent-db-rls
-- Contrato congelado v1 (docs/DATABASE_SCHEMA.md).
--
-- UP

CREATE TABLE suppliers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name             text NOT NULL,
  supplier_type    text NOT NULL DEFAULT 'vendor',
  contact_data     jsonb,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_supplier_type_valid
    CHECK (supplier_type IN ('vendor','distributor','manufacturer','subcontractor','other'))
);

CREATE INDEX suppliers_organization_id_idx ON suppliers (organization_id);
CREATE INDEX suppliers_org_name_idx ON suppliers (organization_id, name);

CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE supplier_products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id             uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  resource_id             uuid NOT NULL REFERENCES resources (id) ON DELETE RESTRICT,
  supplier_sku            text,
  supplier_product_name   text,
  product_url             text,
  location_reference      text,
  currency                text NOT NULL DEFAULT 'COP',
  active                  boolean NOT NULL DEFAULT true,
  manual_override         boolean NOT NULL DEFAULT false,
  last_checked_at         timestamptz,
  sync_status             text NOT NULL DEFAULT 'manual',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_products_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_products_sync_status_valid
    CHECK (sync_status IN ('manual','synced','pending','error'))
);

CREATE INDEX supplier_products_supplier_id_idx ON supplier_products (supplier_id);
CREATE INDEX supplier_products_resource_id_idx ON supplier_products (resource_id);
-- UNIQUE (supplier_id, resource_id, supplier_sku). En PostgreSQL un índice
-- UNIQUE estándar trata cada NULL como distinto, por lo que esta línea no
-- impide múltiples filas con sku NULL para el mismo (supplier, resource).
-- Para garantizar unicidad también cuando el SKU es NULL se añade un índice
-- parcial complementario (decisión de db-rls, registrada en políticas).
CREATE UNIQUE INDEX supplier_products_supplier_resource_sku_uq
  ON supplier_products (supplier_id, resource_id, supplier_sku);
CREATE UNIQUE INDEX supplier_products_supplier_resource_nullsku_uq
  ON supplier_products (supplier_id, resource_id)
  WHERE supplier_sku IS NULL;

CREATE TRIGGER supplier_products_set_updated_at
  BEFORE UPDATE ON supplier_products
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- price_observations: append-only (sin updated_at; solo created_at).
CREATE TABLE price_observations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id  uuid NOT NULL REFERENCES supplier_products (id) ON DELETE CASCADE,
  observed_price       numeric(20,10) NOT NULL,
  stock_status         text,
  source_type          text NOT NULL,
  source_reference     text,
  observed_at          timestamptz NOT NULL,
  approved             boolean NOT NULL DEFAULT false,
  approved_by          uuid REFERENCES profiles (id) ON DELETE SET NULL,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_observations_price_nonneg CHECK (observed_price >= 0),
  CONSTRAINT price_observations_source_type_valid CHECK (
    source_type IN ('official_api','official_feed','supplier_csv','manual','public_web','invoice','quotation')
  )
);

CREATE INDEX price_observations_product_observed_idx
  ON price_observations (supplier_product_id, observed_at DESC);
CREATE INDEX price_observations_source_type_idx ON price_observations (source_type);

-- DOWN
-- DROP TABLE IF EXISTS price_observations;
-- DROP TABLE IF EXISTS supplier_products;
-- DROP TABLE IF EXISTS suppliers;
