# Construction Ops — Claude Code Entry Point

Antes de realizar cualquier acción:

1. Lee `docs/PROJECT_MASTER.md` completo.
2. Lee `docs/HANDOFF_LOG.md`.
3. Lee `docs/DECISIONS.md`.
4. Lee `docs/OPEN_QUESTIONS.md`.
5. Revisa `git status`.
6. No copies código AGPL de OpenConstructionERP.
7. No instales `ag-grid-enterprise`.
8. No expongas descuentos internos en exportaciones para clientes.
9. No modifiques presupuestos emitidos retroactivamente.
10. Mantén una sola fuente de verdad para cálculos financieros.
11. Registra cambios y handoff al finalizar.
12. No incluyas `private/` ni archivos Excel reales dentro de Git.
13. Antes de editar archivos compartidos, escala a `agent-orchestrator`.

---

## Mapa rápido de agentes

Los agentes vivos están en `.claude/agents/`. El registro maestro está en
`docs/AGENT_REGISTRY.md`.

| Agente | Oleada |
|--------|--------|
| agent-orchestrator | 0 |
| agent-db-rls | 1 |
| agent-excel-mapper | 1 |
| agent-frontend-boq | 1 |
| agent-cost-domain | 2 |
| agent-pricing | 2 |
| agent-homecenter | 2 |
| agent-dashboard | 3 |
| agent-planning | 3 |
| agent-exports | 3 |
| agent-qa | 4 |

Para activar agentes, usa `agent-orchestrator` como punto de entrada.
Los agentes especializados se ejecutan en aislamiento (`isolation: worktree`),
salvo el orquestador.

---

## Documentos obligatorios

- `docs/PROJECT_MASTER.md` — visión, dominio, glosario, reglas de negocio.
- `docs/AGENT_REGISTRY.md` — matriz de agentes, ownership, oleadas.
- `docs/HANDOFF_LOG.md` — bitácora de sesiones.
- `docs/DECISIONS.md` — decisiones aprobadas.
- `docs/OPEN_QUESTIONS.md` — preguntas pendientes y blockers.
- `docs/INTEGRATION_REQUESTS.md` — solicitudes entre agentes.
- `docs/API_CONTRACTS.md` — contratos entre módulos.
- `docs/DATABASE_SCHEMA.md` — esquema vivo de PostgreSQL.
- `docs/EXCEL_MAPPING.md` — mapeo Excel ↔ base de datos.
- `docs/QA_REPORT.md` — reportes de QA y regresión.
- `docs/LICENSING.md` — licencias aprobadas y prohibidas.

---

## Reglas globales no negociables

1. Una sola fuente de verdad para cada cálculo financiero.
2. Snapshots emitidos son inmutables.
3. Versiones `issued`, `approved` y `archived` no se recalculan.
4. Descuentos internos no se exponen en endpoints para clientes.
5. RLS habilitado en toda tabla con datos por organización.
6. Sin `permissionMode: bypassPermissions` en ningún agente.
7. Sin `ag-grid-enterprise` ni dependencias AGPL.
8. Sin archivos privados en Git (`private/`, `*.xlsx`, `*.xls`, `.env`).
9. Pruebas unitarias y de regresión antes de cualquier merge.
10. Actualizar `docs/HANDOFF_LOG.md` al cierre de cada sesión.
