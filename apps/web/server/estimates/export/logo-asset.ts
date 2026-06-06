/**
 * logo-asset.ts — Logo oficial de ICONIC EMBEBIDO (base64) para exports (4E.1B).
 *
 * Vía PRIMARIA y recomendada para producción (serverless-safe): el logo viaja
 * BUNDLED con la función, sin depender del sistema de archivos ni de
 * `outputFileTracingIncludes` (que Turbopack no traza limpiamente).
 *
 * CÓMO AÑADIR EL LOGO OFICIAL:
 *   1. Exporta el logo a PNG con fondo transparente (~600×600 px, < 300 KB).
 *   2. Conviértelo a base64 SIN prefijo data-uri, p. ej.:
 *        base64 -w0 iconic-logo.png        (Linux/macOS)
 *        [Convert]::ToBase64String([IO.File]::ReadAllBytes('iconic-logo.png'))  (PowerShell)
 *   3. Pega el string resultante en `ICONIC_LOGO_BASE64` (entre las comillas).
 *
 * Mientras esté vacío, los generadores usan el monograma textual `IC`
 * (`branding.ts`). La exportación NUNCA se rompe por la ausencia del asset.
 *
 * Alternativa para desarrollo local: dejar el PNG en
 * `apps/web/public/branding/iconic-logo.png` (lo lee `loadBrandLogo` por fs).
 */

/** Base64 del PNG (sin el prefijo `data:image/png;base64,`). Vacío = sin logo. */
export const ICONIC_LOGO_BASE64 = '';
