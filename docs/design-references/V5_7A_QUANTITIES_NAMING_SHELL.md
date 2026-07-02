# V5.7A Quantities Naming Shell

Fase: `V5.7A_QUANTITIES_NAMING_SHELL`  
Rama: `feature/v5-7a-quantities-naming-shell`  
Alcance: UIX presentacional del modulo de Cantidades.

## Objetivo

Hacer que `/quantities` y `/quantities/workspace` comuniquen una idea unica:

> De aqui salen las cantidades reales que alimentan el presupuesto.

La fase no cambia calculos, formulas, sync, BOQ, APU, RLS, migraciones ni repositorios server.

## Cambios visuales

- Titulo unificado: `Cantidades de obra`.
- Subtitulo permanente: `De aqui salen las cantidades reales que alimentan el presupuesto.`
- `Workspace de Cantidades` pasa a llamarse `Mediciones`.
- Tabs estilo FilterPills:
  - `Mediciones` -> `/quantities/workspace`
  - `Memorias importadas` -> `/quantities?tab=imports`
  - `Sincronización` -> `/quantities?tab=sync`
- Callout permanente:
  `Flujo de cantidades  Mide o importa  revisa bruto/neto  envía al presupuesto. El presupuesto nunca se modifica sin tu confirmación: siempre verás un preview.`
- Stepper estatico presentacional:
  `Medición/Excel  Cantidades  Presupuesto  Subtotal  Exportación`
- Empty states diferenciados para hub sin cantidades, mediciones vacias, memorias vacias, sincronizacion vacia y roles sin permiso de crear/importar.

## Limites respetados

- No se toca `apps/web/server/quantity-workspace`.
- No se toca `apps/web/server/quantity-import`.
- No se tocan formulas ni recalculo de cantidades en frontend.
- No se tocan sync actions, BOQ, APU, RLS, migraciones, Supabase, Vercel envs ni `DATABASE_URL`.
- No se modifica V5.6.2B ni roles/permisos.

## Notas de implementacion

- Se agrega `app/(dashboard)/quantities/_components/quantities-shell.tsx` como componente presentacional.
- La navegacion usa rutas existentes y un query param simple para tabs del hub.
- La tab `Sincronización` queda como estado honesto: la sincronizacion real sigue viviendo en cada grupo de Mediciones y conserva preview obligatorio.