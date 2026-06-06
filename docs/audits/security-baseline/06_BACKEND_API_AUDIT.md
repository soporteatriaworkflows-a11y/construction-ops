# 06 — Backend / API Routes / Server Actions / RPCs

## Superficies

| Endpoint / acción | Método | Auth | Autorización | Validación | Hallazgos |
|---|---|---|---|---|---|
| `GET /api/estimates/export` | GET | `resolveViewer()` (401 sin sesión) | valida `estimateId↔scopeId↔projectId`; cross-org → 404 (RLS); anti-escalación implícita | `format ∈ {xlsx,pdf}`, IDs requeridos | OK; sin paginación (export completo por diseño) |
| `GET /api/exports` (legacy 3C) | GET | auth + `isSameOrLessPrivileged` | **org = `DEMO_ORGANIZATION_ID` hardcodeada** | format/profile validados | **M-02** tenant incorrecto / BOLA latente |
| `GET /auth/callback` | GET | intercambio OAuth/PKCE | n/a | sin service_role | OK |
| `GET/POST /logout` | — | sesión | n/a | — | OK |
| Server Action `projects.actions` | POST(RSC) | viewer server-side | modo creación (`supabase`+`db`) | input validado | OK |
| Server Action `scopes.actions` | POST(RSC) | viewer | RLS-bound repo | validación | OK |
| Server Action `estimates.actions` | POST(RSC) | viewer | RLS-bound + RPC INVOKER | validación | OK |
| Server Action `aiu-actions` | POST(RSC) | `resolveAuthenticatedViewer` | versión no-emitida; solo 4 % del cliente | `validateAiuRates` | OK |
| Server Action `import/actions` | POST(RSC) | viewer | versión vacía (anti doble-import) | digest SHA-256; reparse server-side | OK; límite body 4 MB |
| RPC `create_estimate_with_initial_version` | SQL | INVOKER | GRANT authenticated; autor de `auth.uid()` | — | OK |
| RPC `import_boq_into_version` | SQL | INVOKER | GRANT authenticated; REVOKE PUBLIC/anon | subtotales recomputados | OK |

## Revisión OWASP API/Top 10

| Riesgo | Observación |
|---|---|
| Broken Object Level Auth (BOLA) | Camino 4E.1 valida cadena + RLS. **M-02** en `/api/exports` (org hardcodeada). Read-model: ver H-01. |
| Broken Function Level Auth | Acciones validan modo/rol; AIU bloquea versiones emitidas. OK |
| Mass assignment | Server Actions aceptan campos acotados (p. ej. AIU solo 4 %); `created_by`/org derivados server-side. OK |
| Excessive data exposure | Exports cliente excluyen precios/descuentos; PDF sin UUID/source_row. OK |
| Inyección SQL | Drizzle parametrizado + RPCs; sin concatenación de SQL crudo en código de app. OK |
| Command/Path injection | Sin `child_process`/`exec`; filenames de export sanitizados (`sanitizeSegment`, anti `..`/separadores). OK |
| SSRF | Sin fetch a URLs controladas por el usuario. OK |
| Open redirect | `sanitizeNext()` en proxy. OK |
| Errores con stack | Repos devuelven errores de dominio (`*NotFoundError`), no SQL/stack; rutas devuelven JSON sanitizado. OK |
| CORS | API por defecto same-origin (sin CORS abierto detectado). OK |
| Rate limiting | **Ausente** a nivel app (M-04); depende de Supabase Auth/Vercel. |
| Paginación / límites | **Ausente** en read-model (M-03). |
| Payload limits | Server Actions 4 MB (import); resto sin límite explícito. Parcial. |
| Idempotencia | Import: anti doble-submit por versión vacía + digest. OK |
| Precisión decimal/moneda | `decimal.js`, ROUND_HALF_UP; subtotales server-side. OK |

## Hallazgos
- **M-02** `/api/exports` org demo hardcodeada (gatear/retirar).
- **M-03** sin paginación/límites (read-model y listas).
- **M-04** sin rate limiting a nivel de aplicación.
- **INFO** validación de cadena + RLS + digest import + math decimal.
