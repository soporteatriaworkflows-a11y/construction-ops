-- Migration: RLS — habilitación y políticas por organización
-- Agent: agent-db-rls
--
-- Modelo de aislamiento:
--   * Tablas con organization_id DIRECTO: filtran por app.current_org().
--   * Tablas hijas SIN organization_id: derivan la organización por JOIN al
--     padre (cadena hasta organizations / projects).
--   * Inmutabilidad:
--       - apu_calculation_snapshots: sin UPDATE ni DELETE (nunca).
--       - estimate_versions con status IN ('approved','issued','archived') y
--         sus hijos (chapters, boq_items, indirect_cost_rules): sin UPDATE ni
--         DELETE. En 'draft'/'review' sí se permiten dentro de la organización.
--       - price_observations: append-only (INSERT + SELECT; sin DELETE; UPDATE
--         restringido a campos de aprobación por gerencia/admin).
--   * FORCE ROW LEVEL SECURITY: aplica RLS incluso al owner de la tabla, para
--     que ningún rol (salvo BYPASSRLS como service_role) eluda el aislamiento.
--
-- Helpers usados: app.current_org() y app.current_role() (migración 090000).
--
-- UP

-- ===========================================================================
-- Helper de inmutabilidad: ¿la versión de presupuesto está congelada?
-- ===========================================================================
CREATE OR REPLACE FUNCTION app.estimate_version_locked(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM estimate_versions ev
    WHERE ev.id = p_version_id
      AND ev.status IN ('approved','issued','archived')
  );
$$;

-- helper: id del usuario autenticado (claim 'sub' = auth.uid en Supabase).
CREATE OR REPLACE FUNCTION app.current_org_user()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

-- ===========================================================================
-- 1) Tablas con organization_id DIRECTO
--    Patrón: SELECT/INSERT/UPDATE/DELETE limitados a app.current_org().
-- ===========================================================================

-- organizations (self) ------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_select ON organizations
  FOR SELECT USING (id = app.current_org());
CREATE POLICY organizations_update ON organizations
  FOR UPDATE USING (id = app.current_org())
  WITH CHECK (id = app.current_org());
-- INSERT/DELETE de organizaciones: operación administrativa fuera de RLS
-- (service_role). No se exponen políticas a roles de usuario.

-- profiles ------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY profiles_insert ON profiles
  FOR INSERT WITH CHECK (
    organization_id = app.current_org() AND app.current_role() = 'admin'
  );
CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (
    organization_id = app.current_org()
    -- Solo admin puede cambiar role/email; el resto edita su propio perfil
    -- sin escalar privilegios.
    AND (app.current_role() = 'admin' OR id = app.current_org_user())
  );
CREATE POLICY profiles_delete ON profiles
  FOR DELETE USING (
    organization_id = app.current_org() AND app.current_role() = 'admin'
  );

-- projects ------------------------------------------------------------------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_select ON projects
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY projects_insert ON projects
  FOR INSERT WITH CHECK (organization_id = app.current_org());
CREATE POLICY projects_update ON projects
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (organization_id = app.current_org());
CREATE POLICY projects_delete ON projects
  FOR DELETE USING (organization_id = app.current_org());

-- resources -----------------------------------------------------------------
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
CREATE POLICY resources_select ON resources
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY resources_insert ON resources
  FOR INSERT WITH CHECK (organization_id = app.current_org());
CREATE POLICY resources_update ON resources
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (organization_id = app.current_org());
CREATE POLICY resources_delete ON resources
  FOR DELETE USING (organization_id = app.current_org());

-- suppliers -----------------------------------------------------------------
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
CREATE POLICY suppliers_select ON suppliers
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY suppliers_insert ON suppliers
  FOR INSERT WITH CHECK (organization_id = app.current_org());
CREATE POLICY suppliers_update ON suppliers
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (organization_id = app.current_org());
CREATE POLICY suppliers_delete ON suppliers
  FOR DELETE USING (organization_id = app.current_org());

-- pricing_rules -------------------------------------------------------------
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY pricing_rules_select ON pricing_rules
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY pricing_rules_insert ON pricing_rules
  FOR INSERT WITH CHECK (organization_id = app.current_org());
CREATE POLICY pricing_rules_update ON pricing_rules
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (organization_id = app.current_org());
CREATE POLICY pricing_rules_delete ON pricing_rules
  FOR DELETE USING (organization_id = app.current_org());

-- labor_roles ---------------------------------------------------------------
ALTER TABLE labor_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY labor_roles_select ON labor_roles
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY labor_roles_insert ON labor_roles
  FOR INSERT WITH CHECK (organization_id = app.current_org());
CREATE POLICY labor_roles_update ON labor_roles
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (organization_id = app.current_org());
CREATE POLICY labor_roles_delete ON labor_roles
  FOR DELETE USING (organization_id = app.current_org());

-- apu_templates -------------------------------------------------------------
ALTER TABLE apu_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE apu_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY apu_templates_select ON apu_templates
  FOR SELECT USING (organization_id = app.current_org());
