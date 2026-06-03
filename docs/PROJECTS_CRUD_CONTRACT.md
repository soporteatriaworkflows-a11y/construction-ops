# PROJECTS_CRUD_CONTRACT — Oleada 4B.1 (vertical slice real de proyectos)

> **Estado:** CONGELADO v1 (2026-06-02). Propiedad del contrato: `agent-orchestrator`.
> Implementan: `agent-db-rls` (esquema + repositorio de escritura + RLS) y
> `agent-frontend-boq` (server action + UI). Cambios al contrato pasan por
> `docs/INTEGRATION_REQUESTS.md`.
>
> **Alcance 4B.1:** crear proyecto, listar proyectos de la organización
> autenticada y abrir un detalle básico, contra Supabase DB (`READ_MODEL_SOURCE=db`),
> con aislamiento por organización garantizado por RLS. **Sin** presupuesto, Excel,
> edición avanzada, eliminación, Homecenter, exports ni planificación editable.

---

## 1. Diagnóstico del estado previo (congelado v1, migración `…090200` + RLS `…091000`)

Tabla `public.projects`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` (server/DB) |
| `organization_id` | uuid NOT NULL | FK `organizations(id)` ON DELETE CASCADE |
| `code` | text NOT NULL | **UNIQUE(`organization_id`,`code`)** |
| `name` | text NOT NULL | |
| `status` | text NOT NULL DEFAULT `'active'` | CHECK ∈ {`active`,`archived`,`closed`} |
| `client_reference` | text NULL | (no usado en 4B.1) |
| `location` | text NULL | **se usa para "Ciudad" en 4B.1** (ver §3) |
| `start_date` | date NULL | (no usado en 4B.1) |
| `estimated_end_date` | date NULL | (no usado en 4B.1) |
| `created_at` | timestamptz NOT NULL DEFAULT now() | DB |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | trigger `set_updated_at` |

RLS de `projects` (ya existente, `FORCE ROW LEVEL SECURITY`):
- `SELECT/INSERT/UPDATE/DELETE` gated en `organization_id = app.current_org()`.
- `app.current_org()` deriva la org del **JWT** (claim), nunca del navegador.

**Gaps a resolver por `agent-db-rls` (migración nueva, reversible):**
1. **Falta `created_by`** → agregar columna.
2. **Falta `description`** → agregar columna.
3. `code` es obligatorio y NO está en el input del navegador → **autogenerado server-side** (ver §4).

`ReadModelPort` (`@/lib/contracts/read-model`) es **solo lectura**. 4B.1 introduce una
**capa de escritura nueva** (no se modifica la interfaz congelada del read-model).

---

## 2. Cambios de esquema (migración por `agent-db-rls`)

Migración nueva `supabase/migrations/<timestamp>_projects_authorship.sql` (con bloque
`-- DOWN` reversible):

```sql
ALTER TABLE projects
  ADD COLUMN description text,
  ADD COLUMN created_by  uuid REFERENCES profiles (id) ON DELETE SET NULL;

