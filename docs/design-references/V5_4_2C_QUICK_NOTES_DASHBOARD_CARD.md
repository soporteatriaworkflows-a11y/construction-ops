# V5_4_2C_QUICK_NOTES_DASHBOARD_CARD — NotesCard real en el dashboard

## Objetivo
Conectar visualmente Quick Notes en el dashboard usando la lógica de V5.4.2b (repository + actions + guard).
`NotesCard` deja de ser shell estático: muestra notas reales, permite crear y archivar, respeta privacidad, integrado al
sistema visual actual. **Sin migraciones, sin tocar Cloud/RLS, sin rediseñar el dashboard.**

## Qué cambió en `NotesCard` (`components/shared/notes-card.tsx`)
- Pasó de **shell estático** (`EXAMPLE_NOTES` hardcoded, "+" próximamente) a **Server Component CONECTADO**.
- Props: `notes: QuickNoteView[]`, `canCreate: boolean`, `createAction`, `archiveAction`, `className?`.
- Recibe las server actions **por prop** ⇒ el módulo compartido NO depende de la ruta.
- Renderiza: header "Notas rápidas internas" + lista (hasta 5, recientes primero, body + fecha corta) + estado vacío +
  form de crear (si `canCreate`) + botón archivar por nota (si `canCreate`). Mantiene `SurfaceCard variant="metric"` (mismo estilo).

## Subcomponentes interactivos (client aislados, regla P0)
- `components/shared/quick-note-create-form.tsx` (`'use client'`): `useActionState(createAction)`, textarea `name="body"`
  (maxLength 1000), botón deshabilitado mientras guarda (evita doble submit), limpia al éxito, errores CURADOS.
- `components/shared/quick-note-archive-button.tsx` (`'use client'`): `useActionState(archiveAction)`, `noteId` oculto,
  botón deshabilitado mientras archiva, error curado.
- **Importante (P0/bundle)**: los client components importan desde los módulos PUROS (`@/server/quick-notes/types`,
  `.../action-result`), **no el barrel** `@/server/quick-notes` (que arrastra `db-repository → createClient → next/headers`,
  server-only). Test de regresión lo verifica.

## Conexión a actions/repository
- **Lectura**: `dashboard/page.tsx` (Server Component) → `getDashboardQuickNotes(viewer)` (guard app + repo, tolerante a fallo → `[]`).
- **Escritura**: `createQuickNoteAction` / `archiveQuickNoteAction` (V5.4.2b) pasadas como prop a `NotesCard` → a los client subcomponentes.
- `revalidatePath('/dashboard')` en las actions refresca la lista tras crear/archivar.

## Privacidad (privacy-first, sin cambios de criterio)
`ViewerRole === 'client'` (= consulta hoy): el page **no** llama al repositorio (`getDashboardQuickNotes` ⇒ `[]` antes de DB) y
**no renderiza** `NotesCard` (`{canViewNotes && <NotesCard/>}`). El panel Operación ocupa entonces todo el ancho (`lg:col-span-3`),
sin dejar hueco ni revelar que existen notas internas. Doble defensa intacta (RLS 1ª, app guard 2ª).

## Estados
| Estado | Comportamiento |
|--------|----------------|
| **Con notas** | Lista hasta 5 activas, recientes primero, `body` (solo lectura) + fecha corta; botón archivar por nota. |
| **Vacío** | "Sin notas internas activas" (honesto, sin datos fake). |
| **Error** | Mensaje CURADO (validación → bajo el textarea; permiso/archive → curado). Nunca tecnicismos de Postgres/RLS ni stack ni nombres de policies. |
| **Pending** | Textarea + botón deshabilitados mientras guarda/archiva (spinner `Loader2`); evita doble submit. |
| **client** | No se renderiza el card (ni lista, ni form, ni botón). |

## Autor
`QuickNoteView` solo expone `createdBy` (UUID), sin nombre seguro; **no se muestra** el autor (no exponer UUID). Queda para una
fase posterior si se añade un nombre display seguro (requeriría join; fuera de alcance de V5.4.2c).

## Tests (`tests/unit/quick-notes/dashboard-card.test.ts`, 15/0; total módulo 43/0)
NotesCard conectado (no estático, Server Component, map de notas, estado vacío, gating por canCreate, sin edición de body);
create-form (client, useActionState, disabled mientras guarda, errores curados, no importa el barrel); archive-button (client,
noteId oculto, disabled, error curado); page (importa guard+lectura+actions, renderiza solo si canViewNotes, pasa props, lectura
tolerante). Regresión `premium-system.test.ts` sigue verde (NotesCard export + `<NotesCard` en el dashboard).

## QA
typecheck 0 · lint 0 · suite **2246/0** (42 skip) · build 0 · gm 22/22 · quick-notes 43/0 · diff-check limpio.

## Fuera de alcance (respetado)
Sin migraciones · sin db push · sin Supabase Cloud · sin RLS · sin Vercel envs · sin password reset · sin `-1rqh` · sin tag ·
sin deploy · sin rediseño del dashboard · sin Price Intelligence/BOQ/APU/exports · sin cambio al AUTH_CONTRACT. **Sin merge sin aprobación.**

---

## Layout patch (V5.4.2C_QUICK_NOTES_DASHBOARD_LAYOUT_PATCH)

**Problema:** en el layout inicial, `NotesCard` compartía la grilla "Fila B" (`lg:grid-cols-3`) con el panel de KPIs
(capítulos / versiones / precios por revisar). Al crecer (form + lista), estiraba la altura de esa fila ⇒ los KPIs se veían
estirados, pesados y con desperdicio de espacio.

**Corrección (aprobada):** Quick Notes salió de la grilla superior.
- **KPIs (Fila B)**: el panel Operación es ahora **ancho completo** (sin `col-span` condicional atado a Quick Notes). Los KPIs
  quedan compactos y alineados; su altura ya NO depende de las notas.
- **Nueva sección "Pulso operativo"** (debajo de los KPIs): grid `lg:grid-cols-12` con
  - **Quick Notes angosto** (`lg:col-span-4`) — mismo comportamiento funcional (notas reales, crear, archivar, pending, errores
    curados, client no ve, sin edición de body), pero **más compacto**: lista densa (`text-[13px]`, `line-clamp-3`), **altura
    máxima con scroll interno** (`max-h-56 overflow-y-auto`) ⇒ muchas notas no estiran el card; máximo 5.
  - **`OperationsTimelineCard`** (`lg:col-span-8`) — pieza **longitudinal** "Línea de tiempo operativa": **shell honesto** con
    estado "Próximamente" + anclas con datos YA disponibles (`lastUpdatedAt`, `lastRunAt`; sin queries nuevas). Base para V5.4.3;
    **no** construye la feature ni inventa datos.
- **Responsive**: en móvil/tablet la sección se apila (Quick Notes arriba, timeline abajo); sin overflow roto.
- **Privacidad intacta**: `client` sigue sin ver Quick Notes (no se llama al repo; no se renderiza el card). Cuando no hay Quick
  Notes, la timeline ocupa todo el ancho (`lg:col-span-12`).

**Resultado:** Quick Notes ya **no** hace crecer capítulos/versiones/precios por revisar. Tests de layout añadidos
(`dashboard-card.test.ts`: KPIs sin col-span condicional, Quick Notes `col-span-4`, timeline shell sin datos fake, lista con
scroll). QA: typecheck 0 · lint 0 · suite **2250/0** · build 0 · gm 22/22 · quick-notes 47/0.
