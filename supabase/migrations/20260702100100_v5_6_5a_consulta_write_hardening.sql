-- Migration: RLS — V5_6_5A_PROJECT_SCOPED_RLS_GAP_CLOSURE (parte 2/2: write hardening)
-- Agent: agent-orchestrator (a avalar por agent-db-rls).
-- Contrato: docs/design-references/V5_6_5_PROJECT_SCOPED_RLS_GAP_CLOSURE.md
-- Cierra la deuda V5_6_5_CONSULTA_WRITE_HARDENING (docs/OPEN_QUESTIONS.md).
--
-- Problema:
--   Muchas politicas de escritura son org-scoped SIN check de rol (por
--   ejemplo projects_update). Un usuario 'consulta' (cliente externo de solo
--   lectura) con JWT valido puede mutar datos via PostgREST directo:
--   proyectos, catalogo, presupuestos en draft, planning, etc. Ademas, la
--   policy profiles_update permite a CUALQUIER rol editar su propia fila,
--   INCLUYENDO profiles.role => auto-escalacion a admin.
--
-- Solucion (esta migracion, solo escrituras; SELECT en parte 1/2):
--   1) Dividir las politicas FOR ALL en select/insert/update/delete
--      conservando el predicado EXACTO actual, y agregar
--      NOT app.is_client_role() a las tres de escritura. supplier_products y
--      apu_components ademas niegan SELECT a cliente (catalogo/APU internos).
--   2) Agregar NOT app.is_client_role() a las politicas de escritura
--      existentes (INSERT: WITH CHECK; UPDATE: USING y WITH CHECK;
--      DELETE: USING), conservando intactos los guards de inmutabilidad
--      (estimate_version_locked, status NOT IN emitidos) y los EXISTS
--      cross-org actuales. Para roles internos nada cambia.
--   3) Trigger BEFORE UPDATE en profiles: cierra la auto-escalacion
--      "UPDATE profiles SET role='admin' WHERE id=self" que profiles_update
--      permitia a cualquier rol. Solo admin/gerencia pueden cambiar
--      role/organization_id por la API de datos, y gerencia nunca hacia/desde
--      admin (paridad con change_member_role). Las RPCs SECURITY DEFINER
--      (change_member_role, accept_invitation) NO se ven afectadas: corren
--      como su owner (current_user <> 'authenticated'), igual que migraciones
--      y seeds. El resto del perfil propio (full_name, etc.) sigue editable.
--
-- No tocadas (ya role-gated, excluyen consulta): quantity_workspace_*,
-- quantity_takeoff_*/import, quick_notes (insert/update), monitores
-- (pmt/pmr/pms), rpo, pob/poba, price_observations_update_approval,
-- profiles_insert/profiles_delete (admin), organization_invitations,
-- access_audit_log, project_access_grants (solo RPC).
--
-- UP

-- ===========================================================================
-- 1) Division de politicas FOR ALL (predicados identicos a 20260530091000)
-- ===========================================================================

-- project_scopes ------------------------------------------------------------
DROP POLICY project_scopes_all ON project_scopes;
CREATE POLICY project_scopes_select ON project_scopes
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_scopes.project_id
      AND p.organization_id = app.current_org()
  ));
CREATE POLICY project_scopes_insert ON project_scopes
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_scopes.project_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY project_scopes_update ON project_scopes
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_scopes.project_id
        AND p.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_scopes.project_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY project_scopes_delete ON project_scopes
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_scopes.project_id
        AND p.organization_id = app.current_org()
    )
  );

-- estimates -------------------------------------------------------------------
DROP POLICY estimates_all ON estimates;
CREATE POLICY estimates_select ON estimates
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM project_scopes ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.id = estimates.project_scope_id
      AND p.organization_id = app.current_org()
  ));
CREATE POLICY estimates_insert ON estimates
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = estimates.project_scope_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY estimates_update ON estimates
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = estimates.project_scope_id
        AND p.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = estimates.project_scope_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY estimates_delete ON estimates
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = estimates.project_scope_id
        AND p.organization_id = app.current_org()
    )
  );

-- quantity_groups -------------------------------------------------------------
DROP POLICY quantity_groups_all ON quantity_groups;
CREATE POLICY quantity_groups_select ON quantity_groups
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM project_scopes ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.id = quantity_groups.project_scope_id
      AND p.organization_id = app.current_org()
  ));
CREATE POLICY quantity_groups_insert ON quantity_groups
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = quantity_groups.project_scope_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY quantity_groups_update ON quantity_groups
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = quantity_groups.project_scope_id
        AND p.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = quantity_groups.project_scope_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY quantity_groups_delete ON quantity_groups
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM project_scopes ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.id = quantity_groups.project_scope_id
        AND p.organization_id = app.current_org()
    )
  );

