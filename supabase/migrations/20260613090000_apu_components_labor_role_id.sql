-- Migration: APU foundation — labor_role_id trazable en apu_components.
-- Agent: agent-db-rls (autorado por el orquestador, FASE 4B.1).
-- Contrato: docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md §4.
--
-- Motivación: `unit_price_source = 'labor_role'` era un marker textual sin FK;
-- el vínculo componente M.O. → rol salarial quedaba implícito y no trazable.
-- Esta columna ADITIVA (NULL en todas las filas existentes) habilita auditoría
-- ("este costo de M.O. vino del rol X") y futura recalculación de snapshots.
--
-- ON DELETE SET NULL: borrar un rol no rompe el APU; el snapshot congelado en
-- `unit_price_snapshot` sigue siendo válido (regla de inmutabilidad).
--
-- Invariante same-org (trigger controlado): el rol referenciado debe pertenecer
-- a la MISMA organización que el apu_template del componente. RLS por sí sola
-- no expresa esta relación (la policy de apu_components valida el template,
-- no el rol). Sin SECURITY DEFINER; schema-qualified; search_path fijo.
--
-- NO se agrega CHECK "source='labor_role' ⇒ labor_role_id NOT NULL" para no
-- invalidar filas históricas; ese invariante se exige en dominio para flujos
-- nuevos y se regularizará en ENTRE_PATIOS_APU_IMPORT_V1.
--
-- UP

ALTER TABLE apu_components
  ADD COLUMN labor_role_id uuid REFERENCES labor_roles (id) ON DELETE SET NULL;

CREATE INDEX apu_components_labor_role_id_idx ON apu_components (labor_role_id);

CREATE OR REPLACE FUNCTION public.apu_component_labor_role_same_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role_org uuid;
  v_template_org uuid;
BEGIN
  IF NEW.labor_role_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT organization_id INTO v_role_org
    FROM labor_roles WHERE id = NEW.labor_role_id;
  SELECT organization_id INTO v_template_org
    FROM apu_templates WHERE id = NEW.apu_template_id;
  IF v_role_org IS DISTINCT FROM v_template_org THEN
    RAISE EXCEPTION
      'labor_role_id % no pertenece a la organización del apu_template %',
      NEW.labor_role_id, NEW.apu_template_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER apu_components_labor_role_same_org
  BEFORE INSERT OR UPDATE ON public.apu_components
  FOR EACH ROW
  EXECUTE FUNCTION public.apu_component_labor_role_same_org();

-- DOWN
-- DROP TRIGGER IF EXISTS apu_components_labor_role_same_org ON public.apu_components;
-- DROP FUNCTION IF EXISTS public.apu_component_labor_role_same_org();
-- DROP INDEX IF EXISTS apu_components_labor_role_id_idx;
-- ALTER TABLE apu_components DROP COLUMN IF EXISTS labor_role_id;
