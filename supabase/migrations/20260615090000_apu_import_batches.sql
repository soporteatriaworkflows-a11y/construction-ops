-- Migration: ENTRE_PATIOS_APU_IMPORT_V1 — batches de importación APU,
--            provenance aditiva en apu_templates/apu_components y RPC atómica.
-- Agent: agent-db-rls (autorado por el orquestador, FASE 4B.2).
-- Contrato: docs/ENTRE_PATIOS_APU_IMPORT_V1_CONTRACT.md §6–§7.
--
-- TODO ADITIVO: tabla nueva + columnas NULL + función + triggers controlados.
-- Sin DROP, sin DELETE, sin backfill, sin cambio de tipos. Solo local en esta
-- oleada (sin db push remoto).
--
-- UP

-- ===========================================================================
-- 1) apu_import_batches — procedencia durable e idempotencia por digest.
-- ===========================================================================

CREATE TABLE apu_import_batches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  digest_sha256        text NOT NULL,
  source_filename      text NOT NULL,
  source_sheet         text NOT NULL,
  imported_by          uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  imported_at          timestamptz NOT NULL DEFAULT now(),
  status               text NOT NULL DEFAULT 'completed',
  total_activities     integer NOT NULL DEFAULT 0,
  total_components     integer NOT NULL DEFAULT 0,
  imported_activities  integer NOT NULL DEFAULT 0,
  imported_components  integer NOT NULL DEFAULT 0,
  linked_boq_items     integer NOT NULL DEFAULT 0,
  skipped_existing     integer NOT NULL DEFAULT 0,
  unresolved_count     integer NOT NULL DEFAULT 0,
  warning_count        integer NOT NULL DEFAULT 0,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT apu_import_batches_status_valid CHECK (status IN ('completed')),
  CONSTRAINT apu_import_batches_digest_format CHECK (digest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT apu_import_batches_counts_nonneg CHECK (
    total_activities >= 0 AND total_components >= 0
    AND imported_activities >= 0 AND imported_components >= 0
    AND linked_boq_items >= 0 AND skipped_existing >= 0
    AND unresolved_count >= 0 AND warning_count >= 0
  )
);

-- Idempotencia estructural: un mismo workbook (digest) solo se importa una vez
-- por organización (patrón price_monitor_runs / price_observation_batches).
CREATE UNIQUE INDEX apu_import_batches_org_digest_uq
  ON apu_import_batches (organization_id, digest_sha256);
CREATE INDEX apu_import_batches_org_imported_at_idx
  ON apu_import_batches (organization_id, imported_at DESC);

-- ===========================================================================
-- 2) Provenance aditiva (NULL en todas las filas existentes — retrocompatible).
-- ===========================================================================

ALTER TABLE apu_templates
  ADD COLUMN import_batch_id uuid REFERENCES apu_import_batches (id) ON DELETE SET NULL,
  ADD COLUMN source_sheet text,
  ADD COLUMN source_row integer,
  ADD COLUMN source_occurrence_index integer;

CREATE INDEX apu_templates_import_batch_id_idx
  ON apu_templates (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

ALTER TABLE apu_components
  ADD COLUMN source_row integer,
  ADD COLUMN source_occurrence_index integer,
  ADD COLUMN raw_code text,
  ADD COLUMN raw_unit text;

-- ===========================================================================
-- 3) Invariante same-org: el batch referenciado por un template debe ser de la
--    MISMA organización (las validaciones FK ignoran RLS). Trigger controlado,
--    sin SECURITY DEFINER, schema-qualified, search_path fijo (patrón
--    apu_component_labor_role_same_org).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.apu_template_import_batch_same_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_batch_org uuid;
BEGIN
  IF NEW.import_batch_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT organization_id INTO v_batch_org
    FROM apu_import_batches WHERE id = NEW.import_batch_id;
  IF v_batch_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'import_batch_id % no pertenece a la organización del apu_template',
      NEW.import_batch_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER apu_templates_import_batch_same_org
  BEFORE INSERT OR UPDATE ON public.apu_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.apu_template_import_batch_same_org();

-- ===========================================================================
-- 4) RPC atómica import_apu_batch — patrón import_boq_into_version.
--    * SECURITY INVOKER: corre como `authenticated`; la RLS WITH CHECK de
--      apu_import_batches / apu_templates / apu_components / boq_items aplica
--      a CADA escritura. Sin service-role.
--    * Idempotencia: digest ya importado por la org ⇒ {duplicate:true} sin
--      escribir nada (carrera 23505 ⇒ mismo tratamiento por unique_violation).
--    * Templates existentes (org, code, version=1) ⇒ skipped (JAMÁS update).
--    * total_component_cost RECALCULADO en SQL: round(qty×(1+waste)×price,10)
--      — nunca el valor del cliente.
--    * Linking BOQ opcional: SOLO ítems de la versión objetivo EDITABLE con
--      apu_template_id IS NULL y no archivados (jamás reemplaza; la RLS de
--      boq_items además deniega UPDATE en versiones bloqueadas).
--      No toca cantidades/precios/subtotales/AIU.
--    * Orden interno: templates → links → batch (los batches son INMUTABLES
--      por RLS — sin UPDATE — así que el batch se inserta AL FINAL con los
--      conteos definitivos y luego se estampa import_batch_id en los
--      templates creados, cuyo UPDATE org-scoped sí está permitido).
--    * El status de la versión se lee SIN `FOR UPDATE`: la policy de UPDATE
--      filtra filas inmutables y produciría falso not-found (lección 4E.3A).
--      La carrera residual la cierra la propia RLS de boq_items (0 filas).
--    * Atómica: cualquier error revierte toda la transacción.
-- ===========================================================================

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
  v_created_ids   uuid[] := '{}';
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

-- DOWN
-- DROP FUNCTION IF EXISTS public.import_apu_batch(jsonb, jsonb, uuid, jsonb);
-- DROP TRIGGER IF EXISTS apu_templates_import_batch_same_org ON public.apu_templates;
-- DROP FUNCTION IF EXISTS public.apu_template_import_batch_same_org();
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS raw_unit;
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS raw_code;
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS source_occurrence_index;
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS source_row;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS source_occurrence_index;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS source_row;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS source_sheet;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS import_batch_id;
-- DROP TABLE IF EXISTS apu_import_batches;
