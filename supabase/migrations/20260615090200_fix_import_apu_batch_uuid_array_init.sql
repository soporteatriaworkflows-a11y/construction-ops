-- Migration: Fix import_apu_batch — inicialización explícita uuid[] sin cast implícito.
-- Lint warning: "cast text value to uuid[] type" en v_created_ids := '{}' (línea ~24 del bloque).
-- Fix: ARRAY[]::uuid[] elimina el implicit text→uuid[] que reporta db lint.
-- Aditivo: reemplaza únicamente la firma idéntica de la función existente.
-- Sin cambio de comportamiento en runtime.

CREATE OR REPLACE FUNCTION public.import_apu_batch(
  p_batch      jsonb,
  p_templates  jsonb,
  p_version_id uuid DEFAULT NULL,
  p_links      jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := app._auth_uid();
  v_org           uuid := app.current_org();
  v_existing      record;
  v_batch_id      uuid;
  v_template      jsonb;
  v_component     jsonb;
  v_link          jsonb;
  v_template_id   uuid;
  v_code          text;
  v_qty           numeric(20,10);
  v_waste         numeric(20,10);
  v_price         numeric(20,10);
  v_total         numeric(20,10);
  v_sort          integer;
  v_imported_act  integer := 0;
  v_imported_comp integer := 0;
  v_skipped       integer := 0;
  v_linked        integer := 0;
  v_link_updated  integer;
  v_version_status text;
  v_code_to_id    jsonb := '{}'::jsonb;
  v_created_ids   uuid[] := ARRAY[]::uuid[];
  v_skipped_codes jsonb := '[]'::jsonb;
  v_linked_items  jsonb := '[]'::jsonb;
BEGIN
  -- Deny-by-default: sesión + membresía obligatorias.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_session' USING errcode = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no_membership' USING errcode = '42501';
  END IF;
  IF p_batch->>'digestSha256' IS NULL THEN
    RAISE EXCEPTION 'digest_required' USING errcode = 'P0001';
  END IF;

  -- Idempotencia por (org, digest): batch previo ⇒ no-op informativo.
  SELECT b.id, b.imported_activities, b.imported_components,
         b.linked_boq_items, b.skipped_existing
    INTO v_existing
  FROM public.apu_import_batches b
  WHERE b.organization_id = v_org
    AND b.digest_sha256 = (p_batch->>'digestSha256')
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'batchId', v_existing.id,
      'importedActivities', v_existing.imported_activities,
      'importedComponents', v_existing.imported_components,
      'linkedBoqItems', v_existing.linked_boq_items,
      'skippedExisting', v_existing.skipped_existing
    );
  END IF;

  -- Versión objetivo de linking (opcional): visible (RLS) y EDITABLE.
  IF p_version_id IS NOT NULL THEN
    SELECT ev.status INTO v_version_status
    FROM public.estimate_versions ev
    WHERE ev.id = p_version_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'version_not_found' USING errcode = 'P0002';
    END IF;
    IF v_version_status IN ('approved', 'issued', 'archived') THEN
      RAISE EXCEPTION 'version_locked' USING errcode = 'P0001';
    END IF;
  END IF;

  -- Templates + componentes. Existente (org, code, version=1) ⇒ skip.
  FOR v_template IN SELECT value FROM jsonb_array_elements(p_templates) AS t(value) LOOP
    v_code := v_template->>'code';
    IF v_code IS NULL OR btrim(v_code) = '' THEN
      RAISE EXCEPTION 'template_code_required' USING errcode = 'P0001';
    END IF;

    SELECT a.id INTO v_template_id
    FROM public.apu_templates a
    WHERE a.organization_id = v_org AND a.code = v_code AND a.version = 1;

    IF FOUND THEN
      v_skipped := v_skipped + 1;
      v_skipped_codes := v_skipped_codes || to_jsonb(v_code);
      v_code_to_id := v_code_to_id || jsonb_build_object(v_code, v_template_id::text);
      CONTINUE;
    END IF;

    INSERT INTO public.apu_templates (
      organization_id, code, name, unit, description, active, version,
      default_tool_pct, source_sheet, source_row, source_occurrence_index
    )
    VALUES (
      v_org,
      v_code,
      v_template->>'name',
      v_template->>'unit',
      NULLIF(v_template->>'description', ''),
      true,
      1,
      COALESCE((v_template->>'defaultToolPct')::numeric, 0),
      COALESCE(p_batch->>'sourceSheet', 'APU'),
      NULLIF(v_template->>'sourceRow', '')::integer,
      NULLIF(v_template->>'sourceOccurrenceIndex', '')::integer
    )
    RETURNING id INTO v_template_id;

    v_imported_act := v_imported_act + 1;
    v_created_ids := v_created_ids || v_template_id;
    v_code_to_id := v_code_to_id || jsonb_build_object(v_code, v_template_id::text);

    v_sort := 0;
    FOR v_component IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_template->'components', '[]'::jsonb)) AS c(value)
    LOOP
      v_qty   := (v_component->>'quantity')::numeric;
      v_waste := COALESCE((v_component->>'wastePct')::numeric, 0);
      v_price := (v_component->>'unitPriceSnapshot')::numeric;
      IF v_qty < 0 OR v_waste < 0 OR v_price < 0 THEN
        RAISE EXCEPTION 'negative_component_value' USING errcode = 'P0001';
      END IF;
      -- Fuente única server-side: nunca el subtotal del cliente.
      v_total := round(v_qty * (1 + v_waste) * v_price, 10);

      INSERT INTO public.apu_components (
        apu_template_id, resource_id, labor_role_id, component_type,
        quantity, waste_pct, unit_price_source, unit_price_snapshot,
        total_component_cost, sort_order, notes,
        source_row, source_occurrence_index, raw_code, raw_unit
      )
      VALUES (
        v_template_id,
        NULLIF(v_component->>'resourceId', '')::uuid,
        NULLIF(v_component->>'laborRoleId', '')::uuid,
        v_component->>'componentType',
        v_qty,
        v_waste,
        v_component->>'unitPriceSource',
        v_price,
        v_total,
        COALESCE(NULLIF(v_component->>'sortOrder', '')::integer, v_sort),
        NULLIF(v_component->>'notes', ''),
        NULLIF(v_component->>'sourceRow', '')::integer,
        NULLIF(v_component->>'sourceOccurrenceIndex', '')::integer,
        NULLIF(v_component->>'rawCode', ''),
        NULLIF(v_component->>'rawUnit', '')
      );
      v_sort := v_sort + 1;
      v_imported_comp := v_imported_comp + 1;
    END LOOP;
  END LOOP;

  -- Linking BOQ opcional: solo exactos no ambiguos decididos server-side por
  -- el servicio; aquí se re-guarda: ítem de la versión objetivo, sin template
  -- previo (IS NULL ⇒ jamás reemplaza), no archivado, versión editable (RLS).
  IF p_version_id IS NOT NULL THEN
    FOR v_link IN SELECT value FROM jsonb_array_elements(p_links) AS l(value) LOOP
      v_template_id := NULLIF(v_code_to_id ->> (v_link->>'templateCode'), '')::uuid;
      IF v_template_id IS NULL THEN
        CONTINUE; -- template ni creado ni existente ⇒ no vinculable.
      END IF;
      UPDATE public.boq_items
        SET apu_template_id = v_template_id
      WHERE id = NULLIF(v_link->>'boqItemId', '')::uuid
        AND estimate_version_id = p_version_id
        AND apu_template_id IS NULL
        AND archived_at IS NULL;
      GET DIAGNOSTICS v_link_updated = ROW_COUNT;
      IF v_link_updated = 1 THEN
        v_linked := v_linked + 1;
        v_linked_items := v_linked_items || jsonb_build_object(
          'templateCode', v_link->>'templateCode',
          'boqItemId', v_link->>'boqItemId'
        );
      END IF;
    END LOOP;
  END IF;

  -- Batch AL FINAL con conteos definitivos (inmutable tras el COMMIT: la RLS
  -- no concede UPDATE/DELETE). Carrera de digest ⇒ unique_violation ⇒ aborta
  -- y revierte TODO (ni templates ni links quedan del perdedor).
  INSERT INTO public.apu_import_batches (
    organization_id, digest_sha256, source_filename, source_sheet,
    imported_by, status, total_activities, total_components,
    imported_activities, imported_components, linked_boq_items,
    skipped_existing, unresolved_count, warning_count, metadata
  )
  VALUES (
    v_org,
    p_batch->>'digestSha256',
    COALESCE(p_batch->>'sourceFilename', ''),
    COALESCE(p_batch->>'sourceSheet', 'APU'),
    v_uid,
    'completed',
    COALESCE((p_batch->>'totalActivities')::integer, 0),
    COALESCE((p_batch->>'totalComponents')::integer, 0),
    v_imported_act,
    v_imported_comp,
    v_linked,
    v_skipped,
    COALESCE((p_batch->>'unresolvedCount')::integer, 0),
    COALESCE((p_batch->>'warningCount')::integer, 0),
    COALESCE(p_batch->'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_batch_id;

  -- Estampar la procedencia en los templates creados (UPDATE org-scoped
  -- permitido por apu_templates_update; trigger same-org valida el batch).
  IF array_length(v_created_ids, 1) IS NOT NULL THEN
    UPDATE public.apu_templates
      SET import_batch_id = v_batch_id
    WHERE id = ANY (v_created_ids);
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'batchId', v_batch_id,
    'importedActivities', v_imported_act,
    'importedComponents', v_imported_comp,
    'linkedBoqItems', v_linked,
    'skippedExisting', v_skipped,
    'skippedCodes', v_skipped_codes,
    'templateIds', v_code_to_id,
    'linkedItems', v_linked_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_apu_batch(jsonb, jsonb, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_apu_batch(jsonb, jsonb, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_apu_batch(jsonb, jsonb, uuid, jsonb) TO authenticated;
