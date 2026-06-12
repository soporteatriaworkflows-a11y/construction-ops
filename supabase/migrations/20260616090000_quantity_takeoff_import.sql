-- Migration: QUANTITY_TAKEOFF_IMPORT_V1 — batches de importación de memorias
--            de cantidades, grupos y líneas de despiece con provenance, y RPC
--            atómica de confirmación.
-- Agent: agent-db-rls (autorado por el orquestador, FASE 4B.3).
-- Contrato: docs/QUANTITY_TAKEOFF_IMPORT_V1_CONTRACT.md §7.
--
-- TODO ADITIVO: 3 tablas nuevas + función + triggers controlados. Sin DROP,
-- sin DELETE, sin backfill, sin cambio de tipos, sin tocar quantity_groups/
-- quantity_lines legacy ni boq_items. Solo local en esta oleada (sin db push
-- remoto).
--
-- UP

-- ===========================================================================
-- 1) quantity_import_batches — procedencia durable e idempotencia por digest.
-- ===========================================================================

CREATE TABLE quantity_import_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  digest_sha256     text NOT NULL,
  source_filename   text NOT NULL,
  source_sheet      text NOT NULL,
  imported_by       uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'completed',
  total_groups      integer NOT NULL DEFAULT 0,
  total_lines       integer NOT NULL DEFAULT 0,
  linked_boq_items  integer NOT NULL DEFAULT 0,
  unresolved_count  integer NOT NULL DEFAULT 0,
  warning_count     integer NOT NULL DEFAULT 0,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT quantity_import_batches_status_valid CHECK (status IN ('completed')),
  CONSTRAINT quantity_import_batches_digest_format CHECK (digest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT quantity_import_batches_counts_nonneg CHECK (
    total_groups >= 0 AND total_lines >= 0 AND linked_boq_items >= 0
    AND unresolved_count >= 0 AND warning_count >= 0
  )
);

-- Idempotencia estructural: un mismo workbook (digest) solo se importa una vez
-- por organización (patrón apu_import_batches / price_observation_batches).
CREATE UNIQUE INDEX quantity_import_batches_org_digest_uq
  ON quantity_import_batches (organization_id, digest_sha256);
CREATE INDEX quantity_import_batches_org_imported_at_idx
  ON quantity_import_batches (organization_id, imported_at DESC);

-- ===========================================================================
-- 2) quantity_takeoff_groups — memoria de cantidades por actividad.
--    El vínculo BOQ vive AQUÍ (boq_item_id); boq_items NO se modifica.
-- ===========================================================================

CREATE TABLE quantity_takeoff_groups (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  estimate_version_id  uuid REFERENCES estimate_versions (id) ON DELETE SET NULL,
  boq_item_id          uuid REFERENCES boq_items (id) ON DELETE SET NULL,
  import_batch_id      uuid REFERENCES quantity_import_batches (id) ON DELETE SET NULL,
  visible_code         text,
  item_code            text,
  description          text NOT NULL,
  unit                 text,
  source_row           integer NOT NULL,
  occurrence_index     integer NOT NULL DEFAULT 1,
  total_calculated     numeric(20,10) NOT NULL DEFAULT 0,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quantity_takeoff_groups_source_row_pos CHECK (source_row >= 1),
  CONSTRAINT quantity_takeoff_groups_occurrence_pos CHECK (occurrence_index >= 1)
);

CREATE INDEX quantity_takeoff_groups_org_idx
  ON quantity_takeoff_groups (organization_id);
CREATE INDEX quantity_takeoff_groups_batch_idx
  ON quantity_takeoff_groups (import_batch_id)
  WHERE import_batch_id IS NOT NULL;
CREATE INDEX quantity_takeoff_groups_version_idx
  ON quantity_takeoff_groups (estimate_version_id)
  WHERE estimate_version_id IS NOT NULL;
-- Un ítem BOQ admite a lo sumo UN takeoff group vinculado (no reemplazo
-- silencioso; la RPC re-verifica bajo transacción).
CREATE UNIQUE INDEX quantity_takeoff_groups_boq_item_uq
  ON quantity_takeoff_groups (boq_item_id)
  WHERE boq_item_id IS NOT NULL;

