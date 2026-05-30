# Solicitudes de integración entre agentes

Formato:
Agente solicitante | Archivo o contrato que necesita | Agente responsable | Estado

## Solicitudes

| Solicitante | Archivo / necesidad | Responsable | Estado |
|---|---|---|---|
| agent-excel-mapper | Permiso de **ejecución de Node/Vitest sobre `private/`** para confirmar la regresión empíricamente. | agent-orchestrator | ✅ RESUELTO (2026-05-30, Fase 1) — El orquestador ejecutó `gm:dump`, `gm:build-fixture`, `gm:regression` (22/22 PASS) y `gm:import` (todas PASS) sobre el Excel real. Coordenadas de los 9 valores confirmadas (EXCEL_MAPPING §10). 9/9 valores **empíricos** ±0.01 COP. |
| agent-excel-mapper | (Opcional) Exponer scripts `gm:dump`, `gm:regression`, `gm:import` en `package.json` raíz. | agent-orchestrator | ✅ RESUELTO (2026-05-30) — Añadidos `gm:dump`, `gm:build-fixture`, `gm:regression`, `gm:import` al `package.json` raíz + `tsx` (devDep). |
| agent-excel-mapper | (Aviso) Tras confirmar el fixture sanitizado, evaluar el retiro de `.worktreeinclude`. | agent-orchestrator | ✅ RESUELTO (2026-05-30, Fase 6) — `.worktreeinclude` ELIMINADO en `integration/wave-1`. El fixture sanitizado fila-por-fila es suficiente; Oleada 2 consume el fixture, no el Excel. `private/` sigue ignorado. |
