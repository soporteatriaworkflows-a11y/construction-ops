-- APU_MATERIAL_CONSUMPTION_OVERRIDES_V1 — Override trazable del CONSUMO unitario
-- (coeficiente) de un componente MATERIAL del APU.
--
-- ⚠️ MIGRACIÓN ADITIVA. Se aplica en un paso CONTROLADO y autorizado.
--
-- Semántica:
--  * En filas `material`, `quantity` = consumo unitario / coeficiente del material
--    por unidad de obra del APU. Sigue siendo la verdad efectiva del costo:
--      total_component_cost = quantity × (1 + waste_pct) × unit_price_snapshot
--  * Editar el consumo ajusta SOLO `quantity` (+ metadata). El trigger
--    `apu_components_recompute_total` reafirma `total_component_cost`.
--  * NO toca unit_price_snapshot / waste_pct / precios / descuentos / mano de obra
--    / rendimiento / herramienta menor.
--  * Legacy: en el PRIMER override se congela `recommended_material_quantity` =
--    `quantity` actual. NULL ⇒ nunca editado. SIN backfill / SIN UPDATE masivo.
--  * Bloqueo: APU archivado (`apu_templates.archived_at`). issued/approved viven en
--    `estimate_versions` (snapshots), no en la biblioteca `apu_templates`.

-- 1) Columnas aditivas (solo aplican conceptualmente a component_type='material') -
ALTER TABLE public.apu_components
  ADD COLUMN IF NOT EXISTS recommended_material_quantity numeric,
  ADD COLUMN IF NOT EXISTS material_quantity_source       text,
  ADD COLUMN IF NOT EXISTS material_quantity_note         text,
  ADD COLUMN IF NOT EXISTS material_quantity_updated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS material_quantity_updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.apu_components.recommended_material_quantity IS
  'Consumo unitario recomendado congelado en el primer override (= quantity previa). Solo material. NULL ⇒ nunca editado.';
COMMENT ON COLUMN public.apu_components.material_quantity_source IS
  'Origen del consumo: manual | reset | imported | suggested | NULL (heredado). Solo material.';
COMMENT ON COLUMN public.apu_components.material_quantity_note IS
  'Justificación técnica interna del ajuste de consumo (no a rol client). Solo material.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_recommended_material_qty_pos') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_recommended_material_qty_pos
      CHECK (recommended_material_quantity IS NULL OR recommended_material_quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_material_qty_source_valid') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_material_qty_source_valid
      CHECK (material_quantity_source IS NULL OR material_quantity_source IN ('manual','reset','imported','suggested'));
  END IF;
END $$;

-- 2) RPC: aplicar override de consumo material (ajusta SOLO quantity + meta) ------
CREATE OR REPLACE FUNCTION public.update_apu_component_material_consumption_override(
  p_component_id uuid,
  p_quantity     numeric,
  p_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_role text;
  v_template_id uuid;
  v_type text;
  v_archived timestamptz;
  v_quantity numeric;
  v_recommended numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  SELECT p.organization_id, p.role INTO v_org, v_role FROM public.profiles p WHERE p.id = v_uid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia','presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity' USING errcode = 'P0001';
  END IF;

  SELECT c.apu_template_id, c.component_type, c.quantity, c.recommended_material_quantity, t.archived_at
    INTO v_template_id, v_type, v_quantity, v_recommended, v_archived
  FROM public.apu_components c
  JOIN public.apu_templates t ON t.id = c.apu_template_id
  WHERE c.id = p_component_id AND t.organization_id = v_org;

  IF v_template_id IS NULL THEN RAISE EXCEPTION 'component_not_found' USING errcode = 'P0002'; END IF;
  IF v_type <> 'material' THEN RAISE EXCEPTION 'not_material_component' USING errcode = 'P0001'; END IF;
  IF v_archived IS NOT NULL THEN RAISE EXCEPTION 'apu_archived' USING errcode = '42501'; END IF;

  -- Congelar el recomendado la primera vez (= consumo previo).
  IF v_recommended IS NULL THEN v_recommended := v_quantity; END IF;

  UPDATE public.apu_components
     SET quantity                      = p_quantity,
         recommended_material_quantity = v_recommended,
         material_quantity_source      = 'manual',
         material_quantity_note        = NULLIF(btrim(coalesce(p_note,'')), ''),
         material_quantity_updated_at  = now(),
         material_quantity_updated_by  = v_uid
   WHERE id = p_component_id;
  -- NOTA: el trigger apu_components_recompute_total reafirma total_component_cost.
  -- NO se tocan unit_price_snapshot / waste_pct / precios / descuentos / labor.

  RETURN jsonb_build_object(
    'componentId', p_component_id,
    'quantity', p_quantity,
    'recommendedMaterialQuantity', v_recommended,
    'overridden', (p_quantity <> v_recommended)
  );
END $$;

REVOKE ALL ON FUNCTION public.update_apu_component_material_consumption_override(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_apu_component_material_consumption_override(uuid, numeric, text) TO authenticated;

-- 3) RPC: restaurar el consumo recomendado (reset) -------------------------------
CREATE OR REPLACE FUNCTION public.reset_apu_component_material_consumption_override(
  p_component_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_role text;
  v_template_id uuid;
  v_type text;
  v_archived timestamptz;
  v_recommended numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  SELECT p.organization_id, p.role INTO v_org, v_role FROM public.profiles p WHERE p.id = v_uid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia','presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  SELECT c.apu_template_id, c.component_type, c.recommended_material_quantity, t.archived_at
    INTO v_template_id, v_type, v_recommended, v_archived
  FROM public.apu_components c
  JOIN public.apu_templates t ON t.id = c.apu_template_id
  WHERE c.id = p_component_id AND t.organization_id = v_org;

  IF v_template_id IS NULL THEN RAISE EXCEPTION 'component_not_found' USING errcode = 'P0002'; END IF;
  IF v_type <> 'material' THEN RAISE EXCEPTION 'not_material_component' USING errcode = 'P0001'; END IF;
  IF v_archived IS NOT NULL THEN RAISE EXCEPTION 'apu_archived' USING errcode = '42501'; END IF;
  IF v_recommended IS NULL THEN RAISE EXCEPTION 'no_recommended_baseline' USING errcode = 'P0001'; END IF;

  UPDATE public.apu_components
     SET quantity                     = v_recommended,
         material_quantity_source     = 'reset',
         material_quantity_note       = NULL,
         material_quantity_updated_at = now(),
         material_quantity_updated_by = v_uid
   WHERE id = p_component_id;
  -- NO se tocan unit_price_snapshot / waste_pct / precios / descuentos.

  RETURN jsonb_build_object('componentId', p_component_id, 'quantity', v_recommended, 'reset', true);
END $$;

REVOKE ALL ON FUNCTION public.reset_apu_component_material_consumption_override(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_apu_component_material_consumption_override(uuid) TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.reset_apu_component_material_consumption_override(uuid);
-- DROP FUNCTION IF EXISTS public.update_apu_component_material_consumption_override(uuid, numeric, text);
-- ALTER TABLE public.apu_components
--   DROP COLUMN IF EXISTS recommended_material_quantity, DROP COLUMN IF EXISTS material_quantity_source,
--   DROP COLUMN IF EXISTS material_quantity_note, DROP COLUMN IF EXISTS material_quantity_updated_at,
--   DROP COLUMN IF EXISTS material_quantity_updated_by;