-- ===========================================================================
-- 3) quantity_takeoff_lines — líneas de medición (memoria inmutable).
-- ===========================================================================

CREATE TABLE quantity_takeoff_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  group_id             uuid NOT NULL REFERENCES quantity_takeoff_groups (id) ON DELETE CASCADE,
  description          text,
  formula_type         text NOT NULL,
  length               numeric(20,10),
  width                numeric(20,10),
  height               numeric(20,10),
  count                numeric(20,10),
  raw_values           jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_row           integer NOT NULL,
  subtotal_calculated  numeric(20,10) NOT NULL DEFAULT 0,
  sort_order           integer NOT NULL DEFAULT 0,
  CONSTRAINT quantity_takeoff_lines_formula_type_valid CHECK (
    formula_type IN (
      'direct', 'count_only', 'length_only', 'width_only', 'height_only',
      'length_count', 'width_count', 'height_count',
      'length_width', 'length_height', 'width_height',
      'length_width_count', 'length_height_count', 'width_height_count',
      'length_width_height', 'length_width_height_count',
      'dims_sum_count', 'custom'
    )
  ),
  CONSTRAINT quantity_takeoff_lines_source_row_pos CHECK (source_row >= 1)
);

CREATE INDEX quantity_takeoff_lines_group_sort_idx
  ON quantity_takeoff_lines (group_id, sort_order);
CREATE INDEX quantity_takeoff_lines_org_idx
  ON quantity_takeoff_lines (organization_id);

-- ===========================================================================
-- 4) Invariantes same-org (las validaciones FK ignoran RLS). Triggers
--    controlados, sin SECURITY DEFINER, schema-qualified, search_path fijo
--    (patrón apu_template_import_batch_same_org).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.quantity_takeoff_group_same_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF NEW.import_batch_id IS NOT NULL THEN
    SELECT organization_id INTO v_org
      FROM quantity_import_batches WHERE id = NEW.import_batch_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION
        'import_batch_id % no pertenece a la organización del grupo',
        NEW.import_batch_id USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.estimate_version_id IS NOT NULL THEN
    SELECT p.organization_id INTO v_org
      FROM estimate_versions ev
      JOIN estimates e ON e.id = ev.estimate_id
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
     WHERE ev.id = NEW.estimate_version_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION
        'estimate_version_id % no pertenece a la organización del grupo',
        NEW.estimate_version_id USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.boq_item_id IS NOT NULL THEN
    SELECT p.organization_id INTO v_org
      FROM boq_items bi
      JOIN estimate_versions ev ON ev.id = bi.estimate_version_id
      JOIN estimates e ON e.id = ev.estimate_id
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
     WHERE bi.id = NEW.boq_item_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION
        'boq_item_id % no pertenece a la organización del grupo',
        NEW.boq_item_id USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER quantity_takeoff_groups_same_org
  BEFORE INSERT OR UPDATE ON public.quantity_takeoff_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.quantity_takeoff_group_same_org();

CREATE OR REPLACE FUNCTION public.quantity_takeoff_line_same_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM quantity_takeoff_groups WHERE id = NEW.group_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'group_id % no pertenece a la organización de la línea',
      NEW.group_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quantity_takeoff_lines_same_org
  BEFORE INSERT OR UPDATE ON public.quantity_takeoff_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.quantity_takeoff_line_same_org();