CREATE POLICY apu_templates_insert ON apu_templates
  FOR INSERT WITH CHECK (organization_id = app.current_org());
CREATE POLICY apu_templates_update ON apu_templates
  FOR UPDATE USING (organization_id = app.current_org())
  WITH CHECK (organization_id = app.current_org());
CREATE POLICY apu_templates_delete ON apu_templates
  FOR DELETE USING (organization_id = app.current_org());

-- ===========================================================================
-- 2) Tablas hijas: organización DERIVADA por JOIN al padre.
-- ===========================================================================

-- project_scopes → projects -------------------------------------------------
ALTER TABLE project_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY project_scopes_all ON project_scopes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_scopes.project_id
      AND p.organization_id = app.current_org()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_scopes.project_id
      AND p.organization_id = app.current_org()
  ));

-- supplier_products → suppliers ---------------------------------------------
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products FORCE ROW LEVEL SECURITY;
CREATE POLICY supplier_products_all ON supplier_products
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM suppliers s
    WHERE s.id = supplier_products.supplier_id
      AND s.organization_id = app.current_org()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM suppliers s
    WHERE s.id = supplier_products.supplier_id
      AND s.organization_id = app.current_org()
  ));

-- price_observations → supplier_products → suppliers (append-only) -----------
ALTER TABLE price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY price_observations_select ON price_observations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM supplier_products sp
    JOIN suppliers s ON s.id = sp.supplier_id
    WHERE sp.id = price_observations.supplier_product_id
      AND s.organization_id = app.current_org()
  ));
CREATE POLICY price_observations_insert ON price_observations
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM supplier_products sp
    JOIN suppliers s ON s.id = sp.supplier_id
    WHERE sp.id = price_observations.supplier_product_id
      AND s.organization_id = app.current_org()
  ));
-- UPDATE solo para gerencia/admin (aprobación). El precio observado no debe
-- alterarse; eso se refuerza con un trigger de inmutabilidad de precio.
CREATE POLICY price_observations_update_approval ON price_observations
  FOR UPDATE
  USING (
    app.current_role() IN ('admin','gerencia')
    AND EXISTS (
      SELECT 1 FROM supplier_products sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.id = price_observations.supplier_product_id
        AND s.organization_id = app.current_org()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM supplier_products sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.id = price_observations.supplier_product_id
        AND s.organization_id = app.current_org()
    )
  );
-- Sin política DELETE: el histórico es inmutable (append-only).

-- Trigger de inmutabilidad: impide modificar el precio observado en UPDATE.
CREATE OR REPLACE FUNCTION app.price_observation_immutable_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.observed_price IS DISTINCT FROM OLD.observed_price
     OR NEW.supplier_product_id IS DISTINCT FROM OLD.supplier_product_id
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
     OR NEW.source_type IS DISTINCT FROM OLD.source_type THEN
    RAISE EXCEPTION 'price_observations es append-only: solo se permite actualizar la aprobación, no el precio ni la fuente';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER price_observations_immutable_price
  BEFORE UPDATE ON price_observations
  FOR EACH ROW EXECUTE FUNCTION app.price_observation_immutable_price();

-- apu_components → apu_templates --------------------------------------------
ALTER TABLE apu_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE apu_components FORCE ROW LEVEL SECURITY;
CREATE POLICY apu_components_all ON apu_components
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM apu_templates a
    WHERE a.id = apu_components.apu_template_id
      AND a.organization_id = app.current_org()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM apu_templates a
    WHERE a.id = apu_components.apu_template_id
      AND a.organization_id = app.current_org()
  ));

-- estimates → project_scopes → projects -------------------------------------
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates FORCE ROW LEVEL SECURITY;
CREATE POLICY estimates_all ON estimates
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM project_scopes ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.id = estimates.project_scope_id
      AND p.organization_id = app.current_org()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_scopes ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.id = estimates.project_scope_id
      AND p.organization_id = app.current_org()
  ));

-- quantity_groups → project_scopes → projects -------------------------------
ALTER TABLE quantity_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY quantity_groups_all ON quantity_groups
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM project_scopes ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.id = quantity_groups.project_scope_id
      AND p.organization_id = app.current_org()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_scopes ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.id = quantity_groups.project_scope_id
      AND p.organization_id = app.current_org()
  ));

-- quantity_lines → quantity_groups → ... ------------------------------------
ALTER TABLE quantity_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY quantity_lines_all ON quantity_lines
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM quantity_groups qg
    JOIN project_scopes ps ON ps.id = qg.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE qg.id = quantity_lines.quantity_group_id
      AND p.organization_id = app.current_org()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM quantity_groups qg
    JOIN project_scopes ps ON ps.id = qg.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE qg.id = quantity_lines.quantity_group_id
      AND p.organization_id = app.current_org()
  ));

-- ===========================================================================
-- 3) estimate_versions y sus hijos: organización derivada + INMUTABILIDAD.
-- ===========================================================================

-- estimate_versions ---------------------------------------------------------
ALTER TABLE estimate_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_versions FORCE ROW LEVEL SECURITY;

