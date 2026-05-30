# Solicitudes de integración entre agentes

Formato:
Agente solicitante | Archivo o contrato que necesita | Agente responsable | Estado

## Solicitudes

| Solicitante | Archivo / necesidad | Responsable | Estado |
|---|---|---|---|
| agent-excel-mapper | Permiso de **ejecución de Node/Vitest sobre `private/`** en el worktree aislado. En esta sesión la herramienta Bash fue denegada para ejecutar `node`, `pnpm exec vitest` y el dump del Excel; sin ejecución no se pudo: (a) volcar coordenadas reales con `dump-workbook.mjs`, (b) correr la regresión Vitest, (c) ejecutar el importador. Los entregables fueron escritos y la regresión fue verificada analíticamente (las 9 cifras de §3.4 son autoconsistentes). Se requiere que el orquestador o una sesión con Bash habilitado ejecute los comandos de `scripts/README.md` para confirmar PASS empírico. | agent-orchestrator | pendiente |
| agent-excel-mapper | (Opcional) Exponer scripts `gm:dump`, `gm:regression`, `gm:import` en `package.json` raíz para estandarizar la ejecución (no se modificó `package.json`, restringido a orchestrator). | agent-orchestrator | pendiente |
| agent-excel-mapper | (Aviso) Tras confirmar el fixture sanitizado, evaluar el retiro de `.worktreeinclude` del Excel privado (marcado TEMPORAL Oleada 1 en DECISIONS). | agent-orchestrator | pendiente |
