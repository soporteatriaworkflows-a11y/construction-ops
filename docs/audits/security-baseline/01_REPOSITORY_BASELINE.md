# 01 — Baseline del Repositorio

## Estado al iniciar la auditoría

| Campo | Valor |
|---|---|
| Ruta raíz | `D:/ICONIC/SOFTWARE PRESUPUESTOS/construction-ops` |
| Remoto | `origin` = `github.com/soporteatriaworkflows-a11y/construction-ops.git` |
| Rama inicial | `main` |
| Commit (HEAD) | `7af91eade019885e94107cf12b7943adebdfa994` |
| Working tree | **Limpio** (`## main...origin/main`, sin cambios ni archivos sin rastrear) |
| Sincronía | `main == origin/main` |
| Rama de auditoría creada | `audit/security-baseline-construction-ops` (desde `7af91ea`) |

## Worktrees

- Principal: raíz `[main]`.
- Residual: `.claude/worktrees/agent-acc61fa6aec4fac2d` → `c9063ad`
  (`backup/wave4a-auth-ui`). Aislado y dentro de `.gitignore` (`.claude/worktrees/`).
  **No** afecta a `main`. (Finding L-02: housekeeping.)

## Ramas (resumen)

- 1 rama productiva: `main`.
- ~20 ramas `backup/*` (preservación de oleadas), `integration/*` (integraciones de
  oleadas), `continuation/*`, `fix/*`, `feature/*`. Históricas; no productivas.
  (Finding L-03: higiene de ramas — evaluar archivado/limpieza.)

## Decisión segura para continuar

El árbol estaba **limpio**, por lo que se creó la rama aislada de auditoría sin
riesgo de mezclar trabajo pendiente. **No** se hizo merge/rebase/checkout
destructivo, **no** se limpió el working tree, **no** se modificaron ramas previas.
Toda la documentación de auditoría se genera en
`docs/audits/security-baseline/` dentro de la rama aislada.

## Riesgos operativos detectados

- Acumulación de ramas históricas (bajo riesgo; confusión/superficie de revisión).
- Worktree residual de un agente (bajo riesgo; gitignored).
- Asset binario del Excel real en `private/` local (correctamente ignorado; ver
  Fase 3 / `05`).

## Comprobaciones de gobernanza

- `.gitattributes` presente: binarios (`*.png/*.pdf/*.xlsx/...`) marcados `binary`
  (evita corrupción CRLF y ruido de whitespace).
- `CLAUDE.md`, `AGENTS.md`, `docs/` extensos: gobernanza por agentes y contratos
  congelados (trazabilidad alta).
