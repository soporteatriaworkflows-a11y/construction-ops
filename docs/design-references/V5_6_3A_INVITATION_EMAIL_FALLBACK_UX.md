# V5.6.3A - Invitation Email Fallback UX

## Estado

V5.6.3A no activa envio real de invitaciones. La fase hace honesto y usable el flujo cuando produccion cae en `LogEmailProvider`: la app deja de afirmar que el correo fue enviado y devuelve un enlace fallback solo cuando el backend acaba de generar el token.

## Problema

El flujo de aceptacion ya funciona, pero el correo de invitacion de la app no llega porque las invitaciones usan el provider propio de la aplicacion. Forgot/reset usa Supabase Auth SMTP y por eso si llega. En produccion, sin provider real configurado, el provider efectivo puede ser `LogEmailProvider`, que solo registra/captura y no envia correo real.

## Decision V5.6.3A

- `EmailSendResult.status` distingue `sent`, `logged` y `failed`.
- `sent` significa envio real confirmado por un provider real.
- `logged` significa captura por `LogEmailProvider`; no es exito de entrega.
- `failed` significa que un provider real fue intentado y fallo.
- Create/resend invitation devuelven `emailDelivery` y `emailFallback`.
- La UI de `/settings/access` muestra aviso y enlace fallback cuando `status !== 'sent'`.
- El enlace fallback solo se muestra cuando la server action acaba de recibir `acceptUrl` del backend.

## Seguridad

- No se guarda token plano en DB.
- No se reconstruyen links antiguos desde `token_hash`.
- No se expone `token_hash`.
- No se loguea token ni inviteLink completo.
- No se loguea correo completo: se usa `recipient_masked`.
- No se loguean secretos, credenciales SMTP, headers de auth ni `DATABASE_URL`.
- `getInvitationEmailDeliveryHealth` devuelve solo `providerName`, `isRealSender` y `deliveryMode` para admin/gerencia.

## Fases futuras

- V5.6.3B: activar SMTP real de forma controlada, con envs manuales y validacion dedicada.
- V5.6.3C: evaluar Resend/Postmark como provider opcional.
- Ninguna de estas fases debe tocar `DATABASE_URL`.

## QA esperado

- Tests focales de email/access/settings fallback.
- Auth/access tests.
- Typecheck, lint, build, gm:regression.
- `git diff --check`.

## Fuera de alcance

- No Supabase Cloud.
- No db push.
- No RLS/migraciones.
- No Vercel envs.
- No SMTP real.
- No cambios al flujo de aceptacion V5.6.1E salvo integracion indirecta inexistente.
