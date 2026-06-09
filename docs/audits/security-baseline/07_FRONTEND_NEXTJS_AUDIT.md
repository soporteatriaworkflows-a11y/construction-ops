# 07 — Frontend Next.js

## Observaciones

| Aspecto | Estado | Evidencia |
|---|---|---|
| Server vs Client Components | Mayoría Server Components `ƒ`; cliente solo donde hace falta (`aiu-form`, `export-buttons`, login) | build, `'use client'` |
| Autorización real server-side | `proxy.ts` + `resolveViewer()` en páginas; no solo UI | proxy + páginas |
| Protección de rutas | deny-by-default en modo supabase; `(dashboard)` request-time | `proxy.ts`, `force-dynamic` |
| Redirecciones | `sanitizeNext()` anti open-redirect | `proxy.ts` |
| Tokens en cliente | No se almacenan manualmente; sesión en cookies SSR | `@supabase/ssr` |
| Cookies | HttpOnly/Secure/SameSite gestionadas por `@supabase/ssr` | `server.ts`/`proxy.ts` |
| `dangerouslySetInnerHTML` / `eval` / `new Function` | **Ausentes** | grep = 0 |
| Secret en bundle | Solo `NEXT_PUBLIC_*` (publishable/anon, URL, app URL) | `lib/supabase/env.ts` |
| `server-only` | No marcado explícitamente; separación lograda por estructura `server/` y clientes | recomendación P2 |

## Hallazgos

- **M-01 — Sin headers de seguridad / CSP.** `next.config.mjs` no define `headers()`.
  Faltan: `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security` (Vercel suele añadir HSTS en su dominio, pero CSP/
  anti-clickjacking a nivel app están ausentes). Riesgo: clickjacking, defensa XSS
  reducida. Defensa en profundidad.
- **L-04 — Source maps de cliente** en producción (default Next): pueden facilitar
  ingeniería inversa del frontend. El código server **no** se envía al cliente.
  Validación/decisión de negocio (MANUAL/LOW).
- **INFO** — Riesgo XSS bajo (React autoescapa; sin innerHTML peligroso);
  autorización no depende solo de ocultar botones (guard server-side real).
- **L-05** — `export-buttons` descarga vía `fetch`+blob con anti doble-click;
  correcto.

## Recomendaciones (no implementar aún)

- Añadir `headers()` en `next.config.mjs` con CSP estricta (nonce/strict-dynamic),
  `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` mínima, y HSTS.
- Evaluar `import 'server-only'` en módulos `server/**` que nunca deban entrar al
  bundle de cliente, como barrera explícita.
- Evaluar desactivar source maps de producción o restringir su acceso.
