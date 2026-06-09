# 08 — Docker, Puertos y VPS

## Docker

- **No** existen `Dockerfile` ni `docker-compose*.yml`/`compose*.yml` propios en el
  repositorio (`git ls-files` = 0).
- El único Docker en juego es el que **Supabase CLI** levanta localmente para
  desarrollo/pruebas, configurado por `supabase/config.toml`. No hay imágenes
  propias, ni `privileged`, ni `docker.sock` montado, ni `network_mode: host`, ni
  credenciales por defecto definidas por el proyecto.

### Puertos (locales, Supabase CLI)

| Servicio | Puerto | Exposición |
|---|---|---|
| API (Kong) | 54321 | local (dev) |
| DB Postgres | 54322 | local (dev) |
| Shadow DB | 54320 | local (dev) |
| Studio | 54323 | local (dev) |

Todos son **puertos de desarrollo local** del stack Supabase CLI. **No** son
puertos productivos ni expuestos públicamente por el proyecto. No constituyen una
vulnerabilidad pública por sí mismos.

> Recordatorio de operación: Studio (54323) y la DB (54322) **no** deben exponerse
> fuera de `localhost`; con la configuración por defecto del CLI quedan ligados a
> la máquina local.

## VPS

```
VPS_REVIEW = NOT_APPLICABLE
```

No hay evidencia de VPS/servidor propio (sin IaC, sin scripts de aprovisionamiento,
sin configs SSH/nginx/systemd, sin referencias a proveedores de VPS). El cómputo es
serverless (Vercel) y la base es gestionada (Supabase).

## Hallazgos
- **INFO** — Sin contenedores propios ni superficie Docker productiva.
- **MANUAL** — Confirmar que el entorno local no publica 54322/54323 a `0.0.0.0`
  en máquinas de desarrollo compartidas (config por defecto = local).
