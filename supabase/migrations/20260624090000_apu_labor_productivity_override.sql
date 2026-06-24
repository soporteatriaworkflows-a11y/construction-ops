-- APU_PRODUCTIVITY_CREW_OVERRIDES_V1B — Modelo + RPC para override de
-- rendimiento/cuadrilla de componentes de mano de obra del APU.
--
-- ⚠️ MIGRACIÓN ADITIVA. NO aplicada en este gate. Se aplica en un paso
-- CONTROLADO y autorizado aparte (APU_PRODUCTIVITY_CREW_OVERRIDES_V1B_APPLY_DB_GATE).
--
-- Semántica (ver docs/engineering/apu-productivity-crew-overrides-v1.md):
--  * `quantity` SIGUE siendo la verdad efectiva del consumo laboral. Para filas
--    `labor` se interpreta como persona·día / unidad de obra.
--  * Dos formas equivalentes:
--      - consumo laboral:   labor_quantity = persona·día / unidad
--      - rendimiento:        productivity   = unidades / día de cuadrilla
--    con `crew_size` personas:
--      labor_quantity = crew_size / productivity
--      productivity   = crew_size / labor_quantity
--  * Legacy: en el PRIMER override se congela `recommended_labor_quantity` = la
--    `quantity` actual. `recommended_productivity` solo se deriva si hay crew_size;
--    si no, queda NULL. NO se recalculan históricos ni se hace backfill.
--  * La RPC NO toca unit_price_snapshot / precios / descuentos / waste_pct. Solo
--    ajusta `quantity` (+ metadata); el trigger `apu_components_recompute_total`
--    reafirma `total_component_cost = quantity × (1+waste_pct) × unit_price_snapshot`.
--  * Bloqueo: APU archivado (`apu_templates.archived_at`). Los estados
--    issued/approved viven en `estimate_versions` (snapshots), NO en la
--    biblioteca `apu_templates`; editar la plantilla NO muta presupuestos emitidos.

-- 1) Columnas aditivas de override de rendimiento/cuadrilla -----------------------
ALTER TABLE public.apu_components
  ADD COLUMN IF NOT EXISTS recommended_labor_quantity numeric,
  ADD COLUMN IF NOT EXISTS recommended_productivity    numeric,
  ADD COLUMN IF NOT EXISTS applied_productivity        numeric,
  ADD COLUMN IF NOT EXISTS productivity_unit           text,
  ADD COLUMN IF NOT EXISTS recommended_crew_size       numeric,
  ADD COLUMN IF NOT EXISTS applied_crew_size           numeric,
  ADD COLUMN IF NOT EXISTS productivity_source         text,
  ADD COLUMN IF NOT EXISTS productivity_note           text,
  ADD COLUMN IF NOT EXISTS productivity_updated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS productivity_updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.apu_components.recommended_labor_quantity IS
  'Legacy-safe: persona·día/unidad congelado en el primer override (= quantity previa). NULL ⇒ nunca editado.';
COMMENT ON COLUMN public.apu_components.recommended_productivity IS
  'Rendimiento recomendado (unidades/día de cuadrilla). Solo derivable con crew_size; NULL si no.';
COMMENT ON COLUMN public.apu_components.applied_productivity IS
  'Rendimiento aplicado por el experto (unidades/día de cuadrilla o persona·día/unidad según productivity_unit).';
COMMENT ON COLUMN public.apu_components.productivity_unit IS
  'Unidad del valor de rendimiento: person_day_per_unit | unit_per_crew_day | NULL (heredado).';
COMMENT ON COLUMN public.apu_components.recommended_crew_size IS 'Tamaño de cuadrilla recomendado (personas).';
COMMENT ON COLUMN public.apu_components.applied_crew_size IS 'Tamaño de cuadrilla aplicado (personas).';
COMMENT ON COLUMN public.apu_components.productivity_source IS 'Origen del valor: manual | reset | NULL (heredado).';
COMMENT ON COLUMN public.apu_components.productivity_note IS 'Justificación técnica interna (no a rol client).';

