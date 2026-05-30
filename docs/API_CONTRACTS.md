# API Contracts — Construction Ops

Este documento es propiedad de **agent-orchestrator**. Define los
contratos de tipos, funciones y endpoints que los agentes especializados
consumen y proveen.

> ⏳ **Pendiente**: este documento se completa al inicio de la Oleada 1,
> después de que el usuario complete `docs/PROJECT_MASTER.md` y de que
> `agent-db-rls` proponga el esquema inicial.

---

## Convenciones generales

- TypeScript estricto (`strict: true`, `noUncheckedIndexedAccess: true`).
- Tipos numéricos financieros usan `Decimal` (Decimal.js), no `number`.
- Fechas en `Date` o ISO 8601 con TZ.
- Sin `any` en interfaces públicas.
- Nombres en `camelCase`; tipos e interfaces en `PascalCase`.
- Errores tipados con clases concretas (no `throw new Error(string)` libres).

---

## Contratos por módulo (a definir)

### cost-domain → consumido por frontend-boq, dashboard, exports
- `calculateApuComponent(...)`
- `calculateApuUnitPrice(...)`
- `calculateBoqItem(...)`
- `calculateChapterTotal(...)`
- `calculateDirectCosts(...)`
- `calculateAiu(...)`
- `calculateTotal(...)`
- `calculateValuePerSqm(...)`
- `cloneEstimateVersion(...)`
- `createSnapshot(...)`

### pricing → consumido por cost-domain, dashboard, exports
- `getBudgetReferencePrice(...)` (cliente-safe)
- `getInternalPricing(...)` (solo gerencia/admin)
- `calculateProjectedSaving(...)`
- `calculateRealizedSaving(...)`
- `approvePriceVariation(...)`

### db-rls → consumido por todos
- Tipos generados por Drizzle ORM.
- Helpers de inserción que aplican RLS y `organization_id` automático.

### planning → consumido por dashboard, exports
- `computeCriticalPath(...)`
- `computeProgressGap(...)`
- `validateNoCycles(...)`

### exports → consumido por frontend-boq
- `generateBudgetXlsx(profile)`
- `generateBudgetPdf(profile)`
- `generateScheduleXlsx(...)`

### homecenter → consumido por pricing
- Implementación de `SupplierAdapter` para Homecenter.

---

## Endpoints REST/RSC (a definir cuando se inicie Oleada 1)

| Método | Ruta | Rol mínimo | Descripción |
|--------|------|------------|-------------|
| GET    | `/api/projects` | usuario | Lista proyectos visibles |
| POST   | `/api/projects` | presupuestador | Crea proyecto |
| GET    | `/api/estimates/:id` | usuario | Detalle de presupuesto |
| POST   | `/api/estimates/:id/issue` | gerencia | Emite versión |
| GET    | `/api/exports/budget` | usuario | Descarga según perfil del rol |

> Los endpoints definitivos se documentan tras decidir RSC vs API routes.

---

## Reglas de cambio

1. Cualquier modificación de tipos públicos requiere actualizar este
   documento y notificar a los agentes que lo consumen.
2. Los cambios incompatibles se versionan (v1, v2) y se mantiene v1
   durante el ciclo de migración.
3. La actualización de este archivo es responsabilidad exclusiva del
   `agent-orchestrator`. Otros agentes solicitan cambios vía
   `docs/INTEGRATION_REQUESTS.md`.
