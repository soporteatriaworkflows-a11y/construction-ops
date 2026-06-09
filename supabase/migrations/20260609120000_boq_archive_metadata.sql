-- Migration: metadata de archive reversible para capítulos e ítems BOQ (4E.2B).
-- Agent: agent-db-rls (autorado por el orquestador, aprobado por la usuaria).
-- Contrato: docs/BOQ_DELETE_ARCHIVE_CONTRACT.md.
--
-- Soft-archive NO destructivo: añade `archived_at`/`archived_by` (nullable) a
-- `chapters` y `boq_items`. Un valor no nulo de `archived_at` retira el nodo de
-- la vista activa y de los cálculos/exports SIN borrar datos. `archived_by`
-- referencia `profiles(id)` (ON DELETE SET NULL) y lo fija el backend desde la
-- identidad autenticada (nunca el navegador).
--
-- Índices PARCIALES `WHERE archived_at IS NULL` para acelerar las lecturas
-- activas (las más frecuentes). Sin DROP, sin DELETE, sin pérdida de datos.
--
-- RLS: NO se modifica. Las policies `chapters_update`/`boq_items_update`
-- (mig. 20260530091000) ya permiten UPDATE solo en versión NO bloqueada y de la
-- misma organización ⇒ archive/restore (un UPDATE de columnas) queda cubierto, y
-- una versión emitida (locked) NO admite archive/restore (inmutabilidad en DB).
--
-- UP

ALTER TABLE public.chapters
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.boq_items
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

-- Lecturas activas (vista por defecto): solo nodos no archivados.
CREATE INDEX chapters_active_version_sort_idx
  ON public.chapters (estimate_version_id, sort_order)
  WHERE archived_at IS NULL;

CREATE INDEX boq_items_active_chapter_sort_idx
  ON public.boq_items (chapter_id, sort_order)
  WHERE archived_at IS NULL;

-- DOWN (rollback local)
-- DROP INDEX IF EXISTS public.boq_items_active_chapter_sort_idx;
-- DROP INDEX IF EXISTS public.chapters_active_version_sort_idx;
-- ALTER TABLE public.boq_items DROP COLUMN IF EXISTS archived_by;
-- ALTER TABLE public.boq_items DROP COLUMN IF EXISTS archived_at;
-- ALTER TABLE public.chapters DROP COLUMN IF EXISTS archived_by;
-- ALTER TABLE public.chapters DROP COLUMN IF EXISTS archived_at;
