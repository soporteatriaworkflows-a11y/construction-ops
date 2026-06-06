# 03 — Infraestructura

## Topología real

- **Cómputo:** funciones serverless de Vercel (Next.js 16, runtime Node.js). Rutas
  `ƒ` request-time; estáticas `○` para login/landing.
- **Datos:** PostgreSQL gestionado por Supabase (remoto) + Supabase local (Docker
  vía CLI) para desarrollo/pruebas.
- **CDN/Edge:** Vercel.
- **Sin** infraestructura propia (VPS/EC2), **sin** IaC (Terraform/CloudFormation),
  **sin** contenedores propios.

## Separación de entornos

| Aspecto | Observación |
|---|---|
| Local | `APP_AUTH_MODE=demo`/`supabase`, `READ_MODEL_SOURCE=fixture`/`db`, Supabase local |
| Preview | Vercel, detrás de SSO de equipo |
| Producción | Vercel, `supabase`+`db`, Supabase remoto (20/20 migraciones) |
| Staging | No existe (gap menor; ver Open Questions) |

`APP_AUTH_MODE` y `READ_MODEL_SOURCE` evitan el fallback silencioso (combinación
`demo`+`db` lanza `AuthConfigError`), lo que reduce el riesgo de servir datos
reales en modo demo o viceversa. Buen control de configuración.

## Gestión de configuración

- Variables de entorno por nombre en `.env.example` (sin valores). Valores reales
  solo en Vercel/Supabase (no en repo).
- `DATABASE_URL` placeholder local apunta a `postgres:postgres@localhost:54322`
  (credenciales locales de Supabase CLI, no secretos productivos).

## Hallazgos de infraestructura

- **M-05** — Sin CI/CD ni gates automáticos (ver `09`).
- **M-01** — Sin headers de seguridad a nivel app (ver `07`).
- **INFO** — Arquitectura simple y gestionada reduce superficie (sin VPS/IaC propia).
- **MANUAL** — Región, timeouts y memoria de funciones Vercel; protección de
  previews; TLS/HSTS del dominio (ver `09`, `14`).

## Backups / DR

- Backups gestionados por Supabase (PITR según plan) — **validación manual**.
- No hay runbook de restauración/rollback documentado en repo (ver `11`, `13`).