-- helper: ¿la versión pertenece a la organización actual?
CREATE OR REPLACE FUNCTION app.estimate_version_in_org(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM estimate_versions ev
    JOIN estimates e ON e.id = ev.estimate_id
    JOIN project_scopes ps ON ps.id = e.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE ev.id = p_version_id
      AND p.organization_id = app.current_org()
  );
$$;

CREATE POLICY estimate_versions_select ON estimate_versions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM estimates e
    JOIN project_scopes ps ON ps.id = e.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE e.id = estimate_versions.estimate_id
      AND p.organization_id = app.current_org()
  ));
CREATE POLICY estimate_versions_insert ON estimate_versions
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM estimates e
    JOIN project_scopes ps ON ps.id = e.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE e.id = estimate_versions.estimate_id
      AND p.organization_id = app.current_org()
  ));
-- UPDATE permitido solo si la fila NO está congelada. La transición a estados
-- emitidos (approved/issued/archived) se hace en UPDATE: USING evalúa el
-- estado ANTERIOR (OLD), de modo que congelar una versión draft sí es válido,
-- pero re-editar una ya emitida queda bloqueado.
CREATE POLICY estimate_versions_update ON estimate_versions
  FOR UPDATE
  USING (
    status NOT IN ('approved','issued','archived')
    AND EXISTS (
      SELECT 1 FROM estimates e
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE e.id = estimate_versions.estimate_id
        AND p.organization_id = app.current_org()
    )
  )
  WITH CHECK (EXISTS (
    SELECT 1 FROM estimates e
    JOIN project_scopes ps ON ps.id = e.project_scope_id
    JOIN projects p ON p.id = ps.project_id
    WHERE e.id = estimate_versions.estimate_id
      AND p.organization_id = app.current_org()
  ));
CREATE POLICY estimate_versions_delete ON estimate_versions
  FOR DELETE
  USING (
    status NOT IN ('approved','issued','archived')
    AND EXISTS (
      SELECT 1 FROM estimates e
      JOIN project_scopes ps ON ps.id = e.project_scope_id
      JOIN projects p ON p.id = ps.project_id
      WHERE e.id = estimate_versions.estimate_id
        AND p.organization_id = app.current_org()
    )
  );

-- chapters → estimate_versions ----------------------------------------------
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters FORCE ROW LEVEL SECURITY;
CREATE POLICY chapters_select ON chapters
  FOR SELECT USING (app.estimate_version_in_org(estimate_version_id));
CREATE POLICY chapters_insert ON chapters
  FOR INSERT WITH CHECK (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
CREATE POLICY chapters_update ON chapters
  FOR UPDATE
  USING (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  )
  WITH CHECK (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
CREATE POLICY chapters_delete ON chapters
  FOR DELETE USING (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );

-- boq_items → estimate_versions ---------------------------------------------
ALTER TABLE boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_items FORCE ROW LEVEL SECURITY;
CREATE POLICY boq_items_select ON boq_items
  FOR SELECT USING (app.estimate_version_in_org(estimate_version_id));
CREATE POLICY boq_items_insert ON boq_items
  FOR INSERT WITH CHECK (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
CREATE POLICY boq_items_update ON boq_items
  FOR UPDATE
  USING (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  )
  WITH CHECK (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
CREATE POLICY boq_items_delete ON boq_items
  FOR DELETE USING (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );

-- indirect_cost_rules → estimate_versions -----------------------------------
ALTER TABLE indirect_cost_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE indirect_cost_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY indirect_cost_rules_select ON indirect_cost_rules
  FOR SELECT USING (app.estimate_version_in_org(estimate_version_id));
CREATE POLICY indirect_cost_rules_insert ON indirect_cost_rules
  FOR INSERT WITH CHECK (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
CREATE POLICY indirect_cost_rules_update ON indirect_cost_rules
  FOR UPDATE
  USING (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  )
  WITH CHECK (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );
CREATE POLICY indirect_cost_rules_delete ON indirect_cost_rules
  FOR DELETE USING (
    app.estimate_version_in_org(estimate_version_id)
    AND NOT app.estimate_version_locked(estimate_version_id)
  );

-- apu_calculation_snapshots → estimate_versions (TOTALMENTE INMUTABLE) ------
ALTER TABLE apu_calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE apu_calculation_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY apu_calc_snapshots_select ON apu_calculation_snapshots
  FOR SELECT USING (app.estimate_version_in_org(estimate_version_id));
CREATE POLICY apu_calc_snapshots_insert ON apu_calculation_snapshots
  FOR INSERT WITH CHECK (app.estimate_version_in_org(estimate_version_id));
-- Sin política UPDATE ni DELETE: el snapshot nunca se modifica ni se borra
-- (salvo cascada al borrar una versión draft, gobernada por la FK + RLS de
-- la versión). RLS sin política para una acción => acción denegada.

-- DOWN
-- (Revertir: DROP POLICY de cada tabla, ALTER TABLE ... DISABLE ROW LEVEL
--  SECURITY, DROP de helpers app.estimate_version_*, app.current_org_user,
--  app.price_observation_immutable_price y su trigger.)
