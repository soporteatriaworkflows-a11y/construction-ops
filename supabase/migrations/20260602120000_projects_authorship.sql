-- Migration: projects authorship — description + created_by (Oleada 4B.1)
-- Agent: agent-db-rls
-- Contrato: docs/PROJECTS_CRUD_CONTRACT.md §2 (CONGELADO v1).
--
-- Agrega a `projects` dos columnas para el vertical slice real de proyectos:
--   * description: descripción libre (opcional, ≤ 2000 chars validado en app).
--   * created_by:  autor del proyecto (FK profiles, nullable, ON DELETE SET NULL
--                  para preservar historial al borrar un perfil).
-- Índice en created_by (toda FK lleva índice).
--
-- NO se alteran las políticas RLS existentes de `projects`: el aislamiento por
-- organization_id (migración 20260530091000) ya cubre SELECT/INSERT/UPDATE/DELETE.
-- created_by se setea server-side (= viewer.profileId); no se endurece la política
-- de INSERT para exigirlo (decisión: opcional en 4B.1; documentado en el contrato).
--
-- UP

ALTER TABLE projects
  ADD COLUMN description text,
  ADD COLUMN created_by  uuid REFERENCES profiles (id) ON DELETE SET NULL;

CREATE INDEX projects_created_by_idx ON projects (created_by);

-- DOWN
-- DROP INDEX IF EXISTS projects_created_by_idx;
-- ALTER TABLE projects DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE projects DROP COLUMN IF EXISTS description;
