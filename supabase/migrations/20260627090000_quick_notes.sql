-- 20260627090000_quick_notes.sql
-- ICONIC_OPS_V5_4_2A_QUICK_NOTES_MIGRATION_RLS
--
-- Notas rápidas internas reales (dashboard). Estrictamente ADITIVA: crea la tabla
-- quick_notes + RLS (org-scoped, rol-gated, archive-only). No toca tablas/policies
-- existentes. NO se aplica a Supabase remoto en esta fase (db push manual/controlado).
--
-- Privacidad: las notas son INTERNAS. `client` NO es un rol de DB (profiles.role ∈
-- admin/gerencia/presupuestos/obra/compras/consulta); el acceso se acota por
-- organización + rol. La capa de app/read-model añade defensa para ViewerRole='client'.
--
-- Helpers reutilizados (ya existentes): app.current_org(), app.current_role(),
-- app._auth_uid() (= profiles.id), app.set_updated_at().

-- ── Tabla ─────────────────────────────────────────────────────────────────────
CREATE TABLE quick_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects (id) ON DELETE CASCADE,
  estimate_id      uuid REFERENCES estimates (id) ON DELETE CASCADE,
  body             text NOT NULL,
  status           text NOT NULL DEFAULT 'active',
  created_by       uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz,
  archived_by      uuid REFERENCES profiles (id) ON DELETE SET NULL,
  CONSTRAINT quick_notes_status_valid CHECK (status IN ('active', 'archived')),
  CONSTRAINT quick_notes_body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  -- active ⇒ archived_at NULL ; archived ⇒ archived_at NOT NULL (consistencia de estado)
  CONSTRAINT quick_notes_archived_consistency CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

-- Índice parcial para el listado del dashboard (activas por org, recientes primero).
CREATE INDEX quick_notes_org_active_idx
  ON quick_notes (organization_id, created_at DESC)
  WHERE status = 'active';

-- updated_at automático (mismo trigger que el resto del schema).
CREATE TRIGGER quick_notes_set_updated_at
  BEFORE UPDATE ON quick_notes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── Hardening pre-merge ────────────────────────────────────────────────────────
-- Helper STABLE: ¿el estimate pertenece a la org actual? (estimates→project_scopes→
-- projects). Espejo de app.estimate_version_in_org. Cierra el riesgo cross-org de estimate_id.
CREATE OR REPLACE FUNCTION app.estimate_in_org(p_estimate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM estimates e
    JOIN project_scopes ps ON ps.id = e.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE e.id = p_estimate_id
      AND p.organization_id = app.current_org()
  );
$$;

-- Archive-only: la única mutación permitida es archivar (active → archived). Ningún
-- UPDATE puede cambiar body ni campos de identidad/scope, ni desarchivar, ni tocar una
-- nota ya archivada. SECURITY INVOKER (default). Defensa DB independiente de repo/action.
CREATE OR REPLACE FUNCTION app.quick_notes_enforce_archive_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'quick_notes_immutable_when_archived' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'quick_notes_update_archive_only' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.estimate_id IS DISTINCT FROM OLD.estimate_id
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'quick_notes_only_archive_fields_mutable' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.archived_at IS NULL OR NEW.archived_by IS NULL THEN
    RAISE EXCEPTION 'quick_notes_archive_requires_archived_at_by' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Orden de BEFORE UPDATE (alfabético): archive_only valida ANTES que set_updated_at.
CREATE TRIGGER quick_notes_archive_only
  BEFORE UPDATE ON quick_notes
  FOR EACH ROW EXECUTE FUNCTION app.quick_notes_enforce_archive_only();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE quick_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_notes FORCE ROW LEVEL SECURITY;

-- SELECT: solo miembros internos de la organización (org-scoped). Todos los roles DB
-- son internos (incl. consulta = lectura). `client` no es rol DB ⇒ no puede leer.
CREATE POLICY quick_notes_select_own_org ON quick_notes
  FOR SELECT
  USING (organization_id = app.current_org());

-- INSERT: org propia + autoría propia + rol operativo. `consulta` NO puede crear.
-- Si project_id no es null, debe pertenecer a la misma org (defensa cross-tenant).
-- estimate_id: la pertenencia a org es indirecta (estimates→project_scopes→projects);
-- se valida en una fase posterior cuando la UI use estimate_id (columna forward-compat).
CREATE POLICY quick_notes_insert_authorized ON quick_notes
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND created_by = (SELECT app._auth_uid())
    AND app.current_role() IN ('admin', 'gerencia', 'presupuestos', 'obra', 'compras')
    -- project_id (si viene) debe pertenecer a la org
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = project_id AND p.organization_id = app.current_org()
      )
    )
    -- estimate_id (si viene) debe pertenecer a la org (cierra cross-org)
    AND (estimate_id IS NULL OR app.estimate_in_org(estimate_id))
    -- si vienen ambos, el estimate debe colgar del mismo project_id (consistencia)
    AND (
      project_id IS NULL OR estimate_id IS NULL
      OR EXISTS (
        SELECT 1 FROM estimates e
        JOIN project_scopes ps ON ps.id = e.project_scope_id
        WHERE e.id = estimate_id AND ps.project_id = project_id
      )
    )
  );

-- UPDATE/archive: org propia + (creador O management). Sin edición libre por contrato:
-- el repository/server action de V5.4.2b limita la operación a ARCHIVE. RLS evita cross-org.
CREATE POLICY quick_notes_update_authorized ON quick_notes
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND (
      created_by = (SELECT app._auth_uid())
      OR app.current_role() IN ('admin', 'gerencia')
    )
  )
  WITH CHECK (organization_id = app.current_org());

-- DELETE: SIN policy ⇒ denegado por FORCE RLS. El borrado lógico es vía archive.
