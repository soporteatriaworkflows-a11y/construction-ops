-- Seed: cronograma demo de planificación (DESARROLLO/TESTING)
-- Agent: agent-db-rls
--
-- Cronograma sanitizado del primer piso (Oleada 3B). Fechas/duraciones/avances
-- ficticios y coherentes; NO provienen del Excel real. WBS jerárquico con un
-- hito, dependencias FS/SS, avance físico (append-only) y asignación de
-- recursos. Vinculado al proyecto/alcance/capítulo/recursos/roles del catálogo
-- demo (seeds 0001 y 0002).
--
-- UUIDs fijos para reproducibilidad de tests (familia 0d... como el fixture).
-- Idempotente: ON CONFLICT (id) DO NOTHING en todas las inserciones.
--
-- NOTA RLS: este seed se ejecuta como owner/migrador (BYPASSRLS). Inserta
-- directamente sin pasar por app.current_org(). Las entradas de avance son
-- append-only por política RLS en runtime; aquí se siembran como histórico.
--
-- Referencias del catálogo demo (seeds 0001/0002):
--   organización  : 00000000-0000-0000-0000-0000000000a1
--   proyecto      : 00000000-0000-0000-0000-0000000000c1 (Entre Patios)
--   alcance P1    : 00000000-0000-0000-0000-0000000000d1 (Primer Piso)
--   capítulo C01  : 00000000-0000-0000-0000-000000000321 (Mampostería)
--   recurso mat.  : 00000000-0000-0000-0000-0000000000e1 (Cemento gris 50kg)
--   recurso labor : 00000000-0000-0000-0000-0000000000e2 (Oficial de obra)
--   rol de obra   : 00000000-0000-0000-0000-0000000000f1 (Oficial)
--   perfil autor  : 00000000-0000-0000-0000-0000000000b1 (Admin Demo)

-- ===========================================================================
-- schedule_tasks — WBS jerárquico (3 raíces + 2 subtareas + 1 hito).
-- ===========================================================================
INSERT INTO schedule_tasks (
  id, organization_id, project_id, project_scope_id, chapter_id, parent_task_id,
  wbs_code, name, description, planned_start, planned_end, planned_duration_days,
  progress_pct, status, is_milestone, sort_order, external_reference
) VALUES
  -- 1. Preliminares (completada)
  ('0d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
   NULL, NULL,
   '1', 'Preliminares de obra', 'Cerramiento, campamento y replanteo',
   '2026-06-01', '2026-06-10', 10.0000, 100.0000, 'completed', false, 0, 'MSP-WBS-1'),
  -- 2. Mampostería (en progreso) — padre
  ('0d000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-000000000321', NULL,
   '2', 'Mampostería primer piso', 'Muros en bloque',
   '2026-06-11', '2026-06-30', 20.0000, 45.0000, 'in_progress', false, 1, 'MSP-WBS-2'),
  -- 2.1 Muros perimetrales (subtarea)
  ('0d000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-000000000321', '0d000000-0000-0000-0000-000000000002',
   '2.1', 'Muros perimetrales', 'Bloque de 15 cm en perímetro',
   '2026-06-11', '2026-06-22', 12.0000, 60.0000, 'in_progress', false, 2, NULL),
  -- 2.2 Muros divisorios (subtarea)
  ('0d000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-000000000321', '0d000000-0000-0000-0000-000000000002',
   '2.2', 'Muros divisorios', 'Bloque de 10 cm interiores',
   '2026-06-19', '2026-06-30', 10.0000, 25.0000, 'in_progress', false, 3, NULL),
  -- 3. Pisos y enchapes (no iniciada)
  ('0d000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
   NULL, NULL,
   '3', 'Pisos y enchapes', 'Instalación de porcelanato',
   '2026-07-01', '2026-07-20', 20.0000, 0.0000, 'not_started', false, 4, 'MSP-WBS-3'),
  -- M1. Hito de entrega (duración 0, start = end)
  ('0d000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
   NULL, NULL,
   'M1', 'Entrega primer piso', 'Hito de entrega del primer piso',
   '2026-07-20', '2026-07-20', 0.0000, 0.0000, 'not_started', true, 5, 'MSP-MILESTONE-1')
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- task_dependencies — FS/SS con lag (pred <> succ, tipos válidos).
-- ===========================================================================
INSERT INTO task_dependencies (
  id, organization_id, project_id, predecessor_task_id, successor_task_id,
  dependency_type, lag_days
) VALUES
  ('0d000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1',
   '0d000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000002', 'FS', 0.0000),
  ('0d000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1',
   '0d000000-0000-0000-0000-000000000003', '0d000000-0000-0000-0000-000000000004', 'SS', 8.0000),
  ('0d000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1',
   '0d000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000005', 'FS', 1.0000),
  ('0d000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1',
   '0d000000-0000-0000-0000-000000000005', '0d000000-0000-0000-0000-000000000006', 'FS', 0.0000)
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- progress_entries — histórico de avance físico (APPEND-ONLY).
-- financial_progress_pct / notes / created_by son internos (🔒).
-- ===========================================================================
INSERT INTO progress_entries (
  id, organization_id, project_id, task_id, recorded_at,
  physical_progress_pct, financial_progress_pct, notes, created_by
) VALUES
  ('0d000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '0d000000-0000-0000-0000-000000000001',
   '2026-06-10T17:00:00-05:00', 100.0000, 100.0000, 'Preliminares finalizados',
   '00000000-0000-0000-0000-0000000000b1'),
  ('0d000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '0d000000-0000-0000-0000-000000000002',
   '2026-06-20T17:00:00-05:00', 30.0000, 28.0000, 'Avance parcial de muros',
   '00000000-0000-0000-0000-0000000000b1'),
  ('0d000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '0d000000-0000-0000-0000-000000000002',
   '2026-06-25T17:00:00-05:00', 45.0000, 42.0000, NULL,
   '00000000-0000-0000-0000-0000000000b1')
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- resource_assignments — recursos/mano de obra por tarea.
-- ===========================================================================
INSERT INTO resource_assignments (
  id, organization_id, project_id, task_id, resource_id, labor_role_id,
  quantity, unit, notes
) VALUES
  ('0d000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '0d000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1',
   3.0000000000, 'cuadrilla', 'Cuadrilla de mampostería'),
  ('0d000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000c1', '0d000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-0000000000e1', NULL,
   2.0000000000, 'cuadrilla', 'Ayudantes para enchape')
ON CONFLICT (id) DO NOTHING;
