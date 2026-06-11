-- Migration: PRICE MONITORING AGENT V1 — targets, runs y results del monitor.
-- Agent: agent-db-rls (vía agent-orchestrator, Fase 4A)
-- Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §4
--
-- Aditiva. No modifica tablas existentes. Sin backfill. Sin seeds.
-- Las observaciones que crea el monitor viven en resource_price_observations
-- (Fase 3A) sin cambios de esquema.
--
-- UP

-- ===========================================================================
-- A. price_monitor_targets — fuentes habilitadas explícitamente.
-- ===========================================================================

CREATE TABLE price_monitor_targets (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  resource_id             uuid NOT NULL REFERENCES resources (id) ON DELETE RESTRICT,
  supplier_id             uuid REFERENCES suppliers (id) ON DELETE SET NULL,
  source_url              text NOT NULL,
  cadence_days            integer NOT NULL DEFAULT 7,
  enabled                 boolean NOT NULL DEFAULT true,
  last_checked_at         timestamptz,
  next_check_at           timestamptz NOT NULL DEFAULT now(),
  last_success_at         timestamptz,
  consecutive_failures    integer NOT NULL DEFAULT 0,
  baseline_observation_id uuid REFERENCES resource_price_observations (id) ON DELETE SET NULL,
  created_by              uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pmt_cadence_valid CHECK (cadence_days IN (1, 7, 15, 30)),
  CONSTRAINT pmt_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT pmt_failures_nonneg CHECK (consecutive_failures >= 0),
  -- Un target por organización + recurso + URL (mandato Fase 4A).
  CONSTRAINT pmt_org_resource_url_uq UNIQUE (organization_id, resource_id, source_url)
);

CREATE INDEX pmt_org_idx ON price_monitor_targets (organization_id);

-- Selección de vencidas del cron: enabled ∧ next_check_at <= now().
CREATE INDEX pmt_due_idx ON price_monitor_targets (next_check_at)
  WHERE enabled;

CREATE INDEX pmt_resource_idx ON price_monitor_targets (resource_id);

-- ===========================================================================
-- B. price_monitor_runs — corridas TENANT-SCOPED (una por org y ventana).
-- ===========================================================================

CREATE TABLE price_monitor_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  trigger_type    text NOT NULL,
  status          text NOT NULL DEFAULT 'running',
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  counters        jsonb NOT NULL DEFAULT '{}'::jsonb,
  initiated_by    uuid REFERENCES profiles (id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  error_summary   text,

  CONSTRAINT pmr_trigger_valid CHECK (trigger_type IN ('scheduled', 'manual')),
  CONSTRAINT pmr_status_valid CHECK (
    status IN ('running', 'completed', 'partial', 'failed')
  ),
  -- Idempotencia: el cron usa scheduled:<YYYY-MM-DD>; doble invocación en la
  -- misma ventana diaria = violación de unicidad = no-op para esa org.
  CONSTRAINT pmr_org_idempotency_uq UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX pmr_org_started_idx ON price_monitor_runs (organization_id, started_at DESC);
CREATE INDEX pmr_status_idx ON price_monitor_runs (status) WHERE status = 'running';

-- ===========================================================================
-- C. price_monitor_results — resultado por target y corrida.
-- ===========================================================================

CREATE TABLE price_monitor_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  run_id          uuid NOT NULL REFERENCES price_monitor_runs (id) ON DELETE CASCADE,
  target_id       uuid NOT NULL REFERENCES price_monitor_targets (id) ON DELETE CASCADE,
  status          text NOT NULL,
  detected_price  numeric(20,10),
  currency        text,
  -- Unidad RAW detectada en la fuente (sin normalizar; la comparación usa la
  -- unidad canónica en aplicación — UNIT_ALIAS_NORMALIZATION_V1).
  unit            text,
  warnings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  observation_id  uuid REFERENCES resource_price_observations (id) ON DELETE SET NULL,
  checked_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pms_status_valid CHECK (
    status IN (
      'unchanged', 'changed', 'pending_created',
      'unreachable', 'blocked', 'parse_failed', 'invalid_response'
    )
  ),
  CONSTRAINT pms_price_nonneg CHECK (detected_price IS NULL OR detected_price >= 0),
  CONSTRAINT pms_currency_iso CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
);

CREATE INDEX pms_org_checked_idx ON price_monitor_results (organization_id, checked_at DESC);
CREATE INDEX pms_run_idx ON price_monitor_results (run_id);
CREATE INDEX pms_target_checked_idx ON price_monitor_results (target_id, checked_at DESC);

-- DOWN
-- DROP TABLE IF EXISTS price_monitor_results;
-- DROP TABLE IF EXISTS price_monitor_runs;
-- DROP TABLE IF EXISTS price_monitor_targets;
