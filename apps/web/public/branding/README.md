# Branding de exports — ICONIC

Esta carpeta provee los assets de marca que consumen los **exports** del
presupuesto (Excel y PDF). Ver `docs/BUDGET_EXPORT_CONTRACT.md §13` y
`apps/web/server/estimates/export/branding.ts` (fuente única de identidad).

## Logo oficial — dos mecanismos

### 1) Recomendado para producción (serverless-safe): base64 embebido
Pega el logo en base64 dentro de
`apps/web/server/estimates/export/logo-asset.ts` (constante
`ICONIC_LOGO_BASE64`). Así el asset viaja **bundled** con la función del export,
sin depender del sistema de archivos ni de tracing. Conversión:

```
# Linux/macOS
base64 -w0 iconic-logo.png
# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('iconic-logo.png'))
```

### 2) Conveniencia de desarrollo: archivo PNG
Coloca el PNG en:

```
apps/web/public/branding/iconic-logo.png
```

`loadBrandLogo()` lo lee por `fs` cuando `ICONIC_LOGO_BASE64` está vacío. Útil en
local; en producción Vercel/Turbopack prefiere el mecanismo (1).

### Formato sugerido
- **Formato:** PNG con fondo transparente.
- **Resolución:** ~600×600 px (o ~1200×400 px horizontal); el generador lo escala.
  Peso sugerido < 300 KB.
- **Color:** versión que contraste sobre banda azul noche (`#0F2A43`) en el PDF y
  sobre blanco en el Excel.

## Comportamiento sin logo

Mientras no haya base64 ni PNG, los generadores usan un **monograma textual**
(`IC`) con la paleta corporativa: la exportación nunca se rompe por la ausencia
del asset. Al proveer el logo (mecanismo 1 o 2), aparece automáticamente en el
encabezado del PDF y en la hoja `RESUMEN` del Excel, sin más cambios de código.

## Paleta corporativa (referencia)

| Rol | HEX |
|---|---|
| Azul noche (primario) | `#0F2A43` |
| Azul intermedio | `#1C4E80` |
| Dorado premium (acento) | `#C8A24B` |
| Tinta de texto | `#1A2330` |
| Banda clara | `#EEF2F7` |
| Realce de totales | `#DCE6F1` |
