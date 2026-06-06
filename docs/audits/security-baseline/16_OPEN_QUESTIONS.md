# 16 — Preguntas Abiertas

1. **`DATABASE_URL` (H-01):** ¿con qué rol de PostgreSQL se conecta el read-model en
   producción? Si es `postgres`/owner/`service_role`, RLS no protege las lecturas.
   ¿Se desea migrar el read-model a una conexión `authenticated` con el JWT del
   usuario, o mover esas lecturas al cliente RLS-bound?
2. **`/api/exports` legacy (M-02):** ¿se sigue usando esa ruta (perfiles
   client/site/management/internal) o quedó superada por `/api/estimates/export`?
   ¿Se gatea o se retira?
3. **Headers/CSP (M-01):** ¿hay restricciones de terceros (scripts/estilos/imagenes
   externas, AG Grid, Recharts, fuentes) que deban contemplarse en la CSP antes de
   activarla en modo enforce?
4. **Rate limiting (M-04):** ¿se prefiere a nivel de proxy (Next), de Supabase, o un
   servicio externo? ¿Límites por IP, por usuario, por export?
5. **CI/CD (M-05):** ¿se desea GitHub Actions (lint/test/build/secret-scan/audit) y
   branch protection sobre `main`? ¿Quién aprueba PRs?
6. **Staging:** ¿se requiere un entorno staging dedicado (hoy solo local/preview/
   prod)?
7. **Backups/DR:** ¿qué RPO/RTO objetivo? ¿Existe prueba de restauración documentada
   del proyecto Supabase productivo?
8. **Auth (MV-02):** ¿signup público habilitado? ¿MFA para admins? ¿SMTP de
   producción configurado? ¿leaked-password protection?
9. **Logo/exports:** ¿se planean exports masivos/programados que justifiquen colas y
   límites por usuario?
10. **Historial Git (MV-08):** ¿autorización para correr un escaneo de secretos sobre
    el historial completo en un entorno controlado?
11. **Higiene de ramas (L-03):** ¿se pueden archivar/eliminar las ramas `backup/*` e
    `integration/*` ya integradas?