CREATE INDEX projects_created_by_idx ON projects (created_by);
```

Reglas:
- `created_by` **nullable** (filas previas / fixture sin autor; inserciones 4B.1 lo
  setean server-side). FK a `profiles(id)` (en v1 `profiles.id = auth.users.id`).
- `ON DELETE SET NULL`: borrar un perfil no borra el historial de proyectos.
- **No** se altera la política RLS de `projects` (el aislamiento por `organization_id`
  ya cubre INSERT/SELECT). Opcional/defensivo: `agent-db-rls` puede endurecer la
  política `projects_insert` para exigir `created_by = app.current_org_user()` SI lo
  considera, documentándolo; no es obligatorio en 4B.1.
- Actualizar `docs/DATABASE_SCHEMA.md` con las 2 columnas.

---

## 3. Mapeo "Ciudad" → `location` (decisión congelada)

El input de UI rotula **"Ciudad"** y se **persiste en la columna existente `location`**.
No se crea una columna `city` (evita redundancia; `location` ya viaja en el read-model
`ProjectListItem.location`). Si el negocio luego separa dirección/ciudad, se hará en una
oleada posterior. En DTOs y UI de 4B.1, "Ciudad" ↔ `location`.

---

## 4. Generación de `code` (server-side, determinística + anti-colisión)

`code` NO se acepta del navegador. Lo genera el repositorio de escritura:
1. `base = slug(name)`: minúsculas, ASCII, espacios→`-`, solo `[a-z0-9-]`, recortado a
   ≤ 40 chars, sin guiones colgantes. Si queda vacío ⇒ `base = 'proyecto'`.
2. Candidato inicial `code = base`. Si colisiona con UNIQUE(`organization_id`,`code`),
   probar `base-2`, `base-3`, … hasta encontrar libre (límite razonable de reintentos;
   si se supera, error sanitizado).
- La unicidad real la garantiza el índice `projects_org_code_uq`; ante carrera, capturar
  el conflicto (23505) y reintentar.

---

## 5. DTOs (fuente única de tipos)

Ubicación de tipos de escritura: nuevo módulo `apps/web/server/projects/` (propiedad
`agent-db-rls` para repo; tipos compartidos importables por la UI). NO duplicar DTOs.

```ts
/** Entrada PERMITIDA desde el navegador (lo único que el cliente puede enviar). */
export interface CreateProjectInput {
  name: string;            // obligatorio, 1..160 chars (tras trim)
  city: string;            // obligatorio, 1..120 chars (tras trim) → persiste en `location`
  description?: string;    // opcional, ≤ 2000 chars
  initialStatus?: 'active'; // opcional; ÚNICO valor permitido al crear en 4B.1; default 'active'
}

/** Detalle básico de un proyecto (4B.1; sin presupuesto). */
export interface ProjectDetailView {
  id: Uuid;
  name: string;
  city: string | null;        // = projects.location
  description: string | null;
  status: ProjectStatus;      // 'active' | 'archived' | 'closed'
  createdAt: IsoDateTime;
}
```

`listProjects` reutiliza el DTO existente `ProjectListItem` del read-model (no se cambia).

---

## 6. Capa de escritura (propiedad `agent-db-rls`)

Nuevo `apps/web/server/projects/repository.ts` (o equivalente), con interfaz e impl:

```ts
export interface ProjectsWriteRepository {
  createProject(
    viewer: AuthenticatedViewer,   // tiene organizationId + profileId + role (server-side)
    input: CreateProjectInput,
  ): Promise<ProjectDetailView>;

