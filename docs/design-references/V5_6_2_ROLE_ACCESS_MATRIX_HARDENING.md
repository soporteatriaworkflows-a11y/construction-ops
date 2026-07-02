# V5.6.2 — ROLE_ACCESS_MATRIX_HARDENING

**Tipo:** Endurecimiento de acceso app-layer (sin migración, sin RLS, sin DB).
**Base:** `origin/main` incluyendo PR #25 / V5.6.1E (invite membership final fix).
**Alcance:** cerrar SUPERFICIE por módulo para los **6 roles reales**
(`admin, gerencia, presupuestos, compras, obra, consulta`).
`cliente`/`contratista` **NO** existen todavía (futuro: migración/RLS/portal).

---

## 1. Problema

- `consulta` ya mapea a `ViewerRole=client` y el read-model ya **omite campos 🔒**
  para `client` (privacidad de datos backend-first, intacta).
- Pero la app exponía demasiada **superficie**:
  - el sidebar mostraba módulos internos a todos;
  - `proxy.ts` valida **autenticación**, no módulo/rol;
  - `consulta` (u otro rol) podía **intentar abrir módulos internos por URL**.

El objetivo es **cerrar superficie**, no cambiar el modelo de datos. RLS y la
proyección por rol siguen siendo los backstops reales.

---

## 2. Arquitectura de la solución (defensa en profundidad)

1. **Fuente única pura** `apps/web/server/access/module-access.ts`:
   `AccessModule`, `canAccessModule(profileRole, module)`, `visibleModulesFor`,
   `assertCanAccessModule`, `isAccessModule`. **Deny-by-default**.
   Se decide por `profiles.role` (NO por `ViewerRole`, que no distingue admin de
   otros internos).
2. **Guards server-side** `apps/web/server/access/guard.ts`:
   - `requireModuleAccess(module)` (páginas/layouts) → redirect `/login` sin
     sesión, `/dashboard` si el rol no puede.
   - `checkModuleAccess(module)` (server actions) → no redirige; `{ ok }` para que
     la action responda con su shape de error antes de tocar datos.
3. **Sidebar filtering** por `canAccessModule` (UX; NO es la barrera).
4. **Route guards** en las páginas de módulos internos.
5. **Server action guards** en mutaciones sensibles.
6. **Datos/exports:** sin cambios. RLS + proyección por rol + anti-escalamiento
   (`isSameOrLessPrivileged`) intactos.

---

## 3. Matriz implementada (allow por `profiles.role`)

`F/E/R` = puede abrir/ver (el detalle lectura/escritura lo imponen las actions y
RLS). `—` = denegado (deny-by-default).

| Módulo \ Rol            | admin | gerencia | presupuestos | compras | obra | consulta |
|-------------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| dashboard               | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| projects                | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| estimates (BOQ)         | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| apu                     | ✓ | ✓ | ✓ | — | — | ✓ |
| quantities              | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| planning                | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| catalog                 | ✓ | ✓ | ✓ | ✓ | — | — |
| price-intelligence      | ✓ | ✓ | — | ✓ | — | — |
| monitoring              | ✓ | ✓ | — | ✓ | — | — |
| operational-review      | ✓ | ✓ | — | — | — | — |
| quick-notes             | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| settings (perfil propio)| ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| settings-access         | ✓ | ✓ | — | — | — | — |
| exports                 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (solo perfil client) |

**Bloqueado para `consulta`:** catalog, price-intelligence, monitoring,
operational-review, quick-notes, settings-access, exports ≠ client, escritura.

**Bloqueado para `obra`:** catalog, apu, price-intelligence, monitoring,
operational-review, settings-access.

**Bloqueado para `compras`:** estimates, apu, quantities, planning,
operational-review, settings-access.

**Bloqueado para `presupuestos`:** price-intelligence, monitoring,
operational-review, settings-access.

### Decisión a confirmar (documentada, no bloqueante)
El set permitido de `presupuestos` (spec V5.6.2) **excluye** price-intelligence y
monitoring, aunque su `ViewerRole=internal` técnicamente los veía antes. Se
implementa según la matriz solicitada; si negocio prefiere que `presupuestos`
consulte inteligencia/monitoreo de precios, es un cambio de **una línea** en
`MODULE_ACCESS`. Igual criterio para `compras`↔estimates/apu.

