# STEEL OPS — Contrato de flag aislado UIX + spec de Rebanada 1 (solo documento)

**Fecha:** 2026-07-03 · **Owner:** Fable UIX · **Estado:** SOLO DOCUMENTACIÓN —
**cero código, cero archivos nuevos, cero edición de gating real.**
**Motivo de esta pausa:** Codex está verificando F1 (dominio puro) y se
detectó que typecheck/lint/tests no corrieron correctamente en el worktree
(uso de `npm` en vez de `pnpm`, o dependencias faltantes). Hasta que esa
verificación cierre en verde, esta sesión no toca `app/(dashboard)`,
navegación, `server/access`, DB, RLS ni Supabase.

Este documento profundiza — sin ejecutar nada — los 5 puntos pedidos, y
complementa (no reemplaza) `docs/STEEL_OPS_UIX_V1_CONTRACT.md`, que ya
quedó en estado PROPUESTO y sigue siendo la referencia madre.

---

## 1. Contrato del feature flag aislado

**Nombre:** `STEEL_OPS_UIX_PREVIEW` (booleano, variable de entorno).

**Regla de existencia:** ausente o distinto de `'true'` ⇒ el módulo **no
existe** para nadie (ni admin). No hay estado intermedio "existe pero
oculto"; si el flag está off, cualquier intento de acceso a una ruta
`steel/*` debe comportarse exactamente igual que una ruta que nunca se
escribió (404).

**Condición de visibilidad completa (ambas deben cumplirse):**
1. `process.env.STEEL_OPS_UIX_PREVIEW === 'true'`.
2. `profileRole` (resuelto server-side, mismo actor que ya resuelve cada
   `page.tsx` existente) ∈ `{admin, gerencia, presupuestos}` — espejo de D1
   para esta fase (compras/obra fuera hasta que D1 lo confirme para F3 real;
   consulta/cliente nunca).

**Alcance del flag:** SOLO gatea las rutas `steel/*` de esta fase boceto.
No es el flag final del blueprint (`STEEL_OPS_ENABLED` + `ACCESS_MODULES`),
que requiere tocar archivos compartidos y queda fuera de este momento.

**Ciclo de vida:** temporal. El día que se apruebe la integración real
(post F1+F2, con orquestador mediando la edición de `module-access.ts` y
`sidebar-nav.tsx`), este flag y su archivo se retiran por completo — no
coexisten dos mecanismos de gating para el mismo módulo.

**Dónde se define el valor del env:** solo en `.env.local` de cada
desarrollador que quiera previsualizar, nunca en `.env.example` con un valor
distinto de vacío/ausente, nunca en variables de entorno de Vercel/CI/prod.
Esto es una regla operativa, no algo que este documento aplique — se deja
anotada para cuando se ejecute.

## 2. Cómo se vería el módulo sin tocar el gating real

Recorrido paso a paso de lo que pasaría (todavía no implementado):

1. Un usuario con rol permitido y el env activado en su máquina navega
   manualmente a `/steel` (nadie lo encuentra por el sidebar, porque el
   sidebar no tiene esa entrada — cero edición a `sidebar-nav.tsx`).
2. El Server Component de `steel/page.tsx` (no creado aún) resolvería el
   actor de la misma forma que ya lo hacen las páginas existentes, evaluaría
   la condición del §1, y si no se cumple, llamaría `notFound()` de
   Next.js — la misma respuesta que un usuario obtiene hoy si visita
   cualquier ruta que no existe.
3. Si se cumple, renderiza el hub/dashboard con datos 100% mock (ninguna
   lectura a Supabase, ninguna tabla `steel_*`, nada de `modules/steel/*`).
4. Ningún otro módulo cambia de comportamiento: `ACCESS_MODULES`,
   `MODULE_ACCESS`, `NAV_ITEMS`, `command-palette-data.ts` quedan
   byte-idénticos a como están hoy.
5. Para cualquier usuario sin el env local activo — es decir, el 100% de
   producción y el 100% de cualquiera que no sea un desarrollador
   deliberadamente previsualizando — el módulo simplemente no está: mismo
   comportamiento que si el código no existiera en el repo.

Esto es lo que permite, en teoría, escribir y revisar la UI en una rama sin
que "exista" para nadie más — pero **no se ejecuta todavía** por indicación
explícita de esta pausa.

## 3. Qué archivo/capa debería ser responsable del flag (propuesta, sin crear)

**Propuesta:** un único archivo puro, sin dependencias de
`server/access/*`, ubicado en `apps/web/lib/steel/preview-gate.ts` (no
creado). Razones:

- **Aislamiento real:** si vive fuera de `server/access/`, no hay forma de
  que tocarlo colisione con el archivo que es propiedad de
  agent-orchestrator (`module-access.ts` declara esa propiedad en su propio
  encabezado).
- **Responsabilidad única:** una función pura `isSteelUixPreviewEnabled(role)`
  que solo sabe leer un env var y comparar contra una lista de roles
  permitidos — nada de I/O, nada de sesión, nada de Supabase. Testeable en
  aislamiento total (matriz rol×env, 8 casos).
- **Reemplazo limpio:** cuando llegue la integración real, este archivo se
  borra entero y cada `page.tsx` cambia una sola línea (de
  `isSteelUixPreviewEnabled(role)` a `requireModuleAccess('steel')`) — no
  queda código muerto ni flags duplicados.
