# APU Productivity & Crew Overrides — V1 (Discovery / Producto)

> **Estado: DISCOVERY (solo diseño).** No cambia runtime, DB, cálculo ni datos.
> Rama: `feat/apu-productivity-crew-overrides-v1-discovery` (base `origin/main` = `a8b6245`).
> Antecesor funcional: `APU_SMART_DEFAULTS_V1B` (override de desperdicio, ya en
> producción). Esta oleada audita y diseña; **no implementa edición de rendimiento**.

---

## 1. Objetivo de producto

Replicar la experiencia del **ajuste de desperdicio por componente** (recomendado
vs aplicado, delta, justificación, "Volver al recomendado") pero para
**rendimiento / productividad / cuadrilla** de la mano de obra del APU.

El presupuestador experto debe poder, en el futuro (no en esta fase), ajustar el
rendimiento laboral de un APU **en borrador** sin romper APUs existentes, sin
recalcular históricos y sin tocar la cantidad efectiva actual.

---

## 2. Hallazgo central (por qué NO es equivalente al desperdicio)

El desperdicio (`waste_pct`) **ya existe como campo propio** en `apu_components`:
era trivial añadirle `recommended_waste_pct` + trazabilidad y editarlo sin tocar
nada más, porque la fórmula canónica ya lo usa como factor independiente:

```
total_component_cost = quantity × (1 + waste_pct) × unit_price_snapshot
```

El **rendimiento NO existe como campo propio**. Para mano de obra, los dos
factores de rendimiento se **colapsan dentro de `quantity`** en el momento de
construir el componente y **se pierden**:

```
buildCrewLaborComponent():
  quantity            = performanceDays × memberCount      // ← días/unidad × integrantes
  unit_price_snapshot = costo_diario_integral del rol      // congelado
  waste_pct           = 0
```

`apu_components` persiste solo `quantity` (persona·días/unidad). **No** guarda
`performance_days` ni `member_count`. Por tanto, dado un componente labor ya
guardado, **no se puede recuperar** cuántos días-rendimiento ni cuántos
integrantes lo originaron.

**Evidencia dura:** la función "Duplicar para corregir" (`CopyFromApuData`)
documenta que, al precargar, usa la `quantity` almacenada como `performanceDays`
con `memberCount = '1'` — porque los valores originales ya no existen.

> Conclusión: el desperdicio fue un *override de un campo existente*; el
> rendimiento exige primero **separar un concepto que hoy está fusionado**, con
> migración aditiva y estrategia de transición. Es una oleada de mayor riesgo.

---

## 3. Glosario de conceptos (deslindar lo fusionado)

| Concepto | ¿Existe hoy? | Dónde vive |
|---|---|---|
| `quantity` (efectiva) | **Sí** | `apu_components.quantity` (persistido) |
| Coeficiente de consumo (material) | Sí | = `quantity` de filas material |
| Rendimiento (labor, días/unidad) | **No (fusionado)** | Entra como `performanceDays` (input builder), se pierde al colapsar |
| Productividad (unidad/jornada) | No | Derivable como inverso del rendimiento; no persistido |
| Días de cuadrilla (`performanceDays`) | Input efímero | `ManualLaborInput.performanceDays`, no persiste |
| Tamaño de cuadrilla (`memberCount`) | Input efímero | `ManualLaborInput.memberCount`, no persiste |
| Cantidad oficiales/ayudantes | Parcial | Import expande `crew[]` a 1 fila labor por rol; se pierde la composición |
| Unidad de pago (día/hora) | Implícito | `unit_price_source = labor_role`, snapshot = costo **diario** |
| Salario/jornal + prestaciones | **Sí** | `labor_roles` (base_salary, benefits_pct, etc.) |
| Costo unitario M.O. | Calculado | `calculateLaborCost()` → diario/horario |
| Costo total M.O. | Persistido | `apu_components.total_component_cost` |
| Rendimiento recomendado | No | — (a diseñar) |
| Rendimiento aplicado | No (fusionado en quantity) | — |
| Rendimiento editado por experto | No | — |
| Justificación técnica | Solo para waste | `waste_pct_note` (patrón a replicar) |
| Origen (excel/manual/recomendado) | Parcial | `apu_templates.origin_type`, `unit_price_source`; no para rendimiento |
| Duración asociada al APU | No en APU | Se deriva en **planning** (`schedule_tasks`), no en `apu_components` |
| Cuadrilla del cronograma | Sí, desconectada | `schedule_tasks.crew_size` (no vinculada al APU) |

