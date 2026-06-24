# APU Productivity & Crew Overrides — V1 (Discovery / Ingeniería)

> **Estado: DISCOVERY (solo diseño).** No cambia runtime, DB ni cálculo.
> Rama: `feat/apu-productivity-crew-overrides-v1-discovery` (base `a8b6245`).
> Complementa `docs/product/apu-productivity-crew-overrides-v1.md`.

---

## 1. Auditoría del estado actual (FASE 1)

### 1.1 Dominio puro de M.O. — `apps/web/modules/apu/`

- **`labor.ts` → `calculateLaborCost(role)`**: PURA. De `labor_roles` calcula
  `monthlyIntegralCost / dailyIntegralCost / hourlyIntegralCost`. No conoce
  rendimiento ni cuadrilla; solo nómina integral.
- **`apu.ts` → `buildCrewLaborComponent({ laborRoleId, role, performanceDays, memberCount })`**:
  encoding congelado del componente labor:
  ```
  quantity            = performanceDays × memberCount
  unit_price_snapshot = calculateLaborCost(role).dailyIntegralCost
  waste_pct           = 0
  total_component_cost= quantity × 1 × unit_price_snapshot
  ```
  **Aquí se produce el colapso.** `performanceDays` y `memberCount` son
  parámetros de entrada que **no se devuelven ni se persisten** por separado.
- `calculateLaborComponentCost(hours, hourlyCost, crewSize)`: variante
  horas×costo×cuadrilla (misma idea, colapsa en el resultado).
- `calculateCrewLaborCost(members[])`: Σ(count × unitCost) — subtotal de cuadrilla
  multi-rol, también devuelve solo el total.

### 1.2 Persistencia — `apps/web/lib/db/schema.ts`

`apu_components` (líneas ~410-475) columnas relevantes:
`quantity`, `waste_pct` (+ V1B: `recommended_waste_pct`, `waste_pct_source`,
`waste_pct_note`, `waste_pct_updated_at/by`), `labor_role_id` (nullable,
trazabilidad), `unit_price_source` ∈ `resource|labor_role|manual|supplier_product`,
`unit_price_snapshot`, `total_component_cost`.

> **NO existen** `performance_days`, `member_count`, `crew_size`, `productivity_*`.

`labor_roles` (líneas ~322-353): nómina integral (base_salary, transport_subsidy,
benefits_pct, social_security_pct, payroll_tax_pct, uniform_cost,
uniform_period_months, working_days_month, working_hours_day). Sin rendimiento.

`schedule_tasks` (línea ~899): `crew_size numeric(12,4)` **nullable** — vive en el
cronograma, **no** referencia `apu_components`. Es la cuadrilla del schedule.

### 1.3 Entradas (input) — builder e import

- **Manual** (`lib/apu-builder/types.ts`): `ManualLaborInput` SÍ captura
  `performanceDays` y `memberCount` como input; se pasan a `buildCrewLaborComponent`
  y se colapsan. `CopyFromApuData` (líneas 124-132) **documenta la pérdida**:
  prefill usa `quantity` como `performanceDays` con `memberCount='1'`.
- **Import** (`server/apu-import/preview.ts`): el parser reconoce
  `component.crew[]` con `member.role` (línea ~155) y expande **una fila labor por
  rol**; cada fila colapsa días×integrantes en `quantity`. La composición de
  cuadrilla original no se conserva en `apu_components`.

### 1.4 Read-model — `lib/contracts/read-model.ts`

`ApuComponentView` expone `quantity` (comentado como "Rendimiento/consumo por
unidad"), `laborRoleCode/Name` (🔒 no a `client`), `waste_pct` (+ recomendado
V1B). **No** expone `performanceDays`/`memberCount`/productividad.

### 1.5 Planning — `apps/web/modules/planning/generator.ts`

Modelo MÁS rico que el APU, pero alimentado por el **mismo dato colapsado**:
- `quantity_labor = rendimiento_días × integrantes` (persona·días/unidad).
- `productivitySource ∈ {apu, manual, unknown}`; `crewSize` (de `schedule_tasks`).
- duración ≈ `ceil(cantidad × persona·días/unidad / crew)`.
- Warnings `no_apu` / `no_rendimiento`. Blindado contra valores extremos.

> Implicación: la "cuadrilla" para duración la pone el **schedule**, no el APU.
> Hay **doble fuente** potencial de crew si V1 introduce cuadrilla en el APU.

### 1.6 Export — `server/estimates/export/apu-annex/{apu-pdf,apu-xlsx}.ts`

Anexo APU lista componentes con `laborRoleName/Code`, `quantity`,
`unit_price_snapshot`, `total`. Muestra la `quantity` colapsada; **no** hay
columnas de rendimiento/cuadrilla. Perfiles de privacidad ya omiten M.O. interna
a `client`.

### 1.7 Cobertura de pruebas

`tests/unit/cost-domain/{labor,apu,apu-foundation}.test.ts`,
`tests/unit/apu-builder/builder.test.ts`,
`tests/unit/planning/generator.test.ts` (+ schedule). Cubren cálculo de M.O.,
`buildCrewLaborComponent` (encoding colapsado) y derivación de duración/productividad.

---

## 2. Clasificación por concepto (FASE 2)

Para cada concepto: existe / dónde / calculado o persistido / debería editable /
afecta quantity / afecta costo unitario / afecta cronograma / afecta export /
requiere migración / riesgo legacy.

