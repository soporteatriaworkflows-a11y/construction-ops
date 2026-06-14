-- Migration: SCHEDULE_FROM_BOQ_V1 — RPC atómica create_schedule_from_boq.
-- Agent: agent-orchestrator
-- Contrato congelado: docs/SCHEDULE_FROM_BOQ_V1_CONTRACT.md §3/§6.
--
-- Crea un cronograma (planning_schedules) y sus tareas (schedule_tasks) en UNA
-- transacción. SECURITY INVOKER ⇒ RLS aplica (FORCE) al INSERT igual que en la
-- app. org/actor SIEMPRE server-side (app.current_org()/auth.uid()); el rol se
-- valida con app.current_role() (paridad con create_manual_apu/add_apu_to_boq:
-- admin/gerencia/presupuestos). NO toca BOQ/APU/quantities/precios (solo lee la
-- existencia del proyecto/versión). Resuelve tempId→UUID de las tareas (jerarquía
-- capítulo→actividad) y prefija wbs_code con un token derivado del schedule para
-- garantizar la UNIQUE (project_id, wbs_code) entre cronogramas del mismo proyecto.
--
-- UP

CREATE OR REPLACE FUNCTION public.create_schedule_from_boq(
  p_project_id          uuid,
  p_estimate_version_id uuid,
  p_name                text,
  p_start_date          date,
  p_end_date            date,
  p_status              text,
  p_tasks               jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app
AS $$
DECLARE
  v_org         uuid := app.current_org();
  v_actor       uuid := auth.uid();
  v_schedule_id uuid;
  v_prefix      text;
  v_task        jsonb;
  v_map         jsonb := '{}'::jsonb;
  v_temp        text;
  v_parent_temp text;
  v_parent      uuid;
  v_new_id      uuid;
  v_idx         int := 0;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no_membership' USING errcode = '42501';
  END IF;
  IF app.current_role() NOT IN ('admin', 'gerencia', 'presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_name' USING errcode = '22000';
  END IF;
  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'invalid_start_date' USING errcode = '22000';
  END IF;
  -- Solo se CREA en estados no archivados.
  IF p_status IS NULL OR p_status NOT IN ('draft', 'baseline', 'active') THEN
    RAISE EXCEPTION 'invalid_status' USING errcode = '22000';
  END IF;
  IF p_tasks IS NULL OR jsonb_typeof(p_tasks) <> 'array' THEN
    RAISE EXCEPTION 'invalid_tasks' USING errcode = '22000';
  END IF;

  -- Proyecto de la organización.
  IF NOT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id AND p.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'project_not_found' USING errcode = '42501';
  END IF;

  -- La versión de presupuesto debe pertenecer al MISMO proyecto y organización.
  IF NOT EXISTS (
    SELECT 1
    FROM estimate_versions ev
    JOIN estimates e        ON e.id = ev.estimate_id
    JOIN project_scopes ps  ON ps.id = e.project_scope_id
    JOIN projects p         ON p.id = ps.project_id
    WHERE ev.id = p_estimate_version_id
      AND p.id = p_project_id
      AND p.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'estimate_version_not_found' USING errcode = '42501';
  END IF;

  INSERT INTO planning_schedules (
    organization_id, project_id, estimate_version_id,
    name, status, start_date, end_date, created_by
  ) VALUES (
    v_org, p_project_id, p_estimate_version_id,
    trim(p_name), p_status, p_start_date, p_end_date, v_actor
  )
  RETURNING id INTO v_schedule_id;

  -- Token corto del cronograma para unicidad de wbs_code dentro del proyecto.
  v_prefix := substr(replace(v_schedule_id::text, '-', ''), 1, 6) || '.';

  FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks)
  LOOP
    v_temp := v_task->>'tempId';
    v_parent_temp := v_task->>'parentTempId';
    v_parent := NULL;
    IF v_parent_temp IS NOT NULL AND v_map ? v_parent_temp THEN
      v_parent := (v_map->>v_parent_temp)::uuid;
    END IF;
    v_new_id := gen_random_uuid();

    INSERT INTO schedule_tasks (
      id, organization_id, project_id, schedule_id, parent_task_id,
      chapter_id, boq_item_id, apu_template_id,
      task_type, wbs_code, name, unit_snapshot, quantity_snapshot,
      planned_start, planned_end, planned_duration_days, progress_pct,
      status, is_milestone, productivity_source, crew_size, responsible, notes,
      sort_order
    ) VALUES (
      v_new_id, v_org, p_project_id, v_schedule_id, v_parent,
      NULLIF(v_task->>'chapterId', '')::uuid,
      NULLIF(v_task->>'boqItemId', '')::uuid,
      NULLIF(v_task->>'apuTemplateId', '')::uuid,
      v_task->>'taskType',
      v_prefix || (v_task->>'wbsCode'),
      v_task->>'name',
      NULLIF(v_task->>'unitSnapshot', ''),
      NULLIF(v_task->>'quantitySnapshot', '')::numeric,
      (v_task->>'plannedStart')::date,
      (v_task->>'plannedEnd')::date,
      (v_task->>'durationDays')::numeric,
      COALESCE(NULLIF(v_task->>'progressPct', '')::numeric, 0),
      'not_started',
      COALESCE((v_task->>'isMilestone')::boolean, false),
      NULLIF(v_task->>'productivitySource', ''),
      NULLIF(v_task->>'crewSize', '')::numeric,
      NULLIF(v_task->>'responsible', ''),
      NULLIF(v_task->>'notes', ''),
      COALESCE((v_task->>'sortOrder')::int, v_idx)
    );

    v_map := v_map || jsonb_build_object(v_temp, v_new_id::text);
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_schedule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_schedule_from_boq(uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_schedule_from_boq(uuid, uuid, text, date, date, text, jsonb) TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.create_schedule_from_boq(uuid, uuid, text, date, date, text, jsonb);
