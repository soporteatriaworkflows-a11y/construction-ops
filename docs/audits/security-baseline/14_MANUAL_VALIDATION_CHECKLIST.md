# 14 — Checklist de Validación Manual

> Requiere acceso a paneles externos (no disponible en esta fase). **No** solicitar
> ni exponer valores de secretos. Marcar al validar.

## Supabase (panel del proyecto productivo)
- [ ] **MV-01 (crítico, H-01):** ¿Con qué rol se conecta `DATABASE_URL` de Vercel?
      (¿`postgres`/owner/service = bypassa RLS, o un rol no privilegiado?) Sin
      exponer la cadena; basta el rol.
- [ ] **MV-03:** `migration list --linked` = 20/20 Local = Remote; las policies/grants
      del remoto coinciden con las migraciones.
- [ ] **MV-02 Auth:** signup (¿habilitado?), confirmación de email, expiración/refresh
      de JWT, redirect URLs permitidas, MFA para cuentas admin, rate limits, leaked
      password protection, SMTP de producción.
- [ ] Storage: confirmar que sigue **sin buckets** (no usado).
- [ ] Logs de Auth/DB disponibles y con retención adecuada.
- [ ] Backups/PITR habilitados; probar restauración en entorno aislado.

## Vercel (panel)
- [ ] **MV-05:** Variables por entorno: `SUPABASE_SERVICE_ROLE_KEY` solo server (no
      `NEXT_PUBLIC_`), `NEXT_PUBLIC_*` correctas, `DATABASE_URL` con rol mínimo.
- [ ] Deployment Protection activa en Preview (SSO) — confirmado parcialmente (401).
- [ ] Producción `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=db`.
- [ ] Dominio: TLS válido, HSTS, redirección a HTTPS.
- [ ] Funciones: región, timeout, memoria; deployments antiguos accesibles.
- [ ] Acceso del equipo / roles; integración GitHub; ramas que generan preview.

## GitHub (panel)
- [ ] **MV-06:** Branch protection/ruleset en `main`: PR obligatorio, ≥1 review,
      status checks, no push directo.
- [ ] Secret scanning + Push protection activos.
- [ ] Dependabot alerts + security updates.
- [ ] Code scanning (si aplica).
- [ ] Revisar que no existan secretos en commits históricos (ver MV-08).

## Local (Docker, no destructivo)
- [ ] **MV-04:** `supabase start` (local) + `pnpm --filter web exec tsx scripts/rls-runtime/run.ts`
      ⇒ esperado 93/93 PASS. Confirmar que es **local** antes de ejecutar.
- [ ] **MV-08:** Escaneo de historial Git (p. ej. gitleaks) en entorno autorizado.
- [ ] **MV-07:** `pnpm audit` y `pnpm outdated` (requiere red) — registrar resultados.

## Puertos / red local
- [ ] Confirmar que 54322 (DB) y 54323 (Studio) no se publican a `0.0.0.0` en
      equipos de desarrollo compartidos.

## Exports
- [ ] Validar visualmente que los exports de cliente no contienen precios de compra,
      descuentos ni márgenes internos.
