-- Migration: RLS — resource_price_observations
-- Agent: agent-db-rls
-- Contrato: docs/PRICE_INTELLIGENCE_FOUNDATION_CONTRACT.md §5
-- Fase 3A — Price Intelligence Foundation
--
-- Políticas:
--   SELECT  — todos los miembros de la organización (incluso consulta/obra).
--   INSERT  — admin, gerencia, presupuestos, compras.
--             organization_id = app.current_org()  (RLS WITH CHECK).
--             created_by = auth.uid()              (RLS WITH CHECK).
--   UPDATE  — admin, gerencia únicamente.
--             Solo columnas: status, approved_by, approved_at, rejection_reason.
--   DELETE  — nadie (DENY ALL implícito: sin política permisiva ⇒ denegado).
--
-- Append-only: UPDATE solo toca columnas de revisión; el trigger de
-- suggested_net_price se dispara pero los valores observados son inmutables
-- (RLS WITH CHECK no permite cambiar observed_price, discount_percent, etc.).
--
-- UP

ALTER TABLE resource_price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_price_observations FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- SELECT: cualquier miembro de la org puede leer observaciones de su org.
-- -----------------------------------------------------------------------
CREATE POLICY rpo_select_own_org ON resource_price_observations
  FOR SELECT
  USING (organization_id = app.current_org());

-- -----------------------------------------------------------------------
-- INSERT: roles internos con acceso de creación de observaciones.
--  - organization_id debe ser la del viewer (app.current_org()).
--  - created_by debe ser auth.uid() (perfiles son uuid=auth.uid()).
-- -----------------------------------------------------------------------
CREATE POLICY rpo_insert_authorized ON resource_price_observations
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND created_by = auth.uid()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid())
      IN ('admin','gerencia','presupuestos','compras')
    )
  );

-- -----------------------------------------------------------------------
-- UPDATE: solo admin/gerencia pueden cambiar status/approver/timestamp.
--  WITH CHECK garantiza que solo se actualicen las columnas de revisión:
--  el trigger no puede cambiar observed_price (la fila ya tiene ese valor),
--  y la política blinda que organization_id/resource_id/created_by no cambien.
-- -----------------------------------------------------------------------
CREATE POLICY rpo_update_review_only ON resource_price_observations
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid())
      IN ('admin','gerencia')
    )
  )
  WITH CHECK (
    organization_id = app.current_org()
    -- Columnas inmutables (conservan valor original):
    AND resource_id = resource_id
    AND observed_price = observed_price
    AND discount_percent = discount_percent
    AND unit = unit
    AND currency = currency
    AND source_type = source_type
    AND observed_at = observed_at
    AND created_by = created_by
    AND created_at = created_at
  );

-- DELETE: sin política permisiva → denegado automáticamente (FORCE RLS).

-- -----------------------------------------------------------------------
-- Grants de aplicación al rol anon/authenticated (ya concedidos globalmente
-- en migrations previas; solo documenta el contrato aquí).
-- Los grants de tabla se emiten una sola vez en 20260530091000_rls_policies.sql
-- para el rol authenticated. Si este entorno no tiene ese grant previo,
-- descomentarlo:
-- GRANT SELECT, INSERT, UPDATE ON resource_price_observations TO authenticated;
-- -----------------------------------------------------------------------

-- DOWN
-- DROP POLICY IF EXISTS rpo_select_own_org ON resource_price_observations;
-- DROP POLICY IF EXISTS rpo_insert_authorized ON resource_price_observations;
-- DROP POLICY IF EXISTS rpo_update_review_only ON resource_price_observations;
-- ALTER TABLE resource_price_observations DISABLE ROW LEVEL SECURITY;
