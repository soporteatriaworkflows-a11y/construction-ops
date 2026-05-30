-- Seed: proyecto, alcance y catálogo mínimo demo (DESARROLLO/TESTING)
-- Agent: agent-db-rls
--
-- Sanitizado. El proyecto "ENTRE PATIOS" es el piloto del PROJECT_MASTER y NO
-- contiene datos comerciales privados aquí: solo estructura. Precios de
-- ejemplo arbitrarios (NO provienen del Excel real). UUIDs fijos.
--
-- Idempotente. Se ejecuta como migrador (sin RLS).

-- Proyecto piloto y alcance primer piso ------------------------------------
INSERT INTO projects (id, organization_id, code, name, status, location) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   'ENTRE-PATIOS', 'Entre Patios', 'active', 'Demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_scopes (id, project_id, parent_scope_id, code, name, scope_type) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   NULL, 'P1', 'Primer Piso', 'floor')
ON CONFLICT (id) DO NOTHING;

-- Recursos demo (material y mano de obra) ----------------------------------
INSERT INTO resources (id, organization_id, code, name, resource_type, unit, default_waste_pct) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1',
   'MAT-001', 'Cemento gris 50kg', 'material', 'saco', 0.05),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1',
   'MO-001', 'Oficial de obra', 'labor', 'hora', 0)
ON CONFLICT (id) DO NOTHING;

-- Rol de mano de obra demo (factores de ejemplo, no reales) ----------------
INSERT INTO labor_roles (
  id, organization_id, code, name, base_salary, transport_subsidy,
  benefits_pct, social_security_pct, payroll_tax_pct,
  working_days_month, working_hours_day
) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1',
   'LR-001', 'Oficial', 1300000, 162000, 0.40, 0.30, 0.09, 24, 8)
ON CONFLICT (id) DO NOTHING;

-- Proveedor y producto demo -------------------------------------------------
INSERT INTO suppliers (id, organization_id, name, supplier_type) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000a1',
   'Proveedor Demo', 'vendor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO supplier_products (id, supplier_id, resource_id, supplier_product_name, currency, sync_status) VALUES
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-0000000000e1', 'Cemento gris 50kg (demo)', 'COP', 'manual')
ON CONFLICT (id) DO NOTHING;

-- APU demo + componente -----------------------------------------------------
INSERT INTO apu_templates (id, organization_id, code, name, unit, version) VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000a1',
   'APU-001', 'Mortero de pega', 'm2', 1)
ON CONFLICT (id) DO NOTHING;

-- total_component_cost = quantity * (1 + waste_pct) * unit_price_snapshot
-- = 0.5 * (1 + 0.05) * 28000 = 14700
INSERT INTO apu_components (
  id, apu_template_id, resource_id, component_type, quantity, waste_pct,
  unit_price_source, unit_price_snapshot, total_component_cost, sort_order
) VALUES
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000201',
   '00000000-0000-0000-0000-0000000000e1', 'material', 0.5, 0.05,
   'resource', 28000, 14700, 0)
ON CONFLICT (id) DO NOTHING;

-- Presupuesto demo: estimate + versión draft + capítulo + ítem + AIU --------
INSERT INTO estimates (id, project_scope_id, code, name, status) VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000d1',
   'EST-001', 'Presupuesto Primer Piso', 'draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO estimate_versions (id, estimate_id, version_number, status) VALUES
  ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000301', 1, 'draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapters (id, estimate_version_id, code, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000311',
   'C01', 'Mampostería', 0)
ON CONFLICT (id) DO NOTHING;

-- subtotal = quantity_snapshot * unit_price_snapshot = 100 * 14700 = 1470000
INSERT INTO boq_items (
  id, estimate_version_id, chapter_id, apu_template_id, code,
  description_snapshot, unit_snapshot, quantity_snapshot, unit_price_snapshot,
  subtotal, sort_order
) VALUES
  ('00000000-0000-0000-0000-000000000331', '00000000-0000-0000-0000-000000000311',
   '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000201',
   'ITM-001', 'Mortero de pega para muro', 'm2', 100, 14700, 1470000, 0)
ON CONFLICT (id) DO NOTHING;

-- AIU configurable (no hardcodeado en el dominio): A/I/U/IVA de ejemplo.
INSERT INTO indirect_cost_rules (
  id, estimate_version_id, code, name, percentage, base_type, sort_order, visible_to_client
) VALUES
  ('00000000-0000-0000-0000-000000000341', '00000000-0000-0000-0000-000000000311', 'A',   'Administración', 0.035, 'direct_cost', 0, true),
  ('00000000-0000-0000-0000-000000000342', '00000000-0000-0000-0000-000000000311', 'I',   'Imprevistos',    0.025, 'direct_cost', 1, true),
  ('00000000-0000-0000-0000-000000000343', '00000000-0000-0000-0000-000000000311', 'U',   'Utilidad',       0.040, 'direct_cost', 2, true),
  ('00000000-0000-0000-0000-000000000344', '00000000-0000-0000-0000-000000000311', 'IVA', 'IVA sobre utilidad', 0.190, 'utility', 3, true)
ON CONFLICT (id) DO NOTHING;

-- Grupo y línea de cantidades demo -----------------------------------------
INSERT INTO quantity_groups (id, project_scope_id, code, name, unit, calculation_mode) VALUES
  ('00000000-0000-0000-0000-000000000351', '00000000-0000-0000-0000-0000000000d1',
   'QG-001', 'Muros primer piso', 'm2', 'area')
ON CONFLICT (id) DO NOTHING;

-- area: calculated_quantity = length * width * multiplier = 10 * 2.5 * 4 = 100
INSERT INTO quantity_lines (
  id, quantity_group_id, description, length, width, multiplier,
  formula_type, calculated_quantity, sort_order
) VALUES
  ('00000000-0000-0000-0000-000000000361', '00000000-0000-0000-0000-000000000351',
   'Muros perimetrales', 10, 2.5, 4, 'area', 100, 0)
ON CONFLICT (id) DO NOTHING;
