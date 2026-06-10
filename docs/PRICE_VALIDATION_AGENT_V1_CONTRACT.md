# Price Validation Agent V1 — Contrato

**Versión:** 1.0  
**Fase:** 3B  
**Rama:** feature/phase3b-price-validation-agent-v1  
**Base:** integration/iconic-ui-price-intelligence-v1 @ d944bc1  
**Fecha:** 2026-06-09  

## Propósito

Asistente supervisado de validación de precios públicos basado en URL.
Propone una observación a partir de contenido público; la aprobación es siempre humana.

## Flujo supervisado

1. Usuario pega URL pública de producto.
2. Backend valida URL (SSRF protection).
3. Backend consulta página pública (timeout 10s, máx 512KB).
4. Backend extrae datos disponibles (JSON-LD, meta tags).
5. Backend normaliza y devuelve propuesta (no persistida).
6. UI muestra propuesta con fuente, precio, moneda, confianza, advertencias.
7. Usuario confirma → crea observación PENDING (reutiliza Phase 3A).
8. Aprobación humana separada (Phase 3A sin cambios).

## SSRF Protection

Rechazado en URL inicial Y en cada salto de redirección:
- Esquemas no http/https
- Credenciales en URL
- localhost, 127.0.0.1, ::1
- IPs privadas: 10.x, 172.16-31.x, 192.168.x, 169.254.x
- Endpoints de metadatos (169.254.169.254, metadata.google.internal)
- Dominios locales (.local, .internal)
- fc00::/7, fe80::/10 (IPv6 privadas)
- Respuestas > 512KB
- Timeout > 10 segundos
- Content-type no HTML/JSON

## Seguridad de redirecciones (fix 2026-06-09)

`fetch-public-page.ts` usa `redirect: 'manual'` con loop manual:
- Máximo 5 saltos (`MAX_REDIRECTS = 5`).
- Antes de cada fetch (incluyendo el primero), se llama `validatePublicUrl(currentUrl, dnsLookup)` con resolución DNS real. Cualquier `UrlValidationError` lanza `FetchPublicPageError('redirect_to_private', ...)`.
- Loop detection vía `Set<string>`: si una URL ya fue visitada, lanza `redirect_loop`.
- Sin `Location` en 3xx → `redirect_missing_location`.
- `Location` que no parsea como URL válida → `redirect_invalid_url`.
- Redirects relativos resueltos con `new URL(location, currentUrl)`.
- `DnsLookup` inyectable para tests: los 15 tests de `redirect.test.ts` mockean `globalThis.fetch` vía `vi.stubGlobal` sin red real.

Antes: `redirect: 'follow'` con verificación solo post-redirect (gap de seguridad).
Después: validación completa en CADA salto antes del fetch.

## Extracción V1

Implementado:
1. JSON-LD Product/Offer (schema.org)
2. Meta tags: og:title, product:price:amount, product:price:currency, itemprop

No implementado:
- Headless browser, Playwright
- CAPTCHA / evasión anti-bot
- Login de proveedores
- Crawling o scraping masivo

## Normalización

Campos normalizados:
- title, externalReference, externalSku
- observedPrice (DecimalString, obligatorio)
- currency (ISO-4217, default COP)
- unit (null si no detectado — NO inventar)
- sourceUrl (canonicalizada)
- sourceType = 'public_web'
- extractedAt (IsoDateTime)
- extractionMethod ('json-ld' | 'meta-tags' | 'mixed' | 'none')
- confidence ('high' | 'medium' | 'low')
- warnings (string[])

Reglas:
- Sin precio → PriceMissingError (no se genera propuesta confirmable)
- Sin unit → unit null (usuario puede completar)
- Sin SKU → externalSku null
- No inventar datos

## Niveles de confianza

- high: JSON-LD Product + Offer con price y priceCurrency
- medium: meta tags coherentes (price + currency)
- low: extracción parcial o ambigua

## Integración con Phase 3A

- validatePublicPriceUrl(viewer, resourceId, input, deps?) → PriceValidationProposal
- confirmPublicPriceObservation(viewer, resourceId, proposal, resourceUnit, repo?) → ResourcePriceObservationView

Al confirmar:
- sourceType = 'public_web'
- sourceReference = proposal.sourceUrl
- status = 'pending' (NUNCA approved automáticamente)
- discountPercent = '0' (precios públicos sin descuento)
- notes = metadatos extractados (title, sku, ref, método, confianza)
- organizationId server-side
- userId server-side
- Reutiliza createResourcePriceObservation de Phase 3A

No modifica:
- BOQ
- AIU
- Exportaciones
- Snapshots emitidos

## Roles autorizados

Los roles del proyecto (`ViewerRole`) son: `client | management | site | internal`.

- `management` (gerencia) e `internal` (admin/presupuestos/compras) pueden
  validar URLs y confirmar observaciones.
- `client` y `site` NO tienen acceso al agente de validación.

Esto es consistente con `APPROVE_ROLES` de Phase 3A.

## Adaptadores futuros

Preparado para:
- Adaptador Homecenter (URL pattern + JSON-LD)
- Adaptador Decorcerámica
- Listas privadas (CSV)
- APIs de proveedores

Patrón: cada adaptador implementa `PriceAdapter` con método `extract(html: string): Partial<ExtractedProductData>`.

## Fuera de alcance V1

- Migraciones DB nuevas
- Jobs programados / cron
- Scraping masivo
- Aprobación automática
- Alertas / notificaciones
- Aplicación automática a BOQ

## Checks diferidos (trabajo paralelo activo)

Los siguientes checks requieren cierre de la sesión paralela operational-budget-ux-v1:
- supabase db reset local
- RLS runtime harness
- smoke MVP e2e
- servidor local

Registrados como PENDIENTES para ejecución posterior.
