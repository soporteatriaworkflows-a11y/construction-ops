# 20 — Checklist de Despliegue P1-A (NO ejecutar aún)

> Pasos manuales futuros. P1-A está implementado/probado en local; el despliegue
> requiere aprobación explícita. No se desplegó nada.

## 1. Variables por entorno
- [ ] Confirmar `DATABASE_URL` de producción (Vercel) — **rol efectivo** (MV-01).
      Sin imprimir el valor. Ideal: rol **sin** `bypassrls` (p. ej. `authenticated`
      o un rol de app dedicado). Si sigue siendo `postgres`/bypassrls, el rollout
      de `withTenantRls` (Alt B) es imprescindible para que RLS aplique.
- [ ] `APP_AUTH_MODE=supabase`, `READ_MODEL_SOURCE=db` (sin cambios).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo server (no `NEXT_PUBLIC_`).

## 2. Roles requeridos
- [ ] El rol de conexión debe poder `SET ROLE authenticated` (en Supabase,
      `postgres` ya es miembro). Verificar en remoto con introspección read-only.
- [ ] `authenticated` con grants/policies correctos (espejo de migraciones; MV-03).

## 3. Migraciones preparadas
- [ ] **Ninguna** para P1-A (Alt B no requiere migración). Confirmar remoto 20/20
      sin cambios.

## 4. Orden de despliegue
> El cableado de los 11 métodos del read-model con `withTenantDb` ya está hecho en
> la rama P1-A (no es rollout por partes; va completo). Pasos:
1. [ ] Merge de la rama P1-A (M-02 + cableado RLS del read-model) — sin migración.
2. [ ] Confirmar que el pooler de `DATABASE_URL` soporta transacciones (Supabase
       transaction pooler sí). Cada lectura abre una transacción READ ONLY.
3. [ ] Validar en Preview: dashboard/planning/presupuesto cargan datos correctos
       por organización (smoke); export `/api/estimates/export` y `/api/exports`.
4. [ ] (Opcional, recomendado) cambiar `DATABASE_URL` a un rol sin `bypassrls`.
       Con el cableado actual NO es estrictamente necesario (el `SET LOCAL ROLE
       authenticated` ya fuerza RLS), pero refuerza la defensa en profundidad.

## 5. Validación previa (local + Preview)
- [ ] typecheck/lint/build/tests verdes.
- [ ] harness RLS 93/93.
- [ ] read-model isolation 8/8.
- [ ] Smoke Preview: dashboard/planning/presupuesto cargan con datos correctos
      por organización.

## 6. Rollback
- [ ] M-02: revertir el merge del export (restaura comportamiento previo).
- [ ] Read-model: cada paso del rollout es revertible por método; si una lectura
      envuelta falla, revertir ese método a la consulta directa.
- [ ] `DATABASE_URL`: conservar el valor previo para revertir el rol.

## 7. Smoke tests (producción, tras aprobar)
- [ ] `/login` 200; rutas protegidas redirigen sin sesión.
- [ ] Export `/api/estimates/export` y `/api/exports` con sesión: datos de la
      organización del usuario (no demo, no cross-org).

## 8. Validación de RLS
- [ ] Con usuario de org A, ninguna pantalla/endpoint muestra datos de org B.
- [ ] Introspección remota: lecturas envueltas corren como `authenticated`.

## 9. Validación de exports
- [ ] Cliente: sin precios de compra/descuentos/márgenes.
- [ ] Cross-org: usuario A no puede exportar proyectos de B.

## 10–12. Confirmaciones obligatorias
- [ ] Producción NO usa superuser ni `BYPASSRLS` para lecturas tenant-scoped (tras
      rollout completo).
- [ ] No se imprimieron secretos en ningún paso.
- [ ] Vercel Preview y Production no se rompen (build/smoke verdes).
