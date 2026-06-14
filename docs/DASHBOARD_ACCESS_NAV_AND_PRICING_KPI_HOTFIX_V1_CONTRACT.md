# DASHBOARD_ACCESS_NAV_AND_PRICING_KPI_HOTFIX_V1 — Contrato

**Fecha:** 2026-06-14  
**Rama:** `fix/dashboard-access-nav-pricing-kpi-v1`  
**Base:** `origin/main = 0d172ea`  
**Owner:** agent-orchestrator  
**Estado:** EN EJECUCIÓN

---

## 1. Alcance confirmado

| # | Área | Descripción |
|---|------|-------------|
| 1 | NAV | Verificar + fortalecer visibilidad de "Accesos" en sidebar para admin/gerencia |
| 2 | DASHBOARD | Eliminar copy stale "fixture activo" / "Oleada 3A" del bloque SavingsSection |
| 3 | DASHBOARD | Reemplazar copy por texto limpio conectado a estado real disponible |
| 4 | PLANNING | Actualizar empty state de /planning con framing SCHEDULE_FROM_BOQ_V1 |
| 5 | DOCS | Registrar SCHEDULE_FROM_BOQ_V1 como siguiente gran oleada |
| 6 | TESTS | 22+ tests cubriendo nav, dashboard copy, regresión |

---

## 2. Fuera de alcance explícito

- Cronograma tipo MS Project
- Vista Gantt nueva
- Creación remota de usuarios
- SMTP real
- Editor avanzado de APU
- Nuevos imports / nuevos exports
- Módulo de planning / cronograma
- Migración de base de datos (esta oleada es SIN migración)
- Deploy a producción (requiere aprobación)
- Merge a main (requiere aprobación)
- db push remoto
- Escritura de datos de producción

---

## 3. Visibilidad del menú "Accesos"

### Roles que VEN "Accesos" en sidebar

| Rol (profiles.role) | Puede ver "Accesos" |
|--------------------|---------------------|
| admin              | ✅ Sí               |
| gerencia           | ✅ Sí               |
| presupuestos       | ❌ No               |
| compras            | ❌ No               |
| obra               | ❌ No               |
| consulta           | ❌ No               |

### Invariantes de seguridad

1. **La UI no es la única barrera.** El guard server-side en `/settings/access/page.tsx` (`canManageAccess(actor.profileRole)`) es el backstop real.
2. **Las RPCs SQL son SECURITY DEFINER** y verifican el rol internamente (guard SQL).
3. **El layout usa `resolveCanManageAccess()`** que llama `resolveAccessActor()` → `getSessionClaims()` → `getClaims()`. Si falla silenciosamente, el sidebar no muestra el link pero la ruta sigue protegida.
4. **Ocultar el link UI NO expone datos** ni permite operaciones no autorizadas.

---

## 4. Dashboard — copy corregido

### Bloque "Ahorro e indicadores internos" (solo management/internal)

**Copy nuevo (estado vacío — sin datos de ahorro aprobados):**
```
Estos indicadores se calculan a partir de precios aprobados, observaciones
pendientes y cobertura del catálogo. Revisa o aprueba precios desde
Catálogo › Revisión de precios.
```

**Textos eliminados:**
- ~~"Los datos de ahorro y cobertura de precios estarán disponibles cuando se integre el módulo de pricing (Oleada 3A — modo fixture activo)."~~

**Con datos presentes:**  
Se muestran: Ahorro proyectado, Ahorro realizado, Cobertura de precios (sin cambio en la lógica — solo el fallback de estado vacío cambia).

---

## 5. Indicadores internos — fuentes de datos reales

Los KPIs del bloque "Ahorro e indicadores internos" provienen del read-model:

| KPI | Fuente | Disponible ahora |
|-----|--------|-----------------|
| Ahorro proyectado | `DashboardSummary.projectedSaving` | Solo si hay precios aprobados con diferencia vs referencia |
| Ahorro realizado | `DashboardSummary.realizedSaving` | Solo si hay precios de compra registrados |
| Cobertura de precios | `DashboardSummary.pricingCoverage` | % ítems con precio aprobado vs total |

Si los tres son `undefined` (estado normal en producción sin datos suficientes), se muestra el nuevo estado vacío limpio.

---

## 6. Reglas de no escritura

- No se aprueban precios.
- No se modifican presupuestos.
- No se crean usuarios ni invitaciones.
- No se ejecuta price monitoring.
- No se hacen db push remotos.
- No se ejecuta SMTP real.

---

## 7. Migración

