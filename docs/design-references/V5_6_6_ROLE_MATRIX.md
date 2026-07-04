# V5.6.6 — MATRIZ OFICIAL DE ROLES (contrato de acceso)

**Fecha:** 2026-07-03 · **Fase:** `V5_6_6B_ROLE_MATRIX_AND_COMPRAS_WRITE_SURFACE_HARDENING`
**Estado:** contrato OFICIAL. La parte implementada en V5.6.6B es el
endurecimiento de la superficie de escritura de `compras` (app-layer);
el resto de celdas marcadas como FUTURO se implementa en las fases
indicadas (V5.6.6C grants internos, V5.6.6D auditoría, V5.8A portal,
V5.8B PDF presentación).

Fuentes técnicas relacionadas:
- Visibilidad de módulo: `apps/web/server/access/module-access.ts` (V5.6.2).
- Mapeo `profiles.role → ViewerRole`: `apps/web/server/auth/role-map.ts`
  (congelado; admin/presupuestos/compras → `internal`, gerencia →
  `management`, obra → `site`, consulta → `client`).
- Gate de escritura de presupuesto (NUEVO, V5.6.6B):
  `apps/web/server/access/budget-surface.ts`.
- RLS por proyecto para roles cliente: V5.6.4 + V5.6.5A (producción).

Regla transversal: el enum de DB es
`admin | gerencia | presupuestos | obra | compras | consulta`.
**No existe rol DB `cliente`**; la etiqueta visible de `consulta` es
"Cliente / consulta" (V5.6.6A).

---

## 1. ADMIN

1. Módulos visibles: todos.
2. Proyectos visibles: todos (allow-all).
3. Lectura: todo, incluido AIU/costos indirectos, descuentos internos,
   precios de proveedor y auditoría de accesos.
4. Escritura: todo — presupuestos/BOQ/APU/AIU, cantidades, cronograma,
   catálogo/proveedores, importaciones; aprueba/emite/publica versiones;
   gestiona accesos, roles y asignaciones de proyecto (grants).
5. Exports: todos los perfiles.
6. Datos ocultos: ninguno.
7. Acciones auditables: gestión de accesos/roles/grants YA auditada
   (`access_audit_log`). Sus cambios de dominio quedan auditados en
   V5.6.6D (`change_audit_log`) igual que el resto.
8. Pendientes/fases futuras: V5.6.6D auditoría de dominio.

## 2. GERENCIA

1. Módulos visibles: todos.
2. Proyectos visibles: todos.
3. Lectura: todo, incluida auditoría y actividad de otros usuarios.
4. Escritura: todo salvo tocar administradores (restricción vigente:
   no asigna rol admin ni modifica a un admin — RPC `change_member_role`
   + trigger `profiles_guard_privileged_cols`); aprueba/emite/publica;
   asigna grants; cambia roles no-admin.
5. Exports: todos.
6. Datos ocultos: ninguno.
7. Acciones auditables: como admin.
8. Pendientes: V5.6.6D.

## 3. PRESUPUESTOS

1. Módulos visibles: dashboard, projects, estimates, apu, quantities,
   planning, settings propio, exports. (Sin catalog/price-intelligence/
   monitoring/operational-review/settings-access, matriz V5.6.2.)
2. Proyectos visibles: todos. **Decisión aprobada V5.6.6B: allow-all por
   ahora** (sin grants internos para este rol).
3. Lectura: BOQ, APU, AIU/costos indirectos, cantidades, cronograma.
4. Escritura: crea/edita presupuestos, capítulos, BOQ, APU, AIU,
   cantidades e importaciones (incluido en `budget-surface`).
   Emisión/clonación de versiones: se mantiene como hoy (puede emitir);
   la separación estricta "solo admin/gerencia aprueban/publican" se
   implementará junto con el flujo de publicación a cliente (V5.8A) y la
   auditoría (V5.6.6D) para no romper el flujo operativo actual.
5. Exports: técnico/interno y cliente; anti-escalada de perfil vigente
   (no puede pedir perfiles por encima del suyo).
6. Datos ocultos: ninguno crítico (rol de costeo).
7. Acciones auditables: FUTURO V5.6.6D — toda mutación de presupuesto
   con actor/before/after/timestamp.
8. Pendientes: V5.6.6D auditoría; decisión de publicación en V5.8A.

## 4. COMPRAS

1. Módulos visibles: dashboard, projects, estimates (lectura), catalog,
   price-intelligence, monitoring, settings propio, exports.
2. Proyectos visibles: scoped por proyecto según asignación de
   admin/gerencia, reutilizando `project_access_grants` — **IMPLEMENTADO en
   V5.6.6C (en rama; activo en prod tras `V5_6_6C_DB_APPLY_GATE`)**, con
   backfill de continuidad para usuarios existentes.
3. Lectura permitida: catálogo/proveedores/monitoreo completos; dentro
   de proyecto: capítulos, cantidades, valores unitarios y subtotales.
4. Escritura permitida: SOLO su dominio — catálogo, proveedores, precios
   de proveedor, monitoreo, revisión de observaciones según flujo
   existente. **V5.6.6B retira de su superficie: editar/archivar
   capítulos, editar ítems/precios del BOQ, editar AIU/costos
   indirectos, importar presupuesto, gestionar versiones** (helper
   `budget-surface` + backstop en server actions).
