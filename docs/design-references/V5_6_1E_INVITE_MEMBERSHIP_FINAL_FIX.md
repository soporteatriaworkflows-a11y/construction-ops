# V5.6.1E Invite Membership Final Fix

Fecha: 2026-07-02
Fase: `ICONIC_OPS_V5_6_1E_INVITE_MEMBERSHIP_FINAL_FIX`
Base: `origin/main = e3c1f4d` (PR #24 merged, incluye `3680f74`)

## Por qué V5.6.1D no resolvió el caso real

El patch V5.6.1D asumía exactamente lo que la evidencia de producción contradice:
que tras confirmar el correo el invitado **regresa a `/invite/accept?token=…` con el
token original en la URL** y con sesión activa. Solo bajo esa condición se disparaba
`autoAccept` → `accept_invitation`.

En producción ese ida-y-vuelta NO entrega el token de forma confiable:

- la allow-list de Redirect URLs / Site URL de Supabase puede descartar un
  `redirect_to` con query anidada (`?next=/invite/accept?token=…`) y caer al Site URL;
- escáneres de enlaces de correo (SafeLinks/antivirus) consumen el enlace de un solo uso;
- el usuario simplemente **inicia sesión después** en vez de reabrir el enlace original.

En todos esos caminos el usuario queda autenticado (Auth user existe) pero
`accept_invitation` nunca corre → sin fila en `profiles` → `resolveViewer()` lanza
`no_membership` → el dashboard mostraba `El usuario no tiene membresía.` sin salida.

## Causa raíz

El cierre de membresía dependía de un dato frágil (el token viajando de vuelta por la
URL). El RPC `accept_invitation` es correcto e idempotente; el problema es que **nunca
se le llamaba** en el camino real de confirmación de correo.

## Corrección (app-layer, sin DB)

1. **`finalize-invitation.ts`** (nuevo): helper `finalizeInviteAcceptance(supabase, token,
   fullName?)` que deriva el email del **usuario Auth** (`auth.getUser()`, NO el viewer,
   así un Auth user sin profile puede cerrar), hashea el token (SHA-256) y llama al RPC
   como única autoridad. `already_member` = éxito. Además persiste el token en el
   navegador del invitado (`localStorage`, su propio secreto — nunca en la URL de destino
   ni en logs) para sobrevivir al ida-y-vuelta aunque la URL lo pierda.
2. **`accept-form.tsx`**: persiste el token antes del `signUp` y finaliza vía el helper.
3. **`invite-membership-recovery.tsx`** (nuevo): red de seguridad cliente. Si un Auth user
   aterriza sin profile, lee el token persistido y finaliza mostrando “Finalizando
   invitación…”; sólo recarga a `/dashboard` **tras cierre confirmado por el RPC**. Sin
   token → instrucción clara para reabrir el enlace original (no callejón sin salida).
4. **`dashboard/page.tsx`**: el branch `no_membership` (AuthError) ahora renderiza la
   recuperación en vez del error muerto. No se toca el scope selector ni Quick Notes.

## Garantías

- **Auth user sin profile puede finalizar**: el cierre usa `auth.getUser()` + RPC, nunca
  el viewer que exige `profiles`.
- **No se navega al panel sin membresía**: la recarga a `/dashboard` sólo ocurre cuando el
  RPC confirmó el cierre (o `already_member`). Deny-by-default.
- **RPC = autoridad**: no se escribe `profiles` desde la UI; sin service_role en cliente.
- **Casing/alias**: el email lo aporta el usuario Auth y el RPC compara en minúsculas.

## Tests

- `finalize-invitation.test.ts` (nuevo, comportamiento con cliente simulado): no_session sin
  llamar RPC; Auth user sin profile cierra (email derivado + token **hasheado**, nunca
  plano); `already_member` = éxito; error del RPC sanitizado (sin `token_hash`);
  `email_mismatch` claro; persistencia segura sin `window` + round-trip con `localStorage`.
- `invite-accept-flow.test.ts` (actualizado): el form persiste el token y finaliza vía helper;
  el helper usa el RPC y `auth.getUser`, sin writes a `profiles`; la página usa
  `getSessionClaims` (no el viewer); el callback sigue sanitizando `next` sin aceptar;
  la recuperación sólo navega tras `result.ok`; el dashboard enruta `no_membership` a la
  recuperación.

## Restricciones respetadas

Sin migraciones, sin db push, sin Supabase Cloud, sin RLS, sin Vercel env/password/SMTP,
sin deploy/tag, sin tocar usuarios reales ni `profiles` manual, sin tocar Price
Intelligence / BOQ / APU / exports / Quick Notes / Dashboard Project Scope Selector.
