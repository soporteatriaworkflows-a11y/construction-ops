-- Seed: Price Intelligence Foundation — proveedores y observaciones demo
-- Agent: agent-db-rls / agent-pricing
-- Fase 3A — Price Intelligence Foundation
--
-- Sanitizado. Datos de ejemplo (no reales). UUIDs fijos. Idempotente.
-- Se ejecuta sin RLS (migradores). organization_id = org demo A.

-- -----------------------------------------------------------------------
-- Extender proveedor demo existente con campos nuevos
-- -----------------------------------------------------------------------
UPDATE suppliers
SET
  website_url             = 'https://www.homecenter.com.co',
  default_discount_percent = 8.00,
  notes                   = 'Proveedor demo — datos de ejemplo'
WHERE id = '00000000-0000-0000-0000-000000000101'
  AND organization_id = '00000000-0000-0000-0000-0000000000a1';

-- -----------------------------------------------------------------------
-- Proveedor demo adicional (distribuidor)
-- -----------------------------------------------------------------------
INSERT INTO suppliers (
  id, organization_id, name, supplier_type,
  website_url, default_discount_percent, notes, active
) VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-0000000000a1',
  'Distribuidora Cemex Demo', 'distributor',
  'https://www.cemex.com.co', 5.00, 'Distribuidor demo', true
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------
-- Observaciones de precio para MAT-001 (Cemento gris 50kg)
-- resource_id = 00000000-0000-0000-0000-0000000000e1
-- -----------------------------------------------------------------------

-- Observación aprobada (vigente)
INSERT INTO resource_price_observations (
  id, organization_id, resource_id, supplier_id,
  observed_price, discount_percent, suggested_net_price,
  unit, currency, source_type, source_reference,
  observed_at, valid_until,
  status, notes,
  created_by, approved_by, approved_at
) VALUES (
  '00000000-0000-0000-0000-000000001001',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-000000000101',
  28000.0000000000, 8.00,
  -- suggested_net_price = 28000 * (1 - 8/100) = 25760 (trigger la recalcula)
  25760.0000000000,
  'saco', 'COP', 'manual', 'Cotización presencial 2026-06-01',
  '2026-06-01T10:00:00-05:00', NULL,
  'approved', 'Precio verificado en tienda',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000b1',
  '2026-06-02T09:00:00-05:00'
)
ON CONFLICT (id) DO NOTHING;

-- Observación pendiente (esperando revisión)
INSERT INTO resource_price_observations (
  id, organization_id, resource_id, supplier_id,
  observed_price, discount_percent, suggested_net_price,
  unit, currency, source_type, source_reference,
  observed_at, valid_until,
  status, notes,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000001002',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-000000000102',
  29500.0000000000, 5.00,
  -- 29500 * (1 - 5/100) = 28025 (trigger la recalcula)
  28025.0000000000,
  'saco', 'COP', 'quotation', 'Cotización #Q-2026-0042',
  '2026-06-05T14:30:00-05:00', '2026-07-05T23:59:59-05:00',
  'pending', NULL,
  '00000000-0000-0000-0000-0000000000b1'
)
ON CONFLICT (id) DO NOTHING;

-- Observación rechazada (histórica)
INSERT INTO resource_price_observations (
  id, organization_id, resource_id, supplier_id,
  observed_price, discount_percent, suggested_net_price,
  unit, currency, source_type, source_reference,
  observed_at,
  status, rejection_reason, notes,
  created_by, approved_by, approved_at
) VALUES (
  '00000000-0000-0000-0000-000000001003',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000e1',
  NULL,
  35000.0000000000, 0.00,
  35000.0000000000,
  'saco', 'COP', 'public_web', NULL,
  '2026-05-15T08:00:00-05:00',
  'rejected', 'Precio superior al de mercado verificado', NULL,
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000b1',
  '2026-05-16T10:00:00-05:00'
)
ON CONFLICT (id) DO NOTHING;
