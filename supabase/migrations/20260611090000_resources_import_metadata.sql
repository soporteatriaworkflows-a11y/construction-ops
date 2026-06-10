-- Migration: CATALOG_BULK_ONBOARDING_V1 — metadatos de importación en resources
-- Agent: agent-db-rls (vía agent-orchestrator)
-- Contrato: docs/CATALOG_BULK_ONBOARDING_V1_CONTRACT.md §3, §12
--
-- Aditiva. Sin tabla nueva: las políticas RLS existentes de `resources`
-- (org-scoped SELECT/INSERT/UPDATE/DELETE + FORCE RLS) cubren las columnas.
-- Sin defaults destructivos; columnas nullable; datos existentes intactos.
--
-- UP

ALTER TABLE resources
  ADD COLUMN description        text,
  ADD COLUMN category           text,
  ADD COLUMN brand              text,
  ADD COLUMN external_reference text,
  ADD COLUMN external_sku       text;

-- Longitudes de cordura (la validación principal es de aplicación).
ALTER TABLE resources
  ADD CONSTRAINT resources_description_len CHECK (description IS NULL OR length(description) <= 500),
  ADD CONSTRAINT resources_category_len CHECK (category IS NULL OR length(category) <= 120),
  ADD CONSTRAINT resources_brand_len CHECK (brand IS NULL OR length(brand) <= 120),
  ADD CONSTRAINT resources_external_reference_len CHECK (external_reference IS NULL OR length(external_reference) <= 120),
  ADD CONSTRAINT resources_external_sku_len CHECK (external_sku IS NULL OR length(external_sku) <= 120);

-- Matching de listas de precios de proveedor (no únicos: la ambigüedad se
-- detecta y reporta en aplicación; nunca se resuelve en silencio).
CREATE INDEX resources_org_external_sku_idx
  ON resources (organization_id, external_sku)
  WHERE external_sku IS NOT NULL;

CREATE INDEX resources_org_external_reference_idx
  ON resources (organization_id, external_reference)
  WHERE external_reference IS NOT NULL;

-- DOWN
-- DROP INDEX IF EXISTS resources_org_external_reference_idx;
-- DROP INDEX IF EXISTS resources_org_external_sku_idx;
-- ALTER TABLE resources
--   DROP CONSTRAINT IF EXISTS resources_external_sku_len,
--   DROP CONSTRAINT IF EXISTS resources_external_reference_len,
--   DROP CONSTRAINT IF EXISTS resources_brand_len,
--   DROP CONSTRAINT IF EXISTS resources_category_len,
--   DROP CONSTRAINT IF EXISTS resources_description_len,
--   DROP COLUMN IF EXISTS external_sku,
--   DROP COLUMN IF EXISTS external_reference,
--   DROP COLUMN IF EXISTS brand,
--   DROP COLUMN IF EXISTS category,
--   DROP COLUMN IF EXISTS description;
