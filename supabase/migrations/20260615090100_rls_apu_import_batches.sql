-- Migration: RLS — apu_import_batches (ENTRE_PATIOS_APU_IMPORT_V1)
-- Agent: agent-db-rls (vía agent-orchestrator, FASE 4B.2)
-- Contrato: docs/ENTRE_PATIOS_APU_IMPORT_V1_CONTRACT.md §6.1, §9
--
-- Modelo (paridad price_observation_batches):
--   * organization_id directo ⇒ filtro por app.current_org().
--   * ENABLE + FORCE: RLS aplica también al owner.
--   * SELECT: miembros de la organización.
--   * INSERT: SOLO roles DB admin/gerencia (los que importan APU) con
--     imported_by = identidad real.
--   * SIN UPDATE ni DELETE ⇒ procedencia inmutable (los conteos definitivos
--     se escriben en el INSERT dentro de la RPC import_apu_batch).
--
-- UP

ALTER TABLE apu_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE apu_import_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY aib_select_own_org ON apu_import_batches
  FOR SELECT USING (organization_id = app.current_org());

CREATE POLICY aib_insert_authorized ON apu_import_batches
  FOR INSERT WITH CHECK (
    organization_id = app.current_org()
    AND imported_by = (SELECT app._auth_uid())
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT app._auth_uid()))
      IN ('admin', 'gerencia')
    )
  );

-- UPDATE/DELETE: sin política ⇒ denegados (procedencia inmutable).

-- DOWN
-- DROP POLICY IF EXISTS aib_insert_authorized ON apu_import_batches;
-- DROP POLICY IF EXISTS aib_select_own_org ON apu_import_batches;
-- ALTER TABLE apu_import_batches DISABLE ROW LEVEL SECURITY;