---

## 4. Inventario de rutas reales (encontradas en el repo)

| Módulo | Ruta real |
|---|---|
| dashboard | `/dashboard` |
| projects (+ BOQ workspace anidado) | `/projects`, `/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/...` |
| estimates | `/estimates`, `/quote` |
| apu | `/apu` |
| quantities | `/quantities` |
| planning | `/planning` |
| catalog | `/catalog`, `/catalog/import`, `/catalog/providers*`, `/catalog/resources/new` |
| price-intelligence | `/catalog/resources/[resourceId]/price-intelligence` |
| monitoring | `/catalog/monitoring` |
| operational-review | `/catalog/prices/review` |
| quick-notes | sin página propia (embebido en `/dashboard`; `notes-actions.ts`) |
| settings-access | `/settings/access` |
| settings (propio) | `/settings`, `/settings/account`, `/settings/*` |
| exports | `/api/exports` |

> Nota: price-intelligence, monitoring y operational-review viven **bajo
> `/catalog`**. Por eso `catalog/layout.tsx` gatea el subárbol (deny obra/consulta)
> y cada sub-página añade su guard de módulo más estricto.

---

## 5. Guards server-side agregados

**Route guards (Server Components):**
- `app/(dashboard)/catalog/layout.tsx` → `requireModuleAccess('catalog')` (todo el
  subárbol /catalog; deny `obra`/`consulta`).
- `catalog/prices/review/page.tsx` → `requireModuleAccess('operational-review')`.
- `catalog/monitoring/page.tsx` → `requireModuleAccess('monitoring')`.
- `catalog/resources/[resourceId]/price-intelligence/page.tsx` →
  `requireModuleAccess('price-intelligence')`.
- `settings/access/page.tsx` — guard `canManageAccess` **preexistente** (intacto).

**Server action guards (`checkModuleAccess`, antes de tocar datos):**
- `catalog/actions.ts` → `catalog`.
- `catalog/monitoring/actions.ts` (en el resolver compartido) → `monitoring`.
- `catalog/prices/review/actions.ts` (en `runBulkAction`) → `operational-review`.
- `catalog/resources/[resourceId]/price-intelligence/actions.ts` (5 actions) →
  `price-intelligence`.
- `dashboard/notes-actions.ts` (en el resolver compartido) → `quick-notes`.

Los guards ViewerRole existentes (`['management','internal']` / deny-client de
quick-notes) **permanecen**; el guard de módulo es defensa en profundidad
adicional. RLS es el backstop real.

---

## 6. Ocultar UI vs proteger server-side

- El **sidebar filtering** (`canAccessModule` en `sidebar-nav.tsx`) es UX: reduce
  ruido, **no** es la barrera.
- La barrera real son los **route guards + action guards** (server-side) y, por
  debajo, **RLS + proyección por rol**. Un borrado del guard **rompe un test**
  (`module-access-wiring.test.ts`).

---

## 7. Qué NO se tocó
Migraciones, Supabase Cloud, `db push`, RLS, Vercel envs, SMTP, `DATABASE_URL`,
deploy/tag, `construction-ops-1rqh`, el flujo de invitaciones/correos,
`role-map.ts` (congelado), el read-model y exports (solo se consumen), roles
`cliente`/`contratista`, módulos futuros (progress/finance/contractors/Omni).

---

## 8. Riesgos restantes
- **Endurecimiento de `presupuestos`/`compras`** (ver §3 "Decisión a confirmar"):
  puede restringir flujos previos; reversible en una línea.
- Rutas **no gateadas duro** (estimates/apu/quantities/planning/projects): se
  gobiernan por sidebar + matriz; sus datos ya son client/rol-proyectados por el
  read-model, sin fuga sensible. Si a futuro alguna expone datos internos, añadir
  su `requireModuleAccess`.
- `catalog/providers/*` e `catalog/import` heredan el guard del `catalog/layout`;
  sus actions conservan el guard ViewerRole preexistente (catalog module =
  internal+management, sin delta).
