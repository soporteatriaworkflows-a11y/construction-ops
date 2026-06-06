# Branding de exports — GRUPO ICONIC

Assets de marca que consumen los **exports** del presupuesto (Excel y PDF). Ver
`docs/BUDGET_EXPORT_CONTRACT.md §13`, la guía interna
`docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf` y la fuente única
`apps/web/server/estimates/export/branding.ts`.

## Assets oficiales

```
apps/web/public/branding/iconic/grupo-iconic-logo-full.png    # logo completo (mark + texto)
apps/web/public/branding/iconic/grupo-iconic-logo-symbol.png  # marca compacta
```

- **Formato:** PNG RGBA (transparente). Actuales: full 846×846, symbol 1080×1080.
- **Uso:** `full` → encabezado del PDF y hoja `RESUMEN` del Excel; `symbol` →
  footer del PDF y zonas compactas.

## Embebido reproducible (serverless-safe, SIN fs en runtime)

Los logos se **embeben en base64** dentro de
`apps/web/server/estimates/export/logo-asset.ts` (GENERADO, no editar a mano),
de modo que viajan *bundled* con la función del export. Regenerar cuando cambien
los logos:

```
node scripts/branding/embed-iconic-assets.mjs
```

El script lee los dos PNG, valida la firma PNG y reescribe `logo-asset.ts` con
`ICONIC_LOGO_FULL_DATA_URI` y `ICONIC_LOGO_SYMBOL_DATA_URI`. **No** registra
cadenas base64 en logs. **No** se usa `fs` ni `outputFileTracingIncludes` en
runtime.

## Paleta oficial (única fuente: `branding.ts` → `ICONIC_EXPORT_PALETTE`)

| Rol | HEX |
|---|---|
| Azul ICONIC (dominante) | `#005DD6` |
| Cian (ÚNICO acento) | `#00B8FF` |
| Azul noche (premium/títulos) | `#020148` |
| Grafito (texto técnico) | `#1B1F3E` |
| Gris azulado (bordes) | `#C7DCED` |
| Gris claro (filas alternas) | `#F2F4F7` |
| Blanco (fondo principal) | `#FFFFFF` |

**Sin dorado.** El acento es el cian ICONIC; no introducir dorado sin aprobación
explícita de la usuaria.

## Fallback (solo resiliencia de desarrollo)

Si faltara el módulo generado, los generadores usan un **monograma textual**
(`IC`): nunca esperado en producción. La exportación no se rompe.

## Guía visual interna

`docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf` es referencia **interna** de
implementación. **No** se publica dentro de la app ni se expone por rutas
públicas (vive en `docs/`, no en `public/`).
