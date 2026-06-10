# Arquitectura — Instancia privada por cliente + branding por instancia

**Oleada:** ICONIC OPS LOGIN + INSTANCE-READY BRANDING
**Fecha:** 2026-06-10
**Rama:** `feat/iconic-ops-login-branding` (base `bd97abb`)
**Estado:** Congelado por agent-orchestrator

---

## 1. Modelo de despliegue: una instancia privada por cliente

La plataforma subyacente es **ATRIA BUDGET OPS**. Cada cliente opera una
**instancia privada** completa:

```text
Cliente (p. ej. Grupo ICONIC)
└── Instancia privada
    ├── Deploy propio (proyecto Vercel propio, dominio propio)
    ├── Base de datos propia (proyecto Supabase propio, RLS multi-org interno)
    ├── Variables de entorno propias (secretos NUNCA compartidos entre clientes)
    └── Branding propio (esta arquitectura)
```

Decisiones que este modelo implica:

1. **Aislamiento físico de datos**: no hay datos de dos clientes en la misma DB.
   El RLS multi-organización existente sigue operando DENTRO de cada instancia
   (una constructora puede tener varias organizaciones internas).
2. **El branding NO vive en la base de datos** en V1: es configuración de la
   instancia (build/env). Cambiarlo no toca datos ni requiere migraciones.
3. **El mismo repositorio sirve todas las instancias**: ninguna referencia de
   cliente se "hardcodea" fuera de los defaults de la instancia insignia
   (ICONIC OPS); cualquier otra instancia se diferencia solo por variables.

## 2. Fuente única de branding

```text
apps/web/lib/branding/instance.ts    ← configuración CENTRALIZADA por instancia
apps/web/lib/branding/workspace.ts   ← API histórica (getActiveWorkspace) + tokens de color
```

- `getInstanceBranding()` resuelve: **defaults públicos de ICONIC OPS** +
  **overrides `NEXT_PUBLIC_INSTANCE_*`** sanitizados.
- `getActiveWorkspace()` (consumida por root layout/metadata, sidebar, topbar,
  shell de auth y `WorkspaceBrand`) ahora deriva de esa misma fuente — un solo
  punto de cambio para toda la UI.
- Los tokens de color (`ICONIC_THEME`, CSS vars `--iconic-*`, clases Tailwind
  `iconic-*`) NO son sobreescribibles por env en V1 (ver §6 deudas).

## 3. Overrides soportados (todos opcionales)

| Variable | Campo | Sanitización |
|---|---|---|
| `NEXT_PUBLIC_INSTANCE_PRODUCT_NAME` | Nombre visible del producto | texto plano, ≤80, sin `<>` ni control chars |
| `NEXT_PUBLIC_INSTANCE_WORKSPACE_NAME` | Nombre del cliente/workspace | ídem |
| `NEXT_PUBLIC_INSTANCE_DESCRIPTOR` | Descriptor corto | texto plano, ≤140 |
| `NEXT_PUBLIC_INSTANCE_LOGO_FULL` | Logo completo (login) | ruta `/…` same-origin o `https://…`; sin espacios/comillas |
| `NEXT_PUBLIC_INSTANCE_LOGO_SYMBOL` | Símbolo/avatar | ídem |
| `NEXT_PUBLIC_INSTANCE_INITIALS` | Iniciales de respaldo | ≤3 caracteres, mayúsculas |
| `NEXT_PUBLIC_INSTANCE_SHOW_POWERED_BY` | Mostrar "Powered by" | `0/false/off/hidden` ocultan; cualquier otro valor muestra |

Reglas:

- Un override inválido **se ignora** y se conserva el default (nunca rompe la UI).
- `poweredByLabel` ("ATRIA BUDGET OPS") **no es sobreescribible**: identifica a
  la plataforma; solo su visibilidad es configurable por contrato.
- Las referencias a `process.env.NEXT_PUBLIC_*` en `instance.ts` son literales
  (requisito de inlining de Next.js para bundles cliente). Cambiar una variable
  exige **rebuild** de la instancia, no solo restart.

## 4. Seguridad

1. Solo variables `NEXT_PUBLIC_*`: públicas por definición. **PROHIBIDO** poner
   secretos, URLs internas, claves o identificadores sensibles en branding.
2. Sanitización en la única puerta de entrada (`resolveInstanceBranding`):
   - texto: sin `<`/`>` ni caracteres de control, largo acotado ⇒ no inyección;
   - logos: solo same-origin (`/branding/...`) o `https://` absolutas; nunca
     `javascript:`, `data:`, `//`, rutas con comillas o espacios;
   - el render usa siempre JSX/`next/image` (escape automático; nada va a
     `dangerouslySetInnerHTML`).
3. El branding no participa en autenticación, autorización, RLS ni cálculos.
4. Assets por cliente viven en `public/branding/<cliente>/` de su instancia o
   en un CDN https del cliente.

## 5. Procedimiento para una instancia nueva (resumen operativo)

```text
1. Crear proyecto Supabase del cliente (migraciones del repo; sin seeds demo).
2. Crear proyecto Vercel del cliente apuntando al repo (deploy por Git).
3. Configurar variables del runtime (Supabase URL/keys propias, APP_AUTH_MODE,
   READ_MODEL_SOURCE) — fuera del alcance de este documento.
4. Configurar branding: subir logos a public/branding/<cliente>/ (o CDN https)
   y definir las NEXT_PUBLIC_INSTANCE_* necesarias.
5. Rebuild + smoke de /login (logo, naming, descriptor, powered-by).
```

## 6. Fuera de alcance y deudas

| Deuda | Detalle |
|---|---|
| `INSTANCE_THEME_TOKENS_OVERRIDE` | Sobreescribir paleta (`--iconic-*`) por instancia: exige auditar contraste/accesibilidad por tema; V1 mantiene la paleta ICONIC fija. |
| `INSTANCE_BRANDING_ADMIN_UI` | Editar branding desde una UI de administración (persistencia en DB + caché) en lugar de env+rebuild. |
| `INSTANCE_FAVICON_METADATA_ASSETS` | Favicon/OG images por instancia (hoy se hereda el del repo). |

Las exportaciones (Excel/PDF) conservan su fuente de branding propia
(`server/estimates/export/branding.ts`, assets embebidos); unificarlas con esta
configuración queda explícitamente fuera de esta oleada visual.
