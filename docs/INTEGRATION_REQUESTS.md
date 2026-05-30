# Solicitudes de integración entre agentes

Formato:
Agente solicitante | Archivo o contrato que necesita | Agente responsable | Estado

## Solicitudes

| Solicitante | Archivo / necesidad | Responsable | Estado |
|---|---|---|---|
| agent-excel-mapper | Permiso de **ejecución de Node/Vitest sobre `private/`** para confirmar la regresión empíricamente. | agent-orchestrator | ✅ RESUELTO (2026-05-30, Fase 1) — El orquestador ejecutó `gm:dump`, `gm:build-fixture`, `gm:regression` (22/22 PASS) y `gm:import` (todas PASS) sobre el Excel real. Coordenadas de los 9 valores confirmadas (EXCEL_MAPPING §10). 9/9 valores **empíricos** ±0.01 COP. |
| agent-excel-mapper | (Opcional) Exponer scripts `gm:dump`, `gm:regression`, `gm:import` en `package.json` raíz. | agent-orchestrator | ✅ RESUELTO (2026-05-30) — Añadidos `gm:dump`, `gm:build-fixture`, `gm:regression`, `gm:import` al `package.json` raíz + `tsx` (devDep). |
| agent-excel-mapper | (Aviso) Tras confirmar el fixture sanitizado, evaluar el retiro de `.worktreeinclude`. | agent-orchestrator | ✅ RESUELTO (2026-05-30, Fase 6) — `.worktreeinclude` ELIMINADO en `integration/wave-1`. El fixture sanitizado fila-por-fila es suficiente; Oleada 2 consume el fixture, no el Excel. `private/` sigue ignorado. |
| agent-orchestrator | **Fix de integración en archivo de db-rls** `supabase/seeds/0001_demo_org_and_profiles.sql`: el seed insertaba `profiles` sin crear antes las filas en `auth.users`. En el stack Supabase local **el esquema `auth` SÍ existe**, por lo que la migración `0001` activa el FK `profiles_id_auth_users_fk` y `db reset` falla (`SQLSTATE 23503`). Surgió al ejecutar el RLS runtime real (B-003), antes bloqueado por Docker. | agent-db-rls | ✅ RESUELTO (2026-05-30, Oleada 1.5) — El orquestador añadió un bloque `DO $$ … auth.users … $$` **guardado por la misma condición** que usa la migración (presencia del esquema `auth`), de modo que el seed sigue funcionando en un Postgres puro sin `auth`. Solo se inserta `id` + columnas mínimas (`instance_id/aud/role/email`), sin credenciales ni login real. **db-rls debe revisar/avalar** este patrón de seed de auth para futuras migraciones de perfiles. |