---

## 4. UX propuesta (futura — no se implementa aquí)

### Modo básico (por defecto)
- Mostrar **"Rendimiento recomendado"** si se puede inferir/heredar; si no,
  mostrar **"Heredado / No disponible"** sin alarmar.
- Explicar en una línea qué significa, sin obligar a llenar campos técnicos.
- Permitir dejar el recomendado y seguir.

### Modo experto
- Permitir ajustar rendimiento/productividad y, si aplica, tamaño de cuadrilla.
- Mostrar **impacto estimado** sobre el costo de M.O. del APU (preview, no commit).
- Pedir **justificación técnica** (opcional pero registrada).
- **Advertir si está fuera de rango** sugerido.
- **"Volver al recomendado"** (mismo patrón que desperdicio).
- Solo habilitado en **borradores** y para rol `management` / `internal`, en
  db-mode (igual gating que V1B).

### Microcopy (español)
- "Este rendimiento indica cuánto produce la cuadrilla por jornada."
- "Modificarlo afecta el costo de mano de obra del APU."
- "Úsalo solo si tienes criterio técnico o datos reales de obra."
- "Este valor está por fuera del rango sugerido."
- "Rendimiento heredado: no hay un valor separado guardado para este componente."

---

## 5. Estrategia de transición (no romper `quantity`)

1. **`quantity` sigue siendo la verdad efectiva** del cálculo. La fórmula
   canónica no cambia.
2. Los nuevos campos de rendimiento son **aditivos y NULLABLE**; NULL ⇒ se
   hereda de `quantity` (delta = 0).
3. Para APUs existentes, `recommended` y `applied` se inicializan de forma que
   **delta = 0** (no se altera ningún costo histórico).
4. Si no se puede inferir rendimiento, mostrar **"Heredado / No disponible"**.
5. **No** recalcular APUs `issued` / `approved` / `archived` ni históricos.
6. Edición futura **solo en borradores**.
7. Cualquier recálculo de `quantity` a partir de rendimiento editado ocurre
   **solo** al guardar un override explícito en borrador (V1C), nunca en lote.

---

## 6. Fases recomendadas

| Fase | Alcance | DB | Criterio de aceptación |
|---|---|---|---|
| **V1 Discovery** (esta) | Auditoría + diseño + docs | No | Docs aprobados; cero cambios runtime |
| **V1A Read-only** | Mostrar rendimiento derivado/heredado (sin editar) | No | APU detalle muestra "Rendimiento (heredado)" para labor; sin regresión |
| **V1B Modelo DB** | Migración aditiva (columnas/tabla), sin activar edición | Sí (aditiva) | Migración aplicada; APUs existentes con delta=0; suite verde |
| **V1C Edición borrador** | RPC + server action + UI gated | No (usa V1B) | Editar rendimiento en borrador; "Volver al recomendado"; no toca emitidos |
| **V1D Export** | Mostrar rendimiento recomendado/aplicado en anexo técnico | No | Anexo APU muestra rendimiento sin exponer datos internos a cliente |
| **V1E Cronograma** | Conectar cuadrilla/rendimiento del APU con duración | Quizá | Planning consume rendimiento del APU en vez de `crew_size` manual |

---

## 7. Riesgos (sin ocultar)

- **Pérdida de información histórica**: no se puede reconstruir días×integrantes
  de componentes ya colapsados ⇒ V1A solo puede mostrar "heredado".
- **Doble fuente de cuadrilla**: `schedule_tasks.crew_size` (planning) vs una
  futura cuadrilla en el APU ⇒ riesgo de divergencia si no se define la fuente
  única.
- **Riesgo financiero**: si `quantity` se recalcula desde rendimiento editado,
  cambia el costo. Debe estar férreamente limitado a borradores.
- **Inmutabilidad**: cualquier toque a versiones emitidas viola las reglas
  globales; el gating debe ser estricto.
- **Import**: el parser reconoce `crew[]` por rol pero lo colapsa; si V1B quiere
  preservar composición, hay que cambiar el import (mayor alcance).

Ver detalle técnico en `docs/engineering/apu-productivity-crew-overrides-v1.md`.