- **Quién lo tocaría y cuándo:** nadie todavía. Cuando se apruebe la
  Rebanada 1, lo crea/edita quien ejecute esa rebanada (Fable UIX, en su
  propia rama, sin tocar `server/access/`). Su eventual retiro sí requiere
  coordinarse con agent-orchestrator porque ese paso sí toca el archivo
  compartido.

## 4. Qué puede hacer Fable UIX ahora vs qué espera a Codex/F1

| Puede hacer AHORA (docs, sin código) | Debe esperar |
|---|---|
| Especificar la forma de los mocks (nombres de campo, tipos, casos límite) en prosa/tablas | Crear `lib/steel/mocks.ts` real (es código) |
| Especificar el contrato del flag (este documento) | Crear `lib/steel/preview-gate.ts` real |
| Detallar wireframes/flujos en texto o diagramas dentro de un `.md` | Crear cualquier `page.tsx`, `_components/*`, o tocar `app/(dashboard)` |
| Mapear qué componente compartido existente se reutiliza para cada pantalla | Editar `sidebar-nav.tsx`, `module-access.ts`, `command-palette-data.ts` |
| Revisar/comentar el avance del contrato F1 si la usuaria lo comparte | Escribir o modificar nada en `modules/steel/*` (dominio, es de Codex) |

**Nota técnica, no una objeción a la pausa:** por diseño, la Rebanada UIX 1
(§5) no importa nada de `modules/steel/*` ni de tablas `steel_*` — sus
mocks son datos estáticos propios, no dependen de que F1 esté verificado.
La espera actual es una decisión de secuenciación de la usuaria (razonable:
no generar más superficie mientras Codex resuelve el entorno), no un
bloqueo técnico real entre F1 y la UIX. Se deja anotado únicamente para que
la usuaria decida con esa información completa — la sesión sigue en pausa
de código hasta nueva indicación.

**Qué espera explícitamente a Codex/F1 (aunque no bloquee UIX técnicamente):**
cualquier vinculación real dashboard↔dominio (cálculos de desperdicio,
FFD, banco de sobrantes reales) — eso siempre fue de Codex, con o sin esta
pausa.

## 5. Rebanada UIX 1 — spec en documento (nada de código todavía)

Repite el alcance de `STEEL_OPS_UIX_V1_CONTRACT.md` §8, con más detalle de
contenido para que, cuando se autorice, la ejecución sea mecánica:

**`preview-gate.ts` (spec, no creado):** exporta una función pura que recibe
`role: string | null | undefined` y retorna `boolean`; internamente lee
`process.env.STEEL_OPS_UIX_PREVIEW` y compara contra el env de módulo
(`AccessModule`-agnóstico, no importa nada de `server/access`). Sin clases,
sin estado.

**`types.ts` (spec):** interfaces mock `SteelTakeoffMock`, `SteelElementMock`,
`SteelLineMock` (con `verificationStatus`, `wasteMode`, `assumedWastePct`),
`SteelOffcutMock`, `SteelOrderMock`, `SteelSupplierQuoteMock`,
`SteelSpecMock` — nombres de campo alineados a las entidades §4 del
blueprint para minimizar reescritura futura, pero explícitamente marcadas
como `Mock` en el nombre del tipo para que nadie las confunda con el
contrato real de dominio (que define Codex en F1).

**`mocks.ts` (spec):** 3-5 registros por entidad, incluyendo deliberadamente:
una línea `needs_review`, una línea sin precio, una línea con desperdicio en
cada uno de los 3 rangos de D5 (por debajo de advertencia, entre advertencia
y crítico, por encima de crítico) para refuerzo Y para perfiles (6
combinaciones), un sobrante justo en el mínimo útil (0.30 m refuerzo /
0.50 m perfiles) y uno por debajo (para el estado "no reutilizable").

**`steel/page.tsx` (spec):** Server Component; resuelve actor → evalúa
`isSteelUixPreviewEnabled` → `notFound()` si falso → si verdadero, renderiza
`<SteelDashboard>` con los mocks importados directamente (sin fetch, sin
Server Action todavía).

**`_components/steel-dashboard.tsx` (spec):** KPIs (total kg/ml/costo
estimado, desperdicio por modo, alertas críticas contadas) usando el patrón
de `kpi-card.tsx`; una gráfica de barras por familia (Recharts, patrón
`chapter-bar-chart.tsx`); sección de "estado de pedidos" con `status-badge.tsx`;
si `MOCK_STEEL_TAKEOFFS` está vacío (caso de prueba, no el default), debe
mostrar `EmptyState` con copy "Aún no hay estudios de acero en este
proyecto" + CTA deshabilitado (mock, sin acción real).

**Tests (spec, no escritos):** matriz rol×env de `preview-gate` (8 casos);
forma/tipos de los mocks; render de `EmptyState` con lista vacía inyectada;
clasificación correcta de severidad en los 6 casos de desperdicio D5.

**Definición de "lista para ejecutar":** cuando la usuaria dé el visto
bueno a este documento Y Codex confirme F1 verificado en verde (o la
usuaria decida explícitamente desacoplar los tiempos), se ejecuta esta
rebanada como PR aislado, sin tocar ningún archivo fuera de `lib/steel/*`,
`app/(dashboard)/steel/*` y `tests/**/steel*`.

---

**Este documento no crea, edita ni elimina ningún archivo de código.**
Registrado en `HANDOFF_LOG.md` para trazabilidad.
