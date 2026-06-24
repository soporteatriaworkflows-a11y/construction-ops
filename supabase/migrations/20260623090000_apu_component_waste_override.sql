-- APU_SMART_DEFAULTS_V1B — Override trazable de desperdicio por componente APU.
--
-- ⚠️ MIGRACIÓN ADITIVA. NO aplicada a producción en la oleada V1B (discovery/impl
-- de rama). Pensada para aplicarse en un paso CONTROLADO y autorizado aparte.
--
-- Principios:
--  * Aditiva: columnas NULLABLE, sin tocar filas existentes (delta 0).
--  * `waste_pct` sigue siendo el valor EFECTIVO usado por el motor (no se toca).
--  * `recommended_waste_pct` NULL ⇒ la app trata recommended = waste_pct (fallback
--    en código). No se hace backfill masivo para no mutar datos históricos.
--  * RPC SECURITY DEFINER, RLS-bound, con los mismos guards que el resto de RPCs
--    (session/org/rol management|internal). Bloquea edición de APU archivado.
--  * NO toca quantity, unit_price_snapshot, descuentos ni rendimiento/cuadrilla.

-- 1) Columnas aditivas de override de desperdicio --------------------------------
ALTER TABLE public.apu_components
  ADD COLUMN IF NOT EXISTS recommended_waste_pct numeric,
  ADD COLUMN IF NOT EXISTS waste_pct_source       text,
  ADD COLUMN IF NOT EXISTS waste_pct_note         text,
  ADD COLUMN IF NOT EXISTS waste_pct_updated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS waste_pct_updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Compatibilidad con datos legacy: las columnas nuevas quedan NULL en filas
-- existentes ⇒ recommended = waste_pct (fallback en código). Sin UPDATE masivo.

-- Restricciones compatibles con datos actuales (NULL permitido):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_recommended_waste_nonneg'
  ) THEN
    ALTER TABLE public.apu_components
      ADD CONSTRAINT apu_components_recommended_waste_nonneg
      CHECK (recommended_waste_pct IS NULL OR recommended_waste_pct >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'apu_components_waste_pct_source_valid'
  ) THEN
    ALTER TABLE public.apu_components
      ADD CONSTRAINT apu_components_waste_pct_source_valid
      CHECK (waste_pct_source IS NULL OR waste_pct_source IN ('recommended','manual','excel'));
  END IF;
END $$;

-- 2) RPC: actualizar SOLO el desperdicio aplicado + trazabilidad -----------------
-- Editable ⇔ APU NO archivado + rol management|internal + org del actor.
-- NO toca quantity/unit_price_snapshot/total (el trigger de recompute existente
-- recalcula total_component_cost a partir de quantity×(1+waste)×price).
CREATE OR REPLACE FUNCTION public.update_apu_component_waste_override(
  p_component_id uuid,
  p_waste_pct    numeric,
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
  v_archived timestamptz;
  v_prev numeric;
  v_recommended numeric;
BEGIN
  -- Guards estándar (espejo de las demás RPCs).
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_session' USING errcode = '42501'; END IF;
  SELECT p.organization_id, p.role INTO v_org, v_role
  FROM public.profiles p WHERE p.id = v_uid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_membership' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','gerencia','presupuestos') THEN
    -- Mismos roles internos con permiso de edición de costos (alineado a RLS).
    RAISE EXCEPTION 'insufficient_role' USING errcode = '42501';
  END IF;

  IF p_waste_pct IS NULL OR p_waste_pct < 0 OR p_waste_pct > 1 THEN
    RAISE EXCEPTION 'invalid_waste_pct' USING errcode = 'P0001';
  END IF;

  -- Componente + APU de la organización del actor (RLS es la barrera real).
  SELECT c.apu_template_id, c.waste_pct, c.recommended_waste_pct,
         t.archived_at
    INTO v_template_id, v_prev, v_recommended, v_archived
  FROM public.apu_components c
  JOIN public.apu_templates t ON t.id = c.apu_template_id
  WHERE c.id = p_component_id AND t.organization_id = v_org;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'component_not_found' USING errcode = 'P0002';
  END IF;
  -- Estado editable: APU NO archivado.
  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION 'apu_archived' USING errcode = '42501';
  END IF;

  -- Congelar el recomendado la primera vez (si nunca se fijó, = valor previo).
  IF v_recommended IS NULL THEN
    v_recommended := v_prev;
  END IF;

  UPDATE public.apu_components
     SET waste_pct             = p_waste_pct,
         recommended_waste_pct = v_recommended,
         waste_pct_source      = CASE WHEN p_waste_pct = v_recommended THEN 'recommended' ELSE 'manual' END,
         waste_pct_note        = NULLIF(btrim(coalesce(p_note,'')), ''),
         waste_pct_updated_at  = now(),
         waste_pct_updated_by  = v_uid
   WHERE id = p_component_id;
  -- NOTA: el trigger apu_component_recompute_total recalcula total_component_cost.

  RETURN jsonb_build_object(
    'componentId', p_component_id,
    'wastePct', p_waste_pct,
    'recommendedWastePct', v_recommended,
    'overridden', (p_waste_pct <> v_recommended)
  );
END $$;

REVOKE ALL ON FUNCTION public.update_apu_component_waste_override(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_apu_component_waste_override(uuid, numeric, text) TO authenticated;
