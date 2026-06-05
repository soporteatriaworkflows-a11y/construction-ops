-- Migration: trazabilidad de origen para normalización reversible de códigos
--            (Oleada 4C.3).
-- Agent: agent-db-rls (autorado por el orquestador, integración 4C.3).
-- Contrato: docs/EXCEL_IMPORT_CONTRACT.md §§1,3,6.
--
-- Añade a `chapters` y `boq_items` columnas de origen para conservar el código
-- y la fila ORIGINALES del Excel cuando la usuaria normaliza códigos canónicos:
--   * source_code text    — código tal cual venía en el Excel (sin normalizar).
--   * source_row  integer — fila REAL de Excel (>0) del registro.
-- `code` sigue almacenando el código CANÓNICO (validado, único por versión).
--
-- Extiende la RPC `import_boq_into_version` (MISMA firma) para persistir
-- `source_code`/`source_row` desde el JSONB. Mantiene: SECURITY INVOKER, RLS,
-- bloqueo de versión vacía/editable (FOR UPDATE), atomicidad, subtotal recalculado
-- server-side, grants endurecidos. NO crea tablas ni cambia policies RLS.
--
-- UP

ALTER TABLE public.chapters
  ADD COLUMN source_code text,
  ADD COLUMN source_row  integer,
  ADD CONSTRAINT chapters_source_row_positive CHECK (source_row IS NULL OR source_row > 0);

ALTER TABLE public.boq_items
  ADD COLUMN source_code text,
  ADD COLUMN source_row  integer,
  ADD CONSTRAINT boq_items_source_row_positive CHECK (source_row IS NULL OR source_row > 0);

CREATE OR REPLACE FUNCTION public.import_boq_into_version(
  p_version_id uuid,
  p_chapters   jsonb,
  p_items      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := app._auth_uid();
  v_org          uuid := app.current_org();
  v_status       text;
  v_existing_ch  integer;
  v_existing_it  integer;
  v_chapter      jsonb;
  v_item         jsonb;
  v_chapter_id   uuid;
  v_qty          numeric(20,10);
  v_price        numeric(20,10);
  v_subtotal     numeric(20,10);
  v_direct_total numeric(20,10) := 0;
  v_chapter_count integer := 0;
  v_item_count    integer := 0;
  v_code_to_id   jsonb := '{}'::jsonb;
  v_sort         integer;
  v_src_row      integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_session' USING errcode = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no_membership' USING errcode = '42501';
  END IF;

  SELECT ev.status INTO v_status
  FROM public.estimate_versions ev
  WHERE ev.id = p_version_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_not_found' USING errcode = 'P0002';
  END IF;
  IF v_status IN ('approved', 'issued', 'archived') THEN
    RAISE EXCEPTION 'version_locked' USING errcode = 'P0001';
  END IF;

  SELECT count(*) INTO v_existing_ch FROM public.chapters
    WHERE estimate_version_id = p_version_id;
  SELECT count(*) INTO v_existing_it FROM public.boq_items
    WHERE estimate_version_id = p_version_id;
  IF v_existing_ch > 0 OR v_existing_it > 0 THEN
    RAISE EXCEPTION 'version_not_empty' USING errcode = 'P0001';
  END IF;

  -- Capítulos: `code` = canónico; se preservan source_code/source_row.
  FOR v_chapter IN SELECT value FROM jsonb_array_elements(p_chapters) AS t(value) LOOP
    v_sort := COALESCE((v_chapter->>'sortOrder')::integer, v_chapter_count);
    v_src_row := NULLIF(v_chapter->>'sourceRow', '')::integer;
    INSERT INTO public.chapters (estimate_version_id, code, name, sort_order, source_code, source_row)
    VALUES (
      p_version_id,
      v_chapter->>'code',
      v_chapter->>'name',
      v_sort,
      NULLIF(v_chapter->>'sourceCode', ''),
      v_src_row
    )
    RETURNING id INTO v_chapter_id;
    v_code_to_id := v_code_to_id || jsonb_build_object(v_chapter->>'code', v_chapter_id::text);
    v_chapter_count := v_chapter_count + 1;
  END LOOP;

  -- Ítems: `code` = canónico; subtotal recalculado server-side; origen preservado.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value) LOOP
    v_chapter_id := NULLIF(v_code_to_id ->> (v_item->>'chapterCode'), '')::uuid;
    IF v_chapter_id IS NULL THEN
      RAISE EXCEPTION 'item_chapter_not_found' USING errcode = 'P0001';
    END IF;
    v_qty   := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unitPrice')::numeric;
    IF v_qty < 0 OR v_price < 0 THEN
      RAISE EXCEPTION 'negative_value' USING errcode = 'P0001';
    END IF;
    v_subtotal := round(v_qty * v_price, 10);
    v_sort := COALESCE((v_item->>'sortOrder')::integer, v_item_count);
    v_src_row := NULLIF(v_item->>'sourceRow', '')::integer;
    INSERT INTO public.boq_items (
      estimate_version_id, chapter_id, code, description_snapshot, unit_snapshot,
      quantity_snapshot, unit_price_snapshot, subtotal, sort_order, source_code, source_row
    )
    VALUES (
      p_version_id, v_chapter_id, v_item->>'code', v_item->>'description', v_item->>'unit',
      v_qty, v_price, v_subtotal, v_sort,
      NULLIF(v_item->>'sourceCode', ''), v_src_row
    );
    v_direct_total := v_direct_total + v_subtotal;
    v_item_count := v_item_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'chapterCount', v_chapter_count,
    'itemCount',    v_item_count,
    'directTotal',  v_direct_total::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_boq_into_version(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_boq_into_version(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_boq_into_version(uuid, jsonb, jsonb) TO authenticated;

-- DOWN
-- -- Restaurar la RPC 4C.1 (sin source_code/source_row) con CREATE OR REPLACE …
-- ALTER TABLE public.boq_items DROP CONSTRAINT IF EXISTS boq_items_source_row_positive;
-- ALTER TABLE public.boq_items DROP COLUMN IF EXISTS source_row;
-- ALTER TABLE public.boq_items DROP COLUMN IF EXISTS source_code;
-- ALTER TABLE public.chapters DROP CONSTRAINT IF EXISTS chapters_source_row_positive;
-- ALTER TABLE public.chapters DROP COLUMN IF EXISTS source_row;
-- ALTER TABLE public.chapters DROP COLUMN IF EXISTS source_code;
