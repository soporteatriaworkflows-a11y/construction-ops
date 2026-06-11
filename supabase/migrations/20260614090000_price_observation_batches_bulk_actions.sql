-- Migration: PRICE OBSERVATION REVIEW CENTER V1 — lotes de importación y
--            acciones masivas auditables sobre resource_price_observations.
-- Agent: agent-db-rls (vía agent-orchestrator)
-- Contrato: docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md §4
--
-- Aditiva. Sin DROP, sin DELETE, sin backfill destructivo.
-- Las observaciones existentes quedan con import_batch_id = NULL
-- (compatibilidad retroactiva: siguen siendo revisables una a una y en bloque).
--
-- UP

-- ===========================================================================
-- A. price_observation_batches — procedencia durable de cada importación.
--    El digest SHA-256 (antes transitorio preview→confirm) se persiste aquí.
--    pending/approved/rejected del lote se CALCULAN en lectura (regla del
--    proyecto: no almacenar estado derivado); total_rows es hecho inmutable.
-- ===========================================================================

CREATE TABLE price_observation_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  source_type      text NOT NULL,
  source_reference text,
  digest_sha256    text NOT NULL,
  label            text,
  imported_by      uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  imported_at      timestamptz NOT NULL DEFAULT now(),
  total_rows       integer NOT NULL DEFAULT 0,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT pob_source_type_valid CHECK (
    source_type IN (
      'official_api','official_feed','supplier_csv',
      'manual','public_web','invoice','quotation'
    )
  ),
  CONSTRAINT pob_total_rows_nonneg CHECK (total_rows >= 0),
  CONSTRAINT pob_digest_hex CHECK (digest_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX pob_org_imported_idx
  ON price_observation_batches (organization_id, imported_at DESC);

-- ===========================================================================
-- B. resource_price_observations.import_batch_id — vínculo opcional al lote.
--    NULL = observación previa al review center, manual o del monitor.
-- ===========================================================================

ALTER TABLE resource_price_observations
  ADD COLUMN import_batch_id uuid
    REFERENCES price_observation_batches (id) ON DELETE SET NULL;

CREATE INDEX rpo_import_batch_idx
  ON resource_price_observations (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Guard same-org: una observación solo puede apuntar a un lote de SU
-- organización (mismo patrón que el trigger same-org de apu_components).
CREATE OR REPLACE FUNCTION app.check_rpo_batch_same_org()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path = public, app AS $$
BEGIN
  IF NEW.import_batch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM price_observation_batches b
      WHERE b.id = NEW.import_batch_id
        AND b.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'import_batch_id must reference a batch of the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rpo_batch_same_org
  BEFORE INSERT OR UPDATE OF import_batch_id ON resource_price_observations
  FOR EACH ROW EXECUTE FUNCTION app.check_rpo_batch_same_org();

-- ===========================================================================
-- C. price_observation_bulk_actions — auditoría e idempotencia de la
--    aprobación/rechazo masivo. Mismo patrón de idempotencia que
--    price_monitor_runs: UNIQUE (organization_id, idempotency_key) ⇒ la doble
--    confirmación de la misma selección es un no-op detectable.
-- ===========================================================================

CREATE TABLE price_observation_bulk_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  action_type     text NOT NULL,
  import_batch_id uuid REFERENCES price_observation_batches (id) ON DELETE SET NULL,
  initiated_by    uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  selected_count  integer NOT NULL DEFAULT 0,
  succeeded_count integer NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT poba_action_type_valid CHECK (action_type IN ('approve', 'reject')),
  CONSTRAINT poba_counts_nonneg CHECK (
    selected_count >= 0 AND succeeded_count >= 0 AND skipped_count >= 0
  ),
  CONSTRAINT poba_org_idempotency_uq UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX poba_org_created_idx
  ON price_observation_bulk_actions (organization_id, created_at DESC);

-- DOWN
-- DROP TRIGGER IF EXISTS rpo_batch_same_org ON resource_price_observations;
-- DROP FUNCTION IF EXISTS app.check_rpo_batch_same_org();
-- DROP INDEX IF EXISTS rpo_import_batch_idx;
-- ALTER TABLE resource_price_observations DROP COLUMN IF EXISTS import_batch_id;
-- DROP TABLE IF EXISTS price_observation_bulk_actions;
-- DROP TABLE IF EXISTS price_observation_batches;
