# Estimate Issue & Clone Contract — v1 (Oleada 4E.3A)

Estado: **congelado v1** · Aprobado por la usuaria 2026-06-09.
Microfase: emisión (draft→issued) + clonación (issued→nueva draft) + selector de
versiones. Propiedad: `agent-orchestrator`.

## Objetivo
Permitir **emitir** una versión de presupuesto (volviéndola inmutable) y **clonar**
una versión emitida a una nueva versión draft editable, conservando el histórico.

## Reglas funcionales (no negociables)
1. Una versión `draft` es editable; `review` también (estados no bloqueados).
2. Una versión `issued`/`approved`/`archived` es **inmutable** (locked).
3. **Emitir** (`draft → issued`): registra `issued_at` + `issued_by`
   (server-side; el navegador NUNCA envía `issued_by`).
4. Sobre una versión emitida está prohibido: editar/crear/mover capítulos e
   ítems, modificar AIU, archive y restore (RLS `estimate_version_locked` + guards).
5. Desde una versión `issued` se puede **clonar** a una nueva versión `draft`.
6. La nueva versión:
   - incrementa `version_number` de forma segura (anti-colisión),
   - queda como **versión activa** editable (mayor `version_number`),
   - conserva `source_version_id` → versión origen,
   - clona capítulos e ítems: code, description, unit, quantity, unit_price,
     subtotal, sort_order, `source_code`/`source_row`,
   - **conserva el estado archivado** de capítulos e ítems (`archived_at`,
     `archived_by`),
   - clona las reglas AIU (`indirect_cost_rules`),
   - mantiene el **mismo total activo inicial** que la issued origen.
7. La versión `issued` origen permanece intacta (histórico consultable/exportable).
8. `organizationId` y `userId` se derivan server-side (no del navegador).
9. RLS + filtros explícitos por organización preservados; cross-org bloqueado.
10. Operaciones **transaccionales** (clonación atómica vía RPC `SECURITY INVOKER`).

## Superficie de backend
- `issueEstimateVersion(viewer, estimateId)` → emite la versión activa draft.
- `cloneIssuedEstimateVersion(viewer, estimateId)` → clona la versión activa
  issued a una nueva draft; devuelve la nueva versión activa.
- `listEstimateVersions(viewer, estimateId)` → versiones tenant-scoped
  (número, estado, timestamps, emisor).
- `getEstimateVersionDetail` / lecturas existentes por versión.

## UI mínima
- Badge de estado (Borrador / Emitida) por versión.
- Listado/selector básico de versiones (V01, V02, estado).
- Acción "Emitir versión" (con confirmación; emitir = inmutable).
- Acción "Crear nueva versión" sobre issued → navega a la nueva draft.
- En issued: controles editables ocultos/deshabilitados.

## Fuera de alcance (4E.3B+)
Comparación visual detallada / diff por ítem, aprobaciones multinivel, firma
digital, comentarios, envío por correo, reorder, audit trail completo.

## Migración / rollback local
Migración **aditiva** mínima si el esquema no tiene los campos:
`estimate_versions` += `issued_at timestamptz`, `issued_by uuid` (FK profiles),
`source_version_id uuid` (FK estimate_versions, self). RPC de clonación atómica.
Sin DROP/DELETE, sin pérdida de datos, sin `db push` remoto. RLS: la transición
`draft→issued` ya está permitida por `estimate_versions_update` (USING evalúa el
estado OLD). Rollback local: DOWN con `DROP FUNCTION`/`ALTER ... DROP COLUMN`.
