-- Migration: invariant DB-level del subtotal de boq_items (Oleada 4E.2A).
-- Agent: agent-db-rls (autorado por el orquestador, aprobado por la usuaria).
-- Contrato: docs/BOQ_MANUAL_EDITING_CONTRACT.md §Trazabilidad/Seguridad.
--
-- Motivación: el editor manual de BOQ habilita escrituras DIRECTAS sobre
-- `boq_items` (no solo la RPC `import_boq_into_version`). El subtotal debe ser
-- SIEMPRE un dato derivado `subtotal = quantity_snapshot × unit_price_snapshot`
-- y nunca confiarse desde el navegador, PostgREST, RPC externa ni cliente
-- autenticado. Hoy la única garantía es un CHECK `subtotal >= 0` (no detecta un
-- subtotal positivo manipulado) y el recálculo dentro de la RPC de import.
--
-- Este trigger fuerza el invariant a nivel DB en TODO INSERT/UPDATE (no solo
-- `UPDATE OF quantity_snapshot, unit_price_snapshot`), de modo que un PATCH que
-- toque exclusivamente `subtotal` igualmente se recalcule desde qty × price.
-- Usa `round(..., 10)` para conservar EXACTAMENTE la misma precisión que la RPC
-- `import_boq_into_version` (numeric(20,10)) ⇒ los ítems ya importados quedan
-- consistentes y re-guardarlos no altera su subtotal.
--
-- Hardening: schema-qualified, `SET search_path = public`, sin SECURITY DEFINER,
-- sin service-role, sin cambios de RLS, sin tablas nuevas, sin columnas nuevas,
-- sin datos seed.
--
-- UP

CREATE OR REPLACE FUNCTION public.set_boq_item_subtotal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.subtotal := round(NEW.quantity_snapshot * NEW.unit_price_snapshot, 10);
  RETURN NEW;
END;
$$;

CREATE TRIGGER boq_items_recompute_subtotal
  BEFORE INSERT OR UPDATE ON public.boq_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_boq_item_subtotal();

-- DOWN
-- DROP TRIGGER IF EXISTS boq_items_recompute_subtotal ON public.boq_items;
-- DROP FUNCTION IF EXISTS public.set_boq_item_subtotal();
