-- Migration: project_scopes authorship — description + created_by (Oleada 4B.2)
-- Agent: agent-db-rls (autorado por el orquestador, integración 4B.2).
-- Contrato: docs/SCOPES_CRUD_CONTRACT.md §2.
--
-- Agrega a `project_scopes` dos columnas para el vertical slice real de alcances:
--   * description: descripción libre (opcional, ≤ 2000 chars validado en app).
--   * created_by:  autor del alcance (FK profiles, nullable, ON DELETE SET NULL
--                  para preservar historial al borrar un perfil).
-- Índice en created_by (toda FK lleva índice).
--
-- Espejo exacto de 20260602120000_projects_authorship (mismo patrón aditivo y
-- reversible). NO se alteran las políticas RLS existentes de `project_scopes`: el
-- aislamiento por organización (migración 20260530091000, policy
-- `project_scopes_all` vía el proyecto padre) ya cubre SELECT/INSERT/UPDATE/DELETE.
-- created_by se setea server-side (= viewer.profileId); no se endurece la política
-- de INSERT para exigirlo (decisión: opcional en 4B.2; documentado en el contrato).
--
-- UP

ALTER TABLE project_scopes
  ADD COLUMN description text,
  ADD COLUMN created_by  uuid REFERENCES profiles (id) ON DELETE SET NULL;

CREATE INDEX project_scopes_created_by_idx ON project_scopes (created_by);

-- DOWN
-- DROP INDEX IF EXISTS project_scopes_created_by_idx;
-- ALTER TABLE project_scopes DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE project_scopes DROP COLUMN IF EXISTS description;