-- quantity_lines --------------------------------------------------------------
DROP POLICY quantity_lines_all ON quantity_lines;
CREATE POLICY quantity_lines_select ON quantity_lines
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM quantity_groups qg
    JOIN project_scopes ps ON ps.id = qg.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE qg.id = quantity_lines.quantity_group_id
      AND p.organization_id = app.current_org()
  ));
CREATE POLICY quantity_lines_insert ON quantity_lines
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM quantity_groups qg
      JOIN project_scopes ps ON ps.id = qg.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE qg.id = quantity_lines.quantity_group_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY quantity_lines_update ON quantity_lines
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM quantity_groups qg
      JOIN project_scopes ps ON ps.id = qg.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE qg.id = quantity_lines.quantity_group_id
        AND p.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM quantity_groups qg
      JOIN project_scopes ps ON ps.id = qg.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE qg.id = quantity_lines.quantity_group_id
        AND p.organization_id = app.current_org()
    )
  );
CREATE POLICY quantity_lines_delete ON quantity_lines
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM quantity_groups qg
      JOIN project_scopes ps ON ps.id = qg.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE qg.id = quantity_lines.quantity_group_id
        AND p.organization_id = app.current_org()
    )
  );

-- supplier_products (catalogo interno: SELECT tambien denegado a cliente) -----
DROP POLICY supplier_products_all ON supplier_products;
CREATE POLICY supplier_products_select ON supplier_products
  FOR SELECT
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = supplier_products.supplier_id
        AND s.organization_id = app.current_org()
    )
  );
CREATE POLICY supplier_products_insert ON supplier_products
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = supplier_products.supplier_id
        AND s.organization_id = app.current_org()
    )
  );
CREATE POLICY supplier_products_update ON supplier_products
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = supplier_products.supplier_id
        AND s.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = supplier_products.supplier_id
        AND s.organization_id = app.current_org()
    )
  );
CREATE POLICY supplier_products_delete ON supplier_products
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = supplier_products.supplier_id
        AND s.organization_id = app.current_org()
    )
  );

-- apu_components (APU interno: SELECT tambien denegado a cliente) -------------
DROP POLICY apu_components_all ON apu_components;
CREATE POLICY apu_components_select ON apu_components
  FOR SELECT
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM apu_templates a
      WHERE a.id = apu_components.apu_template_id
        AND a.organization_id = app.current_org()
    )
  );
CREATE POLICY apu_components_insert ON apu_components
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM apu_templates a
      WHERE a.id = apu_components.apu_template_id
        AND a.organization_id = app.current_org()
    )
  );
CREATE POLICY apu_components_update ON apu_components
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM apu_templates a
      WHERE a.id = apu_components.apu_template_id
        AND a.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM apu_templates a
      WHERE a.id = apu_components.apu_template_id
        AND a.organization_id = app.current_org()
    )
  );
CREATE POLICY apu_components_delete ON apu_components
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM apu_templates a
      WHERE a.id = apu_components.apu_template_id
        AND a.organization_id = app.current_org()
    )
  );

-- ===========================================================================
-- 2) Guard NOT app.is_client_role() en politicas de escritura existentes
-- ===========================================================================

-- organizations ---------------------------------------------------------------
DROP POLICY organizations_update ON organizations;
CREATE POLICY organizations_update ON organizations
  FOR UPDATE
  USING (id = app.current_org() AND NOT app.is_client_role())
  WITH CHECK (id = app.current_org() AND NOT app.is_client_role());

-- projects ----------------------------------------------------------------------
DROP POLICY projects_insert ON projects;
CREATE POLICY projects_insert ON projects
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY projects_update ON projects;
CREATE POLICY projects_update ON projects
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY projects_delete ON projects;
CREATE POLICY projects_delete ON projects
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- resources ---------------------------------------------------------------------
DROP POLICY resources_insert ON resources;
CREATE POLICY resources_insert ON resources
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY resources_update ON resources;
CREATE POLICY resources_update ON resources
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY resources_delete ON resources;
CREATE POLICY resources_delete ON resources
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- suppliers ----------------------------------------------------------------------
DROP POLICY suppliers_insert ON suppliers;
CREATE POLICY suppliers_insert ON suppliers
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY suppliers_update ON suppliers;
CREATE POLICY suppliers_update ON suppliers
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY suppliers_delete ON suppliers;
CREATE POLICY suppliers_delete ON suppliers
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- pricing_rules -------------------------------------------------------------------
DROP POLICY pricing_rules_insert ON pricing_rules;
CREATE POLICY pricing_rules_insert ON pricing_rules
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY pricing_rules_update ON pricing_rules;
CREATE POLICY pricing_rules_update ON pricing_rules
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY pricing_rules_delete ON pricing_rules;
CREATE POLICY pricing_rules_delete ON pricing_rules
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- labor_roles ------------------------------------------------------------------
DROP POLICY labor_roles_insert ON labor_roles;
CREATE POLICY labor_roles_insert ON labor_roles
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY labor_roles_update ON labor_roles;
CREATE POLICY labor_roles_update ON labor_roles
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY labor_roles_delete ON labor_roles;
CREATE POLICY labor_roles_delete ON labor_roles
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- apu_templates ---------------------------------------------------------------
DROP POLICY apu_templates_insert ON apu_templates;
CREATE POLICY apu_templates_insert ON apu_templates
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY apu_templates_update ON apu_templates;
CREATE POLICY apu_templates_update ON apu_templates
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );
DROP POLICY apu_templates_delete ON apu_templates;
CREATE POLICY apu_templates_delete ON apu_templates
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- estimate_versions (guards de inmutabilidad INTACTOS) --------------------------
DROP POLICY estimate_versions_insert ON estimate_versions;
CREATE POLICY estimate_versions_insert ON estimate_versions
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM estimates e
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE e.id = estimate_versions.estimate_id
        AND p.organization_id = app.current_org()
    )
  );