| Concepto | Existe | Persist? | Editable | →quantity | →costo | →crono | →export | Migración | Riesgo legacy |
|---|---|---|---|---|---|---|---|---|---|
| quantity efectiva | sí | sí | ya (BOQ) | — | sí | sí | sí | no | — |
| coef. consumo material | sí | sí | sí | = qty | sí | no | sí | no | bajo |
| rendimiento labor (días/u) | **no** | no | **objetivo** | sí (al recalcular) | sí | sí | sí | **sí** | **alto** |
| productividad (u/jornada) | no | no | derivable | sí | sí | sí | sí | sí | alto |
| performanceDays | input | no | objetivo | sí | sí | sí | quizá | sí | alto |
| memberCount/crew APU | input | no | objetivo | sí | sí | sí | quizá | sí | alto |
| oficiales/ayudantes | parcial | no (colapsado) | objetivo | sí | sí | sí | quizá | sí | alto |
| unidad de pago | implícito | parcial | no (config) | no | sí | no | no | quizá | medio |
| salario/jornal + prest. | sí | sí (`labor_roles`) | sí (config) | no | sí | no | 🔒 | no | bajo |
| costo unitario M.O. | sí | snapshot | no (derivado) | no | sí | no | sí | no | bajo |
| costo total M.O. | sí | sí | no (derivado) | no | sí | no | sí | no | bajo |
| rendimiento recomendado | no | no | n/a | no | no | no | quizá | sí | medio |
| rendimiento aplicado | no (fusionado) | en quantity | objetivo | sí | sí | sí | quizá | sí | alto |
| rendimiento editado experto | no | no | objetivo | sí | sí | sí | quizá | sí | alto |
| justificación técnica | solo waste | sí (waste_note) | sí | no | no | no | 🔒 | sí | bajo |
| origen (excel/manual/recom) | parcial | parcial | no | no | no | no | no | quizá | bajo |

---

## 3. Decisión de modelo (FASE 3)

### Opción A — Columnas en `apu_components`
`recommended_productivity`, `applied_productivity`, `productivity_unit`,
`crew_size`, `productivity_source`, `productivity_note`,
`productivity_updated_at/by` (todas NULLABLE).

- **Riesgo:** medio. **Legacy:** alto compat (aditivo, NULL=heredado). **Claridad
  financiera:** alta (junto al componente). **MVP:** fácil (mismo patrón V1B).
  **Engine:** bajo si `quantity` sigue siendo la verdad y los campos son
  metadata hasta V1C. **Export/Crono:** lectura directa. **RLS/RPC:** reusa
  patrón waste. **Revertir:** fácil (columnas inertes). **Trazabilidad:** alta.

### Opción B — Tabla `apu_labor_productivity_overrides`
Una fila por `apu_component_id` con recommended/applied/crew/source/note/audit.

- **Riesgo:** medio-alto (join nuevo). **Legacy:** muy alto (no toca tabla
  caliente). **Claridad:** media (datos separados). **MVP:** más trabajo
  (repo/RLS nuevos). **Engine:** bajo. **Export/Crono:** requiere join.
  **Revertir:** muy fácil (drop tabla). **Trazabilidad:** alta. Mejor si se
  prevé historial multi-versión del override.

### Opción C — Capa read-only/metadata derivada (sin DB)
Inferir/mostrar rendimiento derivado desde `quantity` + `crew_size` del schedule
cuando sea posible; sin persistir nada.

- **Riesgo:** muy bajo. **Legacy:** total. **Claridad:** baja (es inferencia, no
  verdad). **MVP:** muy fácil. **Engine:** nulo. **Export:** opcional. **Revertir:**
  trivial. **Trazabilidad:** nula. **Limitación:** no permite edición; solo
  "heredado/derivado".

### Recomendación
**C para V1A** (read-only inmediato, riesgo cero) **→ A para V1B/V1C** (override
editable con el patrón ya probado en `waste_pct`). A da claridad financiera y
reusa RPC/RLS/UX de V1B con mínimo costo. Reservar B solo si producto pide
**historial** de overrides de rendimiento (multi-entrada por componente).

---

## 4. Estrategia de transición segura (FASE 4)

- `quantity` permanece como verdad efectiva; la fórmula canónica no cambia.
- Columnas nuevas NULLABLE; `applied_productivity` NULL ⇒ se deriva de `quantity`
  (delta = 0). Ningún costo histórico cambia.
- Inicialización para legacy: `recommended = applied = NULL` ⇒ UI muestra
  "Heredado / No disponible".
- **Sin** recálculo de `quantity` salvo override explícito en **borrador** (V1C).
- Prohibido tocar `issued/approved/archived`; gating estricto (db-mode +
  rol interno/management), igual que V1B.
- Definir **fuente única de cuadrilla** antes de V1E (APU vs `schedule_tasks`)
  para no duplicar verdad.

---

## 5. Archivos probables por fase (referencia, no se tocan aquí)

- **V1A**: `lib/contracts/read-model.ts`, `server/read-model/compute.ts`,
  `app/(dashboard)/apu/[id]/page.tsx`, `app/(dashboard)/apu/_lib/*` + tests.
- **V1B**: `supabase/migrations/<ts>_apu_productivity_overrides.sql`,
  `lib/db/schema.ts` + tests (sin activar edición).
- **V1C**: `server/apu-overrides/*` (o nuevo `apu-productivity/*`),
  `app/(dashboard)/apu/[id]/actions.ts`, `_components/*`, RPC SECURITY DEFINER.
- **V1D**: `server/estimates/export/apu-annex/*`.
- **V1E**: `modules/planning/generator.ts`, `server/planning/repository.ts`.

---

## 6. Validación de esta oleada (FASE 8)

Solo documentos nuevos (sin runtime). `git diff --check` limpio. No se ejecutan
tests porque ningún helper runtime fue modificado.
