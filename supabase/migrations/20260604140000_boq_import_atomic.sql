-- Migration: importación ATÓMICA de BOQ (capítulos + ítems) a una versión vacía
--            (Oleada 4C.1).
-- Agent: agent-db-rls (autorado por el orquestador, integración 4C.1).
-- Contrato: docs/EXCEL_IMPORT_CONTRACT.md §3,§4.
--
-- RPC `public.import_boq_into_version(p_version_id, p_chapters, p_items)`:
--   * `SECURITY INVOKER`: corre como `authenticated`; la RLS `WITH CHECK` de
--     `chapters`/`boq_items` (aislamiento por organización + no-bloqueada) aplica a
--     CADA INSERT. Sin service-role.
--   * Identidad por helper canónico `app._auth_uid()` / `app.current_org()`
--     (deny-by-default sin sesión/membresía).
--   * Bloquea la fila de versión con `FOR UPDATE` (serializa confirmaciones
--     concurrentes) y exige versión EDITABLE (no emitida) y VACÍA (anti
--     doble-importación). El índice único `chapters_version_code_uq` es defensa extra.
--   * Inserta capítulos (mapa code→id) y luego ítems con **subtotal RECALCULADO
--     server-side** (`quantity × unit_price`, NUMERIC(20,10)); valores negativos
--     bloqueados. `directTotal` = suma de subtotales recalculados.
--   * Atómica: cualquier error revierte toda la transacción.
--   * Devuelve SOLO `{chapterCount, itemCount, directTotal}` (directTotal como texto).
--
-- NO crea tablas nuevas ni modifica RLS. Hardening de grants: REVOKE de PUBLIC/anon,
-- GRANT EXECUTE solo a authenticated.
--
-- UP

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
BEGIN
  -- Deny-by-default: sesión + membresía obligatorias.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_session' USING errcode = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no_membership' USING errcode = '42501';
  END IF;

  -- Bloquea la versión (RLS la oculta si es cross-org ⇒ NOT FOUND) y serializa
  -- confirmaciones concurrentes. Captura el estado para validar editabilidad.
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

  -- La versión debe estar VACÍA (anti doble-importación), re-verificado bajo lock.
  SELECT count(*) INTO v_existing_ch FROM public.chapters
    WHERE estimate_version_id = p_version_id;
  SELECT count(*) INTO v_existing_it FROM public.boq_items
    WHERE estimate_version_id = p_version_id;
  IF v_existing_ch > 0 OR v_existing_it > 0 THEN
    RAISE EXCEPTION 'version_not_empty' USING errcode = 'P0001';
  END IF;

  -- Inserta capítulos (capturando code→id). RLS WITH CHECK aplica.
  FOR v_chapter IN SELECT value FROM jsonb_array_elements(p_chapters) AS t(value) LOOP
    v_sort := COALESCE((v_chapter->>'sortOrder')::integer, v_chapter_count);
    INSERT INTO public.chapters (estimate_version_id, code, name, sort_order)
    VALUES (p_version_id, v_chapter->>'code', v_chapter->>'name', v_sort)
    RETURNING id INTO v_chapter_id;
    v_code_to_id := v_code_to_id || jsonb_build_object(v_chapter->>'code', v_chapter_id::text);
    v_chapter_count := v_chapter_count + 1;
  END LOOP;

  -- Inserta ítems con subtotal RECALCULADO server-side.
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
    INSERT INTO public.boq_items (
      estimate_version_id, chapter_id, code, description_snapshot, unit_snapshot,
      quantity_snapshot, unit_price_snapshot, subtotal, sort_order
    )
    VALUES (
      p_version_id, v_chapter_id, v_item->>'code', v_item->>'description', v_item->>'unit',
      v_qty, v_price, v_subtotal, v_sort
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
-- DROP FUNCTION IF EXISTS public.import_boq_into_version(uuid, jsonb, jsonb);