DROP POLICY estimate_versions_update ON estimate_versions;
CREATE POLICY estimate_versions_update ON estimate_versions
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND status NOT IN ('approved','issued','archived')
    AND EXISTS (
      SELECT 1 FROM estimates e
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE e.id = estimate_versions.estimate_id
        AND p.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM estimates e
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE e.id = estimate_versions.estimate_id
        AND p.organization_id = app.current_org()
    )
  );
DROP POLICY estimate_versions_delete ON estimate_versions;
CREATE POLICY estimate_versions_delete ON estimate_versions
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND status NOT IN ('approved','issued','archived')
    AND EXISTS (
      SELECT 1 FROM estimates e
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE e.id = estimate_versions.estimate_id
        AND p.organization_id = app.current_org()
    )
  );

-- chapters (estimate_version_in_org + estimate_version_locked INTACTOS) --------
DROP POLICY chapters_insert ON chapters;
CREATE POLICY chapters_insert ON chapters
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
DROP POLICY chapters_update ON chapters;
CREATE POLICY chapters_update ON chapters
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
DROP POLICY chapters_delete ON chapters;
CREATE POLICY chapters_delete ON chapters
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );

-- boq_items ---------------------------------------------------------------------
DROP POLICY boq_items_insert ON boq_items;
CREATE POLICY boq_items_insert ON boq_items
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
DROP POLICY boq_items_update ON boq_items;
CREATE POLICY boq_items_update ON boq_items
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
DROP POLICY boq_items_delete ON boq_items;
CREATE POLICY boq_items_delete ON boq_items
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );

-- indirect_cost_rules -------------------------------------------------------------
DROP POLICY indirect_cost_rules_insert ON indirect_cost_rules;
CREATE POLICY indirect_cost_rules_insert ON indirect_cost_rules
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
DROP POLICY indirect_cost_rules_update ON indirect_cost_rules;
CREATE POLICY indirect_cost_rules_update ON indirect_cost_rules
  FOR UPDATE
  USING (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  )
  WITH CHECK (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
DROP POLICY indirect_cost_rules_delete ON indirect_cost_rules;
CREATE POLICY indirect_cost_rules_delete ON indirect_cost_rules
  FOR DELETE
  USING (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );

-- apu_calculation_snapshots (sigue sin UPDATE/DELETE: inmutable) ------------------
DROP POLICY apu_calc_snapshots_insert ON apu_calculation_snapshots;
CREATE POLICY apu_calc_snapshots_insert ON apu_calculation_snapshots
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND app.estimate_version_in_org(estimate_version_id)
  );

-- price_observations (append-only; _update_approval ya es admin/gerencia) ---------
DROP POLICY price_observations_insert ON price_observations;
CREATE POLICY price_observations_insert ON price_observations
  FOR INSERT
  WITH CHECK (
    NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM supplier_products sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.id = price_observations.supplier_product_id
        AND s.organization_id = app.current_org()
    )
  );

-- schedule_tasks -------------------------------------------------------------------
DROP POLICY schedule_tasks_insert ON schedule_tasks;
CREATE POLICY schedule_tasks_insert ON schedule_tasks
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = schedule_tasks.project_id
        AND p.organization_id = app.current_org()
    )
  );
DROP POLICY schedule_tasks_update ON schedule_tasks;
CREATE POLICY schedule_tasks_update ON schedule_tasks
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = schedule_tasks.project_id
        AND p.organization_id = app.current_org()
    )
  );
