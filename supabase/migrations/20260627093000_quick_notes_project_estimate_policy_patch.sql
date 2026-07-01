-- 20260627093000_quick_notes_project_estimate_policy_patch.sql
-- ICONIC_OPS_V5_4_2A_QUICK_NOTES_POLICY_PATCH_PROJECT_ESTIMATE_CONSISTENCY
--
-- Patch ADITIVO. NO edita la migración ya aplicada 20260627090000_quick_notes.sql.
-- Recrea la policy INSERT `quick_notes_insert_authorized` corrigiendo un defecto de
-- INTEGRIDAD INTRA-ORG (no una fuga cross-org) detectado por el harness RLS vivo contra
-- Supabase Cloud (30/31; único FAIL = consistencia project/estimate).
--
-- Causa raíz (column shadowing):
--   La subconsulta de consistencia usaba `project_id` SIN calificar. Como `project_scopes`
--   tiene su propia columna `project_id`, dentro del EXISTS el nombre se resolvía a
--   `ps.project_id` (tabla interna), NO a `quick_notes.project_id` (la NEW-row). El predicado
--   degeneraba en `ps.project_id = ps.project_id` (tautología) => el guard era un no-op:
--   se aceptaba una nota con `project_id` y un `estimate_id` de la MISMA org pero de OTRO
--   proyecto. Verificado en Cloud: forma sin calificar => TRUE (incorrecto); forma calificada
--   `ps.project_id = quick_notes.project_id` => FALSE (correcto).
--
-- Corrección:
--   Recrear la policy calificando explícitamente TODAS las referencias a columnas de la
--   fila objetivo dentro de subconsultas con `quick_notes.<col>`. Esto elimina la clase
--   entera de shadowing (no solo la línea afectada). No cambia el contrato de negocio.
--
-- Contrato preservado (documentado):
--   * organization_id = current_org (org propia).                    [sin cambios]
--   * created_by = auth uid propio.                                  [sin cambios]
--   * rol ∈ (admin, gerencia, presupuestos, obra, compras); consulta NO crea. [sin cambios]
--   * project_id no-null debe pertenecer a la org.                   [sin cambios, calificado]
--   * estimate_id no-null debe pertenecer a la org (estimate_in_org). [sin cambios, calificado]
--   * si vienen AMBOS, el estimate debe colgar del mismo project_id.  [CORREGIDO: ahora sí aplica]
--   * project_id NULL + estimate_id NOT NULL: PERMITIDO si el estimate es de la org. El
--     estimate ya implica su proyecto vía project_scopes; el contrato V5.4.2a admite notas
--     ligadas solo a estimate (columna forward-compat). Se mantiene explícitamente.
--
-- Estrictamente aditiva: solo DROP POLICY + CREATE POLICY sobre la MISMA policy de INSERT.
-- No toca tabla, columnas, triggers, otras policies, ni datos. RLS/FORCE ya están activos.
-- NO aplicada a Cloud en esta fase (db push manual/controlado posterior).

-- UP
DROP POLICY IF EXISTS quick_notes_insert_authorized ON public.quick_notes;

CREATE POLICY quick_notes_insert_authorized ON public.quick_notes
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND created_by = (SELECT app._auth_uid())
    AND app.current_role() IN ('admin', 'gerencia', 'presupuestos', 'obra', 'compras')
    -- project_id (si viene) debe pertenecer a la org
    AND (
      quick_notes.project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = quick_notes.project_id
          AND p.organization_id = app.current_org()
      )
    )
    -- estimate_id (si viene) debe pertenecer a la org (cierra cross-org)
    AND (quick_notes.estimate_id IS NULL OR app.estimate_in_org(quick_notes.estimate_id))
    -- si vienen ambos, el estimate debe colgar del mismo project_id (consistencia).
    -- CLAVE DEL PATCH: `quick_notes.project_id` calificado evita el shadowing con ps.project_id.
    AND (
      quick_notes.project_id IS NULL OR quick_notes.estimate_id IS NULL
      OR EXISTS (
        SELECT 1 FROM estimates e
        JOIN project_scopes ps ON ps.id = e.project_scope_id
        WHERE e.id = quick_notes.estimate_id
          AND ps.project_id = quick_notes.project_id
      )
    )
  );

-- DOWN
-- Revertir a la policy previa (con el defecto de shadowing) de 20260627090000_quick_notes.sql:
--   DROP POLICY IF EXISTS quick_notes_insert_authorized ON public.quick_notes;
--   CREATE POLICY quick_notes_insert_authorized ON public.quick_notes
--     FOR INSERT WITH CHECK ( ... ps.project_id = project_id ... );  -- (no recomendado)