  getProjectById(
    viewer: ViewerContext,         // organizationId + role
    projectId: Uuid,
  ): Promise<ProjectDetailView>;   // lanza ProjectNotFoundError si no existe / cross-org
}
```

Reglas de implementación (NO negociables):
- Usa el **cliente server RLS-bound** (`@/lib/supabase/server` `createClient()`), que
  porta el JWT del usuario. **Nunca service-role** en el flujo de aplicación.
- `organization_id` = `viewer.organizationId` (server). RLS `WITH CHECK` exige
  `= app.current_org()`; un mismatch ⇒ la inserción es rechazada por RLS.
- `created_by` = `viewer.profileId` (server). Nunca del navegador.
- `code` autogenerado (§4). `status` = `input.initialStatus ?? 'active'` (validado).
- `getProjectById`: `SELECT` filtrado por id; RLS limita a la org del viewer ⇒ un id de
  otra org devuelve 0 filas ⇒ `ProjectNotFoundError` (no se filtra existencia cross-org).
- Errores → tipos de dominio (`ProjectNotFoundError`, error de validación) que la capa
  superior **sanitiza**; nunca propagar SQL/stack al navegador.
- **Aislamiento empírico** verificado con RLS runtime (ver §9).

Modo `fixture` (demo/tests): la escritura **no aplica** (el fixture es de solo lectura,
golden master sanitizado). `createProject` en modo fixture ⇒ error explícito
"creación de proyectos requiere READ_MODEL_SOURCE=db". `getProjectById` puede resolver
sobre el fixture para el proyecto demo en preview.

---

## 7. Server action + UI (propiedad `agent-frontend-boq`)

`apps/web/app/(dashboard)/projects/…` + server action (p. ej.
`apps/web/app/(dashboard)/projects/actions.ts`).

Flujo `createProjectAction`:
1. **Resolver viewer real** con `resolveAuthenticatedViewer()` (sesión→profiles). Sin
   sesión/membresía/rol ⇒ error de auth (deny). NUNCA usar org/created_by del navegador.
2. **Requisito de modo**: la creación exige `APP_AUTH_MODE=supabase` **y**
   `READ_MODEL_SOURCE=db`. En `demo`/`fixture` el botón "+ Nuevo proyecto" se muestra
   **deshabilitado** y la action retorna error claro si se invoca.
3. **Validar** `CreateProjectInput` (campos obligatorios, longitudes, `initialStatus`).
4. `repo.createProject(viewer, input)`.
5. `revalidatePath('/projects')` + redirect seguro al detalle (`/projects/<id>`) o a la
   lista; mensajes loading/success/error sanitizados.

Listado `/projects`:
- `READ_MODEL_SOURCE=db` ⇒ `getReadModel().listProjects(viewer real)` (proyectos reales
  de la org autenticada).
- `READ_MODEL_SOURCE=fixture` ⇒ lista del fixture (demo) con `getDemoViewer()`.
- El viewer se resuelve por modo (`resolveViewer()`), nunca del navegador.

Detalle básico `/projects/[id]`:
- Muestra `name`, `city`(=location), `description`, `status`, `createdAt`. **Sin**
  presupuesto. Usa `getProjectById(viewer, id)`; cross-org / inexistente ⇒ 404 amable.

Formulario "+ Nuevo proyecto":
- Campos: nombre (obligatorio), ciudad (obligatorio), descripción (opcional), estado
  inicial (select limitado a `active` en 4B.1). Validación, loading, success, error.
- **No** envía `organization_id`, `created_by`, `code`, `id` ni `role`. Si llegaran,
  se ignoran server-side.

---

## 8. Reglas de seguridad (resumen NO negociable)

1. Nunca aceptar `organization_id` desde formulario, URL o query params.
2. Nunca aceptar `created_by` desde el navegador.
3. Negar creación sin viewer autenticado (deny-by-default).
4. Negar acceso cross-org (RLS + 404 amable).
5. No confiar en `role` del navegador (se deriva server-side de `profiles`).
6. Errores sanitizados; sin SQL/stack al cliente.
7. Sin service-role en el flujo de aplicación.
8. El fixture sigue disponible **solo** como modo explícito demo/tests.

---

## 9. Validación exigida (RLS runtime + smoke local)

RLS runtime (extender `scripts/rls-runtime/run.ts`) debe probar al menos:
- INSERT de proyecto dentro de la org del viewer ⇒ OK; aparece en SELECT de esa org.
- SELECT solo devuelve proyectos de la org actual (aislamiento A/B).
- `getProjectById` de un proyecto de **otra** org ⇒ 0 filas (bloqueado).
- Usuario **sin sesión** ⇒ INSERT/SELECT denegados.
- Usuario **sin membresía** ⇒ denegado.
- INSERT con `organization_id` de otra org (intento de spoofing) ⇒ rechazado por RLS.

Smoke local (`APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=db`, Supabase local PG17):
login → `/projects` lista solo la org → crear proyecto → aparece en lista → abrir
detalle → cross-org bloqueado → sin sesión redirigido → sin membresía bloqueado →
volver a `fixture` mantiene la demo operativa.

---

## 10. Fuera de alcance 4B.1

Carga Excel · presupuesto completo · edición avanzada · eliminación · Homecenter ·
exports reales · planificación editable · escritura remota en producción · activar
`READ_MODEL_SOURCE=db` en Vercel. Todo ello en oleadas posteriores con autorización.