DROP POLICY schedule_tasks_delete ON schedule_tasks;
CREATE POLICY schedule_tasks_delete ON schedule_tasks
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- task_dependencies -----------------------------------------------------------------
DROP POLICY task_dependencies_insert ON task_dependencies;
CREATE POLICY task_dependencies_insert ON task_dependencies
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.predecessor_task_id
        AND t.organization_id = app.current_org()
    )
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.successor_task_id
        AND t.organization_id = app.current_org()
    )
  );
DROP POLICY task_dependencies_update ON task_dependencies;
CREATE POLICY task_dependencies_update ON task_dependencies
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.predecessor_task_id
        AND t.organization_id = app.current_org()
    )
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = task_dependencies.successor_task_id
        AND t.organization_id = app.current_org()
    )
  );
DROP POLICY task_dependencies_delete ON task_dependencies;
CREATE POLICY task_dependencies_delete ON task_dependencies
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- progress_entries (append-only: sigue sin UPDATE/DELETE) ---------------------------
DROP POLICY progress_entries_insert ON progress_entries;
CREATE POLICY progress_entries_insert ON progress_entries
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = progress_entries.task_id
        AND t.organization_id = app.current_org()
    )
  );

-- resource_assignments ---------------------------------------------------------------
DROP POLICY resource_assignments_insert ON resource_assignments;
CREATE POLICY resource_assignments_insert ON resource_assignments
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = resource_assignments.task_id
        AND t.organization_id = app.current_org()
    )
  );
DROP POLICY resource_assignments_update ON resource_assignments;
CREATE POLICY resource_assignments_update ON resource_assignments
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM schedule_tasks t
      WHERE t.id = resource_assignments.task_id
        AND t.organization_id = app.current_org()
    )
  );
DROP POLICY resource_assignments_delete ON resource_assignments;
CREATE POLICY resource_assignments_delete ON resource_assignments
  FOR DELETE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  );

-- planning_schedules (sigue sin DELETE: se archiva, no se borra) --------------------
DROP POLICY planning_schedules_insert ON planning_schedules;
CREATE POLICY planning_schedules_insert ON planning_schedules
  FOR INSERT
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = planning_schedules.project_id
        AND p.organization_id = app.current_org()
    )
    AND EXISTS (
      SELECT 1
      FROM estimate_versions ev
      JOIN estimates e          ON e.id = ev.estimate_id
      JOIN project_scopes ps    ON ps.id = e.project_scope_id
      JOIN projects p2          ON p2.id = ps.project_id
      WHERE ev.id = planning_schedules.estimate_version_id
        AND p2.organization_id = app.current_org()
    )
  );
DROP POLICY planning_schedules_update ON planning_schedules;
CREATE POLICY planning_schedules_update ON planning_schedules
  FOR UPDATE
  USING (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
  )
  WITH CHECK (
    organization_id = app.current_org()
    AND NOT app.is_client_role()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = planning_schedules.project_id
        AND p.organization_id = app.current_org()
    )
  );

-- ===========================================================================
-- 3) profiles: guard anti-escalacion de columnas privilegiadas
-- ===========================================================================
-- Cierra la auto-escalacion "UPDATE profiles SET role='admin' WHERE id=self"
-- que la policy profiles_update (WITH CHECK: admin O fila propia) permitia a
-- CUALQUIER rol via PostgREST. Solo aplica a mutaciones por la API de datos
-- (rol authenticated). Migraciones, seeds y RPCs SECURITY DEFINER
-- (change_member_role, accept_invitation) corren como su owner
-- (current_user <> 'authenticated') y NO pasan por este guard; el propio
-- change_member_role ya valida actor admin/gerencia y anti-escalacion.
CREATE OR REPLACE FUNCTION app.profiles_guard_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF COALESCE(app.current_role(), '') NOT IN ('admin','gerencia') THEN
      RAISE EXCEPTION 'profiles_privileged_cols_admin_only' USING ERRCODE = '42501';
    END IF;
    IF app.current_role() = 'gerencia'
       AND (NEW.role = 'admin' OR OLD.role = 'admin') THEN
      RAISE EXCEPTION 'profiles_gerencia_cannot_touch_admin' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_guard_privileged_cols
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION app.profiles_guard_privileged_cols();

-- DOWN
-- DROP TRIGGER IF EXISTS profiles_guard_privileged_cols ON profiles;
-- DROP FUNCTION IF EXISTS app.profiles_guard_privileged_cols();
-- Recrear las politicas de escritura previas SIN el guard NOT app.is_client_role()
-- (ver 20260530091000, 20260531100100, 20260622090100) y restaurar las FOR ALL:
--   DROP POLICY project_scopes_select/insert/update/delete ON project_scopes;
--   CREATE POLICY project_scopes_all ON project_scopes FOR ALL USING (...) WITH CHECK (...);
--   (idem estimates_all, quantity_groups_all, quantity_lines_all,
--    supplier_products_all, apu_components_all)