-- Restricciones compatibles con datos actuales (NULL permitido en legacy):
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_recommended_labor_qty_pos') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_recommended_labor_qty_pos
      CHECK (recommended_labor_quantity IS NULL OR recommended_labor_quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_recommended_productivity_pos') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_recommended_productivity_pos
      CHECK (recommended_productivity IS NULL OR recommended_productivity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_applied_productivity_pos') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_applied_productivity_pos
      CHECK (applied_productivity IS NULL OR applied_productivity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_recommended_crew_pos') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_recommended_crew_pos
      CHECK (recommended_crew_size IS NULL OR recommended_crew_size > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_applied_crew_pos') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_applied_crew_pos
      CHECK (applied_crew_size IS NULL OR applied_crew_size > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_productivity_unit_valid') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_productivity_unit_valid
      CHECK (productivity_unit IS NULL OR productivity_unit IN ('person_day_per_unit','unit_per_crew_day'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_productivity_source_valid') THEN
    ALTER TABLE public.apu_components ADD CONSTRAINT apu_components_productivity_source_valid
      CHECK (productivity_source IS NULL OR productivity_source IN ('manual','reset'));
  END IF;
END $$;

-- 2) RPC: aplicar override de rendimiento/cuadrilla (ajusta SOLO quantity + meta) -
CREATE OR REPLACE FUNCTION public.update_apu_component_labor_productivity_override(
  p_component_id    uuid,
  p_productivity    numeric,
  p_crew_size       numeric DEFAULT NULL,
  p_productivity_unit text  DEFAULT 'unit_per_crew_day',
  p_note            text    DEFAULT NULL
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
  v_recommended_qty numeric;
  v_new_quantity numeric;
  v_applied_crew numeric;
BEGIN
  -- Guards estándar (espejo de update_apu_component_waste_override).
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  SELECT p.organization_id, p.role INTO v_org, v_role
  FROM public.profiles p WHERE p.id = v_uid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia','presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  -- Validación de unidad ANTES de tocar nada.
  IF p_productivity_unit IS NULL OR p_productivity_unit NOT IN ('person_day_per_unit','unit_per_crew_day') THEN
    RAISE EXCEPTION 'invalid_productivity_unit' USING errcode = 'P0001';
  END IF;
  IF p_productivity IS NULL OR p_productivity <= 0 THEN
    RAISE EXCEPTION 'invalid_productivity' USING errcode = 'P0001';
  END IF;

  -- Componente + APU de la organización del actor (RLS es la barrera real).
  SELECT c.apu_template_id, c.component_type, c.quantity, c.recommended_labor_quantity, t.archived_at
    INTO v_template_id, v_type, v_quantity, v_recommended_qty, v_archived
  FROM public.apu_components c
  JOIN public.apu_templates t ON t.id = c.apu_template_id
  WHERE c.id = p_component_id AND t.organization_id = v_org;

  IF v_template_id IS NULL THEN RAISE EXCEPTION 'component_not_found' USING errcode = 'P0002'; END IF;
  IF v_type <> 'labor' THEN RAISE EXCEPTION 'not_labor_component' USING errcode = 'P0001'; END IF;
  IF v_archived IS NOT NULL THEN RAISE EXCEPTION 'apu_archived' USING errcode = '42501'; END IF;

  -- Congelar el recomendado legacy la primera vez (= consumo laboral previo).
  IF v_recommended_qty IS NULL THEN v_recommended_qty := v_quantity; END IF;

  IF p_productivity_unit = 'unit_per_crew_day' THEN
    IF p_crew_size IS NULL OR p_crew_size <= 0 THEN
      RAISE EXCEPTION 'invalid_crew_size' USING errcode = 'P0001';
    END IF;
    -- labor_quantity = crew_size / productivity
    v_new_quantity := p_crew_size / p_productivity;
    v_applied_crew := p_crew_size;
  ELSE
    -- person_day_per_unit: p_productivity ES el consumo laboral (persona·día/unidad).
    v_new_quantity := p_productivity;
    v_applied_crew := p_crew_size;  -- opcional; NULL permitido
  END IF;

  UPDATE public.apu_components
     SET quantity                   = v_new_quantity,
         recommended_labor_quantity = v_recommended_qty,
         applied_productivity       = p_productivity,
         productivity_unit          = p_productivity_unit,
         applied_crew_size          = v_applied_crew,
         productivity_source        = 'manual',
         productivity_note          = NULLIF(btrim(coalesce(p_note,'')), ''),
         productivity_updated_at    = now(),
         productivity_updated_by    = v_uid
   WHERE id = p_component_id;
  -- NOTA: el trigger apu_components_recompute_total reafirma total_component_cost.
  -- NO se tocan unit_price_snapshot / waste_pct / precios / descuentos.

  RETURN jsonb_build_object(
    'componentId', p_component_id,
    'quantity', v_new_quantity,
    'recommendedLaborQuantity', v_recommended_qty,
    'appliedProductivity', p_productivity,
    'productivityUnit', p_productivity_unit,
    'appliedCrewSize', v_applied_crew
  );
END $$;

REVOKE ALL ON FUNCTION public.update_apu_component_labor_productivity_override(uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_apu_component_labor_productivity_override(uuid, numeric, numeric, text, text) TO authenticated;

-- 3) RPC: restaurar el consumo laboral recomendado (reset) -----------------------
CREATE OR REPLACE FUNCTION public.reset_apu_component_labor_productivity_override(
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
  v_recommended_qty numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  SELECT p.organization_id, p.role INTO v_org, v_role
  FROM public.profiles p WHERE p.id = v_uid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia','presupuestos') THEN
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  SELECT c.apu_template_id, c.component_type, c.recommended_labor_quantity, t.archived_at
    INTO v_template_id, v_type, v_recommended_qty, v_archived
  FROM public.apu_components c
  JOIN public.apu_templates t ON t.id = c.apu_template_id
  WHERE c.id = p_component_id AND t.organization_id = v_org;

  IF v_template_id IS NULL THEN RAISE EXCEPTION 'component_not_found' USING errcode = 'P0002'; END IF;
  IF v_type <> 'labor' THEN RAISE EXCEPTION 'not_labor_component' USING errcode = 'P0001'; END IF;
  IF v_archived IS NOT NULL THEN RAISE EXCEPTION 'apu_archived' USING errcode = '42501'; END IF;
  IF v_recommended_qty IS NULL THEN
    -- Nunca hubo override ⇒ nada que restaurar.
    RAISE EXCEPTION 'no_recommended_baseline' USING errcode = 'P0001';
  END IF;

  UPDATE public.apu_components
     SET quantity                = v_recommended_qty,
         applied_productivity    = NULL,
         applied_crew_size       = NULL,
         productivity_source     = 'reset',
         productivity_note       = NULL,
         productivity_updated_at = now(),
         productivity_updated_by = v_uid
   WHERE id = p_component_id;
  -- NO se tocan unit_price_snapshot / waste_pct / precios / descuentos.

  RETURN jsonb_build_object('componentId', p_component_id, 'quantity', v_recommended_qty, 'reset', true);
END $$;

REVOKE ALL ON FUNCTION public.reset_apu_component_labor_productivity_override(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_apu_component_labor_productivity_override(uuid) TO authenticated;

-- DOWN
-- DROP FUNCTION IF EXISTS public.reset_apu_component_labor_productivity_override(uuid);
-- DROP FUNCTION IF EXISTS public.update_apu_component_labor_productivity_override(uuid, numeric, numeric, text, text);
-- ALTER TABLE public.apu_components
--   DROP COLUMN IF EXISTS recommended_labor_quantity, DROP COLUMN IF EXISTS recommended_productivity,
--   DROP COLUMN IF EXISTS applied_productivity, DROP COLUMN IF EXISTS productivity_unit,
--   DROP COLUMN IF EXISTS recommended_crew_size, DROP COLUMN IF EXISTS applied_crew_size,
--   DROP COLUMN IF EXISTS productivity_source, DROP COLUMN IF EXISTS productivity_note,
--   DROP COLUMN IF EXISTS productivity_updated_at, DROP COLUMN IF EXISTS productivity_updated_by;
