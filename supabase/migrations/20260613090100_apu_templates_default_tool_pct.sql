-- Migration: APU foundation — default_tool_pct en apu_templates.
-- Agent: agent-db-rls (autorado por el orquestador, FASE 4B.1).
-- Contrato: docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md §6.
--
-- Motivación: la herramienta menor derivada (X% del subtotal de M.O. del APU,
-- patrón del Excel Entre Patios) NO encaja en la fórmula canónica de
-- apu_components `qty × (1+waste) × price` (discovery B.4/I). Se congela en el
-- template como FRACCIÓN configurable [0,1] (0.05 = 5% de la M.O.); el dominio
-- la aplica como paso final del cálculo (`calculateApuUnitCostFull`). No se
-- crean filas `component_type='tool'` para herramienta derivada; las filas
-- tool EXPLÍCITAS existentes siguen funcionando con la regla canónica.
--
-- ADITIVA: DEFAULT 0 cubre todas las filas existentes sin backfill.
--
-- UP

ALTER TABLE apu_templates
  ADD COLUMN default_tool_pct numeric(20,10) NOT NULL DEFAULT 0,
  ADD CONSTRAINT apu_templates_tool_pct_range
    CHECK (default_tool_pct >= 0 AND default_tool_pct <= 1);

-- DOWN
-- ALTER TABLE apu_templates DROP CONSTRAINT IF EXISTS apu_templates_tool_pct_range;
-- ALTER TABLE apu_templates DROP COLUMN IF EXISTS default_tool_pct;
