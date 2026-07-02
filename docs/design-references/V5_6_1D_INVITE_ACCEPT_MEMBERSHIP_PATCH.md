# V5.6.1D Invite Accept Membership Patch

Fecha: 2026-07-02
Fase: `ICONIC_OPS_V5_6_1D_INVITE_ACCEPT_MEMBERSHIP_PATCH`
Base: `origin/main = 406042166a95fe605db5cacd2aadc5b2b4fa6838`

## Diagnóstico

El flujo anterior aceptaba la invitación solo si `signUp` devolvía sesión inmediata. En producción Supabase Auth exige confirmación de correo: el usuario Auth se creaba, el callback establecía sesión y luego el usuario caía en `/dashboard` sin que `accept_invitation` se ejecutara. Resultado: Auth user válido sin `profiles`/membresía y mensaje `El usuario no tiene membresía.`

## Patch mínimo

- `/invite/accept` sigue validando el token con `peek_invitation` por hash.
- Si la invitación está pending y ya existe sesión SSR, la página pasa `autoAccept` al componente cliente.
- El componente cliente llama la RPC `accept_invitation` con el hash del token y redirige a `/dashboard`.
- `signUp` ahora configura `emailRedirectTo` hacia `/auth/callback?next=/invite/accept?token=...` para que, después de confirmar correo, el usuario vuelva al enlace y complete la membresía.
- Si el usuario ya existe, el flujo mantiene `signInWithPassword` y luego ejecuta la misma RPC.

## Seguridad

- No se crea profile desde UI ni desde código de app fuera de la RPC.
- No se confía en organization_id/role desde cliente.
- No se expone `token_hash`; el token plano solo existe como parte del link de invitación y se hashea antes de llamar la RPC.
- `/auth/callback` no acepta invitaciones ni escribe membresía; solo intercambia el code y redirige a un `next` sanitizado.
- Sin migraciones, sin RLS, sin Supabase Cloud, sin Vercel envs, sin SMTP changes y sin writes manuales remotos.

## UX

Copy nuevo cuando Supabase requiere confirmación de correo:

`Tu correo fue creado, pero falta finalizar la invitación. Después de confirmar el correo, vuelve a abrir el enlace de invitación original para activar tu acceso.`

Copy cuando existe sesión y falta cerrar membresía:

`Encontramos tu cuenta. Finalizando invitación...`

## Tests

Se agregó `apps/web/tests/unit/access/invite-accept-flow.test.ts` para cubrir:

- redirect de confirmación de email de vuelta a `/invite/accept`;
- copy de confirmación y auto-finalización;
- mapeo de token inválido/expirado/usado;
- fallback de cuenta existente con sign-in;
- source-scan: `accept_invitation` vía RPC, sin writes directos a `profiles`, sin `token_hash` en UI;
- callback mantiene sanitización y no ejecuta aceptación.

## Riesgos

El cierre depende de que el usuario vuelva con sesión válida al link de invitación. El patch fuerza esa vuelta mediante `emailRedirectTo`, pero si el usuario usa un correo viejo/manual sin abrir el link original, seguirá necesitando reabrirlo. El RPC sigue siendo la autoridad para rechazar token expirado/usado, email mismatch o membership existente.
