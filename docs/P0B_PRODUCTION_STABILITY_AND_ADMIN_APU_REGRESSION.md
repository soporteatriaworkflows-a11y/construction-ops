# P0B Production Stability and Admin APU Regression

Estado: en rama, sin merge, sin deploy.

## Objetivo

Hotfix app-side urgente para reducir saturacion de conexiones en produccion y restaurar accesos profundos de APU/BOQ para perfiles internos autorizados durante la demo.

## Diagnostico

- El cliente `postgres` estaba configurado con `max: 10` por instancia serverless.
- Produccion usa Supavisor en session mode con `pool_size: 15`; varias lambdas y cargas paralelas pueden agotar el pool aunque cada pagina falle de forma intermitente.
- El hotfix P0A agrego degradacion amable, pero aun habia fan-out en cargas criticas y fallbacks que ocultaban acciones administrativas.
- En el workspace BOQ, las acciones profundas existian parcialmente, pero quedaban poco visibles o detras de la seleccion de fila; bajo error parcial de biblioteca APU el header accionable tambien podia desaparecer.

## Cambios

- Default app-side del pool Postgres reducido a 1 conexion por instancia.
- Override opcional por codigo, sin tocar envs: `POSTGRES_POOL_MAX` o `DB_POOL_MAX`, limitado a 10.
- Carga secuencial en read-model para computo de presupuesto y catalogo de recursos.
- Carga secuencial de capitulos/items y resumen/AIU en el BOQ workspace.
- Fallbacks de APU y Catalogo mantienen header/navegacion/acciones cuando falla la lectura pesada.
- BOQ workspace muestra acciones explicitas para perfiles con `canEdit` existente: `Editar detalle`, `Ver vinculo`, `Abrir APU` cuando aplica.

## Restricciones

Sin Supabase Cloud, sin db push, sin migraciones, sin RLS, sin Vercel envs, sin `DATABASE_URL`, sin usuarios reales, sin deploy, sin merge, sin tag. No cambia role-map, DB enum ni permisos funcionales amplios.

## Riesgo restante

Este hotfix reduce presion por instancia y fan-out de request, pero no cambia el limite real de Supavisor/session pool. Si la demo sigue mostrando `EMAXCONNSESSION`, se requiere gate P0C separado de infraestructura/env/pool con autorizacion explicita.