-- ===========================================================================
-- 5) RPC atómica import_quantity_takeoff_batch — patrón import_apu_batch.
--    * SECURITY INVOKER: corre como `authenticated`; la RLS WITH CHECK de
--      quantity_import_batches / quantity_takeoff_groups / quantity_takeoff_
--      lines aplica a CADA escritura. Sin service-role.
--    * Idempotencia: digest ya importado por la org ⇒ {duplicate:true} sin
--      escribir nada (carrera 23505 ⇒ revierte todo el perdedor).
--    * Subtotales y totales: el servicio los recalcula con Decimal y aquí se
--      re-verifica no-negatividad estructural; la RPC NUNCA usa valores que
--      el navegador haya podido alterar (el servicio re-parsea el archivo).
--    * Vínculo BOQ: SOLO ítems de la versión objetivo EDITABLE, no
--      archivados y SIN takeoff previo (índice único parcial + NOT EXISTS).
--      boq_items NO se actualiza: el vínculo vive en el grupo.
--    * Orden interno: groups+lines → batch AL FINAL con conteos definitivos
--      (inmutable por RLS) → estampar import_batch_id en los groups creados.
--    * El status de la versión se lee SIN `FOR UPDATE` (lección 4E.3A).
--    * Atómica: cualquier error revierte toda la transacción.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.import_quantity_takeoff_batch(
  p_batch      jsonb,
  p_groups     jsonb,
  p_version_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := app._auth_uid();
  v_org            uuid := app.current_org();
  v_existing       record;
  v_batch_id       uuid;
  v_group          jsonb;
  v_line           jsonb;
  v_group_id       uuid;
  v_boq_item_id    uuid;
  v_version_status text;
  v_sort           integer;
  v_groups_created integer := 0;
  v_lines_created  integer := 0;
  v_linked         integer := 0;
  v_created_ids    uuid[] := ARRAY[]::uuid[];
  v_linked_items   jsonb := '[]'::jsonb;
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
  SELECT b.id, b.total_groups, b.total_lines, b.linked_boq_items
    INTO v_existing
  FROM public.quantity_import_batches b
  WHERE b.organization_id = v_org
    AND b.digest_sha256 = (p_batch->>'digestSha256')
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'batchId', v_existing.id,
      'groupsCreated', v_existing.total_groups,
      'linesCreated', v_existing.total_lines,
      'linkedBoqItems', v_existing.linked_boq_items
    );
  END IF;

  -- Versión objetivo de vinculación (opcional): visible (RLS) y EDITABLE.
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

  -- Grupos + líneas.
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups) AS g(value) LOOP
    IF v_group->>'description' IS NULL OR btrim(v_group->>'description') = '' THEN
      RAISE EXCEPTION 'group_description_required' USING errcode = 'P0001';
    END IF;
    IF (v_group->>'totalCalculated')::numeric < 0 THEN
      RAISE EXCEPTION 'negative_group_total' USING errcode = 'P0001';
    END IF;

    -- Vínculo BOQ re-verificado BAJO transacción: ítem de la versión
    -- objetivo, no archivado y sin takeoff previo. Si falla cualquier
    -- condición ⇒ el grupo se importa SIN vínculo (jamás se reemplaza).
    v_boq_item_id := NULL;
    IF p_version_id IS NOT NULL AND NULLIF(v_group->>'boqItemId', '') IS NOT NULL THEN
      SELECT bi.id INTO v_boq_item_id
      FROM public.boq_items bi
      WHERE bi.id = (v_group->>'boqItemId')::uuid
        AND bi.estimate_version_id = p_version_id
        AND bi.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.quantity_takeoff_groups qtg
          WHERE qtg.boq_item_id = bi.id
        );
    END IF;

    INSERT INTO public.quantity_takeoff_groups (
      organization_id, estimate_version_id, boq_item_id, visible_code,
      item_code, description, unit, source_row, occurrence_index,
      total_calculated, metadata
    )
    VALUES (
      v_org,
      p_version_id,
      v_boq_item_id,
      NULLIF(v_group->>'visibleCode', ''),
      NULLIF(v_group->>'itemCode', ''),
      v_group->>'description',
      NULLIF(v_group->>'unit', ''),
      (v_group->>'sourceRow')::integer,
      COALESCE(NULLIF(v_group->>'occurrenceIndex', '')::integer, 1),
      COALESCE((v_group->>'totalCalculated')::numeric, 0),
      COALESCE(v_group->'metadata', '{}'::jsonb)
    )
    RETURNING id INTO v_group_id;

    v_groups_created := v_groups_created + 1;
    v_created_ids := v_created_ids || v_group_id;
    IF v_boq_item_id IS NOT NULL THEN
      v_linked := v_linked + 1;
      v_linked_items := v_linked_items || jsonb_build_object(
        'groupSourceRow', v_group->>'sourceRow',
        'boqItemId', v_boq_item_id::text
      );
    END IF;

    v_sort := 0;
    FOR v_line IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_group->'lines', '[]'::jsonb)) AS l(value)
    LOOP
      IF (v_line->>'subtotalCalculated')::numeric < 0 THEN
        RAISE EXCEPTION 'negative_line_subtotal' USING errcode = 'P0001';
      END IF;
      INSERT INTO public.quantity_takeoff_lines (
        organization_id, group_id, description, formula_type,
        length, width, height, count, raw_values, source_row,
        subtotal_calculated, sort_order
      )
      VALUES (
        v_org,
        v_group_id,
        NULLIF(v_line->>'description', ''),
        v_line->>'formulaType',
        NULLIF(v_line->>'length', '')::numeric,
        NULLIF(v_line->>'width', '')::numeric,
        NULLIF(v_line->>'height', '')::numeric,
        NULLIF(v_line->>'count', '')::numeric,
        COALESCE(v_line->'rawValues', '{}'::jsonb),
        (v_line->>'sourceRow')::integer,
        COALESCE((v_line->>'subtotalCalculated')::numeric, 0),
        COALESCE(NULLIF(v_line->>'sortOrder', '')::integer, v_sort)
      );
      v_sort := v_sort + 1;
      v_lines_created := v_lines_created + 1;
    END LOOP;
  END LOOP;

  IF v_groups_created = 0 THEN
    RAISE EXCEPTION 'no_groups' USING errcode = 'P0001';
  END IF;

  -- Batch AL FINAL con conteos definitivos (inmutable tras el COMMIT: la RLS
  -- no concede UPDATE/DELETE). Carrera de digest ⇒ unique_violation ⇒ aborta
  -- y revierte TODO (ni groups ni lines quedan del perdedor).
  INSERT INTO public.quantity_import_batches (
    organization_id, digest_sha256, source_filename, source_sheet,
    imported_by, status, total_groups, total_lines, linked_boq_items,
    unresolved_count, warning_count, metadata
  )
  VALUES (
    v_org,
    p_batch->>'digestSha256',
    COALESCE(p_batch->>'sourceFilename', ''),
    COALESCE(p_batch->>'sourceSheet', 'CANTIDADES 1 PISO'),
    v_uid,
    'completed',
    v_groups_created,
    v_lines_created,
    v_linked,
    COALESCE((p_batch->>'unresolvedCount')::integer, 0),
    COALESCE((p_batch->>'warningCount')::integer, 0),
    COALESCE(p_batch->'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_batch_id;

  -- Estampar la procedencia en los groups creados (UPDATE org-scoped
  -- permitido; trigger same-org valida el batch).
  UPDATE public.quantity_takeoff_groups
    SET import_batch_id = v_batch_id
  WHERE id = ANY (v_created_ids);

  RETURN jsonb_build_object(
    'duplicate', false,
    'batchId', v_batch_id,
    'groupsCreated', v_groups_created,
    'linesCreated', v_lines_created,
    'linkedBoqItems', v_linked,
    'linkedItems', v_linked_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_quantity_takeoff_batch(jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_quantity_takeoff_batch(jsonb, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_quantity_takeoff_batch(jsonb, jsonb, uuid) TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.import_quantity_takeoff_batch(jsonb, jsonb, uuid);
-- DROP TRIGGER IF EXISTS quantity_takeoff_lines_same_org ON public.quantity_takeoff_lines;
-- DROP FUNCTION IF EXISTS public.quantity_takeoff_line_same_org();
-- DROP TRIGGER IF EXISTS quantity_takeoff_groups_same_org ON public.quantity_takeoff_groups;
-- DROP FUNCTION IF EXISTS public.quantity_takeoff_group_same_org();
-- DROP TABLE IF EXISTS quantity_takeoff_lines;
-- DROP TABLE IF EXISTS quantity_takeoff_groups;
-- DROP TABLE IF EXISTS quantity_import_batches;
