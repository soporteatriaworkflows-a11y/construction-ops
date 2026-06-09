-- Migration: emisión + clonación de versiones de presupuesto (Oleada 4E.3A).
-- Agent: agent-db-rls (autorado por el orquestador, aprobado por la usuaria).
-- Contrato: docs/ESTIMATE_ISSUE_CLONE_CONTRACT.md.
--
-- Aditiva: `estimate_versions` += `issued_at`, `issued_by` (FK profiles) y
-- `source_version_id` (FK self) para trazar el origen de una versión clonada.
-- RPC `clone_issued_estimate_version` (SECURITY INVOKER, atómica) clona una
-- versión ISSUED a una nueva DRAFT (capítulos + ítems con remapeo de chapter_id +
-- metadata de origen + estado archivado + reglas AIU), incrementando el número de
-- versión de forma segura. La EMISIÓN (draft→issued) es un UPDATE normal cubierto
-- por la RLS existente (no requiere RPC). Sin DROP/DELETE; RLS sin cambios.
--
-- UP

ALTER TABLE public.estimate_versions
  ADD COLUMN issued_at timestamptz,
  ADD COLUMN issued_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN source_version_id uuid REFERENCES public.estimate_versions (id) ON DELETE SET NULL;

CREATE INDEX estimate_versions_source_idx
  ON public.estimate_versions (source_version_id)
  WHERE source_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clone_issued_estimate_version(p_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := app._auth_uid();
  v_org       uuid := app.current_org();
  v_estimate  uuid;
  v_status    text;
  v_new_id    uuid;
  v_new_num   integer;
  v_map       jsonb := '{}'::jsonb;
  rec         record;
  v_new_ch    uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;

  -- RLS oculta versiones cross-org ⇒ NOT FOUND. Lock para serializar.
  SELECT estimate_id, status INTO v_estimate, v_status
  FROM public.estimate_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_not_found' USING errcode = 'P0002'; END IF;
  IF v_status <> 'issued' THEN RAISE EXCEPTION 'version_not_issued' USING errcode = 'P0001'; END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_new_num
  FROM public.estimate_versions WHERE estimate_id = v_estimate;

  INSERT INTO public.estimate_versions
    (estimate_id, version_number, status, created_by, source_version_id)
  VALUES (v_estimate, v_new_num, 'draft', v_uid, p_version_id)
  RETURNING id INTO v_new_id;

  -- Capítulos: clonar conservando origen + estado archivado; mapa old→new.
  FOR rec IN SELECT * FROM public.chapters WHERE estimate_version_id = p_version_id LOOP
    INSERT INTO public.chapters
      (estimate_version_id, code, name, sort_order, source_code, source_row, archived_at, archived_by)
    VALUES (v_new_id, rec.code, rec.name, rec.sort_order, rec.source_code, rec.source_row, rec.archived_at, rec.archived_by)
    RETURNING id INTO v_new_ch;
    v_map := v_map || jsonb_build_object(rec.id::text, v_new_ch::text);
  END LOOP;

  -- Ítems: remapeo de chapter_id; subtotal se re-fuerza por trigger (idéntico);
  -- origen y estado archivado preservados.
  INSERT INTO public.boq_items
    (estimate_version_id, chapter_id, code, description_snapshot, unit_snapshot,
     quantity_snapshot, unit_price_snapshot, subtotal, sort_order, source_code, source_row,
     notes, archived_at, archived_by)
  SELECT v_new_id, (v_map ->> (bi.chapter_id::text))::uuid, bi.code, bi.description_snapshot,
         bi.unit_snapshot, bi.quantity_snapshot, bi.unit_price_snapshot, bi.subtotal, bi.sort_order,
         bi.source_code, bi.source_row, bi.notes, bi.archived_at, bi.archived_by
  FROM public.boq_items bi WHERE bi.estimate_version_id = p_version_id;

  -- Reglas AIU clonadas (mismos porcentajes ⇒ mismo total).
  INSERT INTO public.indirect_cost_rules
    (estimate_version_id, code, name, percentage, base_type, sort_order, visible_to_client)
  SELECT v_new_id, code, name, percentage, base_type, sort_order, visible_to_client
  FROM public.indirect_cost_rules WHERE estimate_version_id = p_version_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_issued_estimate_version(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_issued_estimate_version(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clone_issued_estimate_version(uuid) TO authenticated;

-- DOWN (rollback local)
-- DROP FUNCTION IF EXISTS public.clone_issued_estimate_version(uuid);
-- DROP INDEX IF EXISTS public.estimate_versions_source_idx;
-- ALTER TABLE public.estimate_versions DROP COLUMN IF EXISTS source_version_id;
-- ALTER TABLE public.estimate_versions DROP COLUMN IF EXISTS issued_by;
-- ALTER TABLE public.estimate_versions DROP COLUMN IF EXISTS issued_at;