**Sin migración en esta oleada.** Todos los cambios son:
- Componentes React/TSX (copy / fallback UI)
- Pruebas unitarias de regresión
- Documentación

---

## 8. Planning — empty state

El mensaje del estado vacío de `/planning` se actualiza a:

```
Todavía no hay planificación generada. Crea una planificación desde un
presupuesto para estimar duraciones, dependencias y recursos de obra.
```

La referencia a SCHEDULE_FROM_BOQ_V1 queda documentada en OPEN_QUESTIONS y HANDOFF_LOG (no en el UI del empty state directo al usuario final).

---

## 9. SCHEDULE_FROM_BOQ_V1 — documentada como siguiente oleada

No se implementa en este hotfix. Se registra el contrato conceptual para la oleada siguiente:

**Cronograma tipo MS Project conectado a presupuesto:**
- Proyectos + presupuesto (BOQ) como base
- Capítulos BOQ → fases de obra
- Ítems BOQ → actividades individuales
- Cantidades → volumetría de cada actividad
- APU → rendimientos unitarios (m²/día, ml/día, etc.)
- Cuadrillas posibles → estimación de personal
- Duración estimada automática: `cantidad ÷ (rendimiento × cuadrilla)`
- Dependencias: FS (Finish-Start) por defecto, editables
- Ruta crítica básica: CPM simplificado
- Vista Gantt (Frappe Gantt o similar)
- Edición manual de duraciones y dependencias
- Línea base (snapshot de planificación original)
- Porcentaje de avance futuro contra línea base
- Columna `external_reference` para integración con MS Project (export/import)

**Restricción de privacidad SCHEDULE_FROM_BOQ_V1:**
- Roles `site` y `management` ven porcentaje de avance
- Rol `internal` ve todo incluyendo notas técnicas
- Rol `client` solo ve hitos y resumen de avance (sin recursos, costos ni rutas)

---

## 10. Tests mínimos requeridos

| # | Test | Archivo |
|---|------|---------|
| 1 | admin ve Accesos en sidebar | `nav/sidebar-access.test.ts` |
| 2 | gerencia ve Accesos | `nav/sidebar-access.test.ts` |
| 3 | client no ve Accesos | `nav/sidebar-access.test.ts` |
| 4 | site no ve Accesos | `nav/sidebar-access.test.ts` |
| 5 | link apunta a /settings/access | `nav/sidebar-access.test.ts` |
| 6 | /settings/access sigue protegida | `access/access-routes.test.ts` (existente) |
| 7 | savings-section no contiene "fixture" | `nav/sidebar-access.test.ts` |
| 8 | savings-section no contiene "Oleada 3A" | `nav/sidebar-access.test.ts` |
| 9 | savings-section muestra copy nuevo | `nav/sidebar-access.test.ts` |
| 10 | savings-section muestra estado vacío limpio | `nav/sidebar-access.test.ts` |
| 11 | savings-section no inventa ahorro | `nav/sidebar-access.test.ts` |
| 12 | layout pasa canManageAccess a sidebar | `nav/sidebar-access.test.ts` |
| 13 | /settings/access tiene guard canManageAccess | `nav/sidebar-access.test.ts` |
| 14 | layout usa resolveCanManageAccess() | `nav/sidebar-access.test.ts` |
| 15 | sidebar-nav define ACCESS_ITEM con href correcto | `nav/sidebar-access.test.ts` |
| 16 | planning empty state dice SCHEDULE_FROM_BOQ_V1 | `nav/sidebar-access.test.ts` |
| 17 | dashboard no contiene "fixture activo" | `nav/sidebar-access.test.ts` |
| 18 | dashboard no contiene "Oleada 3A" | `nav/sidebar-access.test.ts` |
| 19 | canManageAccess: admin/gerencia=true, resto=false | permissions.test.ts (existente) |
| 20 | build limpio | CI |
| 21 | typecheck limpio | CI |
| 22 | suite completa pasa | CI |

---

## 11. Riesgos identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `getClaims()` falla transientemente en cold start | Media | Sidebar sin "Accesos" hasta siguiente request | Guard SQL es backstop real |
| Copy actualizado no aparece en UI si hay cache de Vercel | Baja | Usuario ve texto antiguo | `force-dynamic` en layout y dashboard page |
| Test de fuente de archivo falla si se mueve el archivo | Baja | Test roto | Ruta relativa anclada a `__dirname` |

---

*Generado por agent-orchestrator — DASHBOARD_ACCESS_NAV_AND_PRICING_KPI_HOTFIX_V1*
