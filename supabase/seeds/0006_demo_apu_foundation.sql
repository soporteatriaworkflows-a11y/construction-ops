-- Seed: fundamento APU — rol Ayudante + APU cuadrilla demo (DESARROLLO/TESTING)
-- Agent: agent-db-rls (autorado por el orquestador, FASE 4B.1)
-- Contrato: docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md §13-14.
--
-- Sanitizado: factores salariales ficticios plausibles (NO provienen del Excel
-- real). UUIDs fijos. Idempotente (ON CONFLICT DO NOTHING). Se ejecuta como
-- migrador (sin RLS). SOLO LOCAL.
--
-- El APU-002 demuestra el modelo congelado:
--   cuadrilla 2 Ayudantes + 1 Oficial codificada como filas labor con
--   labor_role_id trazable, y herramienta menor derivada vía
--   default_tool_pct (0.05 = 5% del subtotal de M.O.).

-- Rol Ayudante demo ----------------------------------------------------------
-- Derivados reproducibles con calculateLaborCost:
--   mensual = 1160000×(1+0.40+0.205+0.09) + 162000 + 120000/4 = 2158200
--   día     = 2158200 / 24 = 89925       hora = 89925 / 8 = 11240.625
INSERT INTO labor_roles (
  id, organization_id, code, name, base_salary, transport_subsidy,
  benefits_pct, social_security_pct, payroll_tax_pct,
  uniform_cost, uniform_period_months, working_days_month, working_hours_day
) VALUES
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1',
   'LR-002', 'Ayudante', 1160000, 162000, 0.40, 0.205, 0.09, 120000, 4, 24, 8)
ON CONFLICT (id) DO NOTHING;

-- APU cuadrilla demo (herramienta menor derivada 5% sobre M.O.) ---------------
INSERT INTO apu_templates (
  id, organization_id, code, name, unit, version, default_tool_pct
) VALUES
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-0000000000a1',
   'APU-002', 'Muro en ladrillo demo', 'm2', 1, 0.05)
ON CONFLICT (id) DO NOTHING;

-- Componentes (regla canónica total = qty × (1+waste) × snapshot):
--   material:  0.3 × 1.05 × 28000   = 8820
--   labor AY (2 integrantes × 0.2 días): qty 0.4 × 89925   = 35970
--   labor OF (1 integrante  × 0.2 días): qty 0.2 × 99812.5 = 19962.5
--   subtotal M.O. = 55932.5 → herramienta derivada = 0.05 × 55932.5 = 2796.625
INSERT INTO apu_components (
  id, apu_template_id, resource_id, labor_role_id, component_type, quantity,
  waste_pct, unit_price_source, unit_price_snapshot, total_component_cost, sort_order
) VALUES
  ('00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000202',
   '00000000-0000-0000-0000-0000000000e1', NULL, 'material', 0.3, 0.05,
   'resource', 28000, 8820, 0),
  ('00000000-0000-0000-0000-000000000213', '00000000-0000-0000-0000-000000000202',
   NULL, '00000000-0000-0000-0000-0000000000f2', 'labor', 0.4, 0,
   'labor_role', 89925, 35970, 1),
  ('00000000-0000-0000-0000-000000000214', '00000000-0000-0000-0000-000000000202',
   NULL, '00000000-0000-0000-0000-0000000000f1', 'labor', 0.2, 0,
   'labor_role', 99812.5, 19962.5, 2)
ON CONFLICT (id) DO NOTHING;
