# V5.4.4a - Price Intelligence Source History

## Objetivo

Evolucionar la ultima seccion de `/catalog/resources/[resourceId]/price-intelligence` a `Historico y fuentes`, read-only, para entender observaciones recientes, origenes y comparacion derivada por recurso.

## Alcance implementado

- Repository read-only: `listResourcePriceHistory(viewer, resourceId, limit)`.
- Tipo nuevo: `ResourcePriceHistoryRow` y origen `manual | batch | monitor`.
- UI final de pagina: reemplaza el bloque `Historial de observaciones`; no mueve PageHeader, disclaimer, formulario, Validar URL ni MonitoringSection.
- Limite: 25 observaciones recientes; si hay mas, copy `Mostrando las ultimas 25 observaciones`.
- Filtros client-side sobre filas ya cargadas: estado, origen y proveedor, con contador `N de M` y `Limpiar filtros`.

## Datos y origenes

La fuente principal es `resource_price_observations`. El repository lee con cliente Supabase SSR RLS-bound y filtra por `organization_id = viewer.organizationId` y `resource_id`.

Origen derivado:

- `monitor`: existe fila en `price_monitor_results` con `observation_id`.
- `batch`: existe `import_batch_id` sin resultado monitor vinculado.
- `manual`: no hay monitor ni batch.

Si hay monitor se muestran status, `checked_at` y warnings. Si hay lote se muestran label/source reference existentes. Si no hay fuente, se muestra `Sin fuente registrada`.

## Comparacion derivada

El servidor calcula:

- precio nuevo: `suggested_net_price` de la observacion actual;
- precio anterior: ultima observacion `approved` anterior del mismo recurso;
- delta absoluto;
- delta porcentual.

La UI rotula el detalle como `Comparación derivada (referencial no es baseline histórica exacta)`. Si no existe precio anterior aprobado se muestra `Sin precio anterior aprobado para comparar`.

## Privacidad

La pagina conserva visibilidad interna de campos sensibles. Si un rol no interno llegara a renderizar la pagina, antes de pasar datos al componente client se sanitizan proveedor, precios, descuento, neto, source reference, notas, warnings y deltas.

## No alcance

- No migraciones.
- No Supabase Cloud ni db push.
- No cambios RLS.
- No Vercel envs, password reset, tag ni deploy manual.
- No cambios en `/catalog/monitoring` ni V5.4.3.
- No Quick Notes ni Dashboard Project Scope Selector.
- No BOQ/APU/exports.
- No approval/rejection workflow.
- No modelo legacy como fuente principal (`price_observations`, `supplier_products`).