5. Exports: catálogo/precios y perfiles no técnicos según pipeline
   existente (anti-escalada vigente).
6. Datos ocultos: **AIU y costos indirectos** (V5.6.6B oculta la sección
   en el detalle del presupuesto; el total general sigue visible).
7. Acciones auditables: FUTURO V5.6.6D — mutaciones de catálogo/precios.
8. Pendientes: V5.6.6C grants; V5.6.6D auditoría. Deuda DB conocida
   (Q-WRITE-1, OPEN_QUESTIONS): las políticas RLS de escritura de la
   cadena de presupuesto aún permiten a roles internos escribir vía
   PostgREST directo; V5.6.6B cierra la superficie app-layer y el
   endurecimiento DB por rol interno se decidirá tras 6C/6D.

## 5. OBRA

1. Módulos visibles: dashboard, projects, estimates (lectura),
   quantities, planning, settings propio, exports.
2. Proyectos visibles: scoped por proyectos/obras asignadas —
   **IMPLEMENTADO en V5.6.6C (en rama; activo en prod tras
   `V5_6_6C_DB_APPLY_GATE`)**, deny-by-default para usuarios nuevos y
   backfill de continuidad para existentes.
3. Lectura: cantidades, cronograma, BOQ de sus proyectos (perfil obra de
   exports ya limita datos sensibles).
4. Escritura: cantidades y cronograma (sus módulos actuales). NO
   presupuesto/BOQ/AIU (V5.6.6B lo excluye de `budget-surface`), NO
   precios, NO aprobación. **FUTURO V5.6.6D: toda edición con historial
   obligatorio (quién/qué/cuándo/por qué) visible para admin/gerencia.**
5. Exports: obra/cliente; sin técnico interno.
6. Datos ocultos: AIU/costos indirectos (V5.6.6B), descuentos internos.
7. Acciones auditables: FUTURO V5.6.6D con `reason` obligatorio.
8. Pendientes: V5.6.6C grants; V5.6.6D historial.

## 6. CLIENTE / CONSULTA (`consulta` → ViewerRole `client`)

1. Módulos visibles HOY: dashboard, projects, estimates, quantities,
   planning (lectura degradada), settings propio, exports (perfil
   cliente). **FUTURO V5.8A: portal cliente dedicado (`/portal`) y salida
   del dashboard operativo.**
2. Proyectos visibles: SOLO asignados por `project_access_grants`
   (V5.6.4/V5.6.5A, activo en producción; sin grants ⇒ 0).
3. Lectura: presupuesto publicado/aprobado, capítulos, detalle por ítems
   client-safe (descripción, unidad, cantidad, valor unitario,
   subtotal), gráficos (V5.8A).
4. Escritura: NINGUNA (denegada en DB por V5.6.5A y sin superficies de
   edición: V5.6.6B también lo excluye de `budget-surface`).
5. Exports: PDF cliente actual; FUTURO V5.8B "PDF presentación". Nunca
   técnico/interno (anti-escalada de perfil).
6. Datos ocultos: APU, AIU/costos indirectos, descuentos internos,
   precios de proveedor, importaciones, notas internas, actividad
   interna, proyectos no asignados (anti-fuga de existencia).
7. Acciones auditables: accesos/descargas (opcional, V5.8A).
8. Pendientes: V5.8A portal; V5.8B PDF presentación; validación manual
   autenticada 0/1/N grants (checklist en OPEN_QUESTIONS).

---

## Resumen del gate nuevo (V5.6.6B, app-layer)

`server/access/budget-surface.ts` — fuente única para la superficie de
escritura del presupuesto. `BUDGET_EDITOR_ROLES = admin, gerencia,
presupuestos`; deny-by-default para cualquier otro valor (compras, obra,
consulta, desconocido, ausente):

- `canEditBudgetSurface` — editar capítulos/ítems/BOQ/AIU y gestionar
  versiones desde la UI.
- `canArchiveBudgetItems` — archivar capítulos/ítems.
- `canImportBudgetData` — importar presupuesto (Excel).
- `canViewIndirectCosts` — VER la sección AIU/costos indirectos.

Las páginas combinan SIEMPRE `isCreationModeEnabled() && can*(...)` (el
gate de entorno se conserva) y las server actions repiten el check tras
`resolveAuthenticatedViewer()` (backstop: la UI oculta, el server niega).
`AuthenticatedViewer`/`ViewerContext` acarrean `profileRole` (opcional,
aditivo) porque `ViewerRole` no distingue compras/presupuestos (ambos
`internal`) — `role-map.ts` queda intacto.

## Decisiones registradas en esta fase

1. `obra` scoped por proyecto → V5.6.6C.
2. `compras` scoped por proyecto según asignación admin → V5.6.6C.
3. `presupuestos` allow-all por ahora.
4. V5.6.6B NO implementa grants internos (solo los documenta).
5. V5.6.6B SÍ retira de la superficie de compras la edición de
   presupuesto/capítulos/precios/AIU (implementado).
