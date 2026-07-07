# Steel Ops — Preparación para revisión de ingeniero estructural/operativo (F8G)

> **Fecha:** 2026-07-07 · **Fase:** F8G (post F8F, PR #70 en `main`)
> **Audiencia:** ingeniero estructural u operativo que auditará el módulo de
> cuantificación de acero antes de su uso ampliado.
> **Estado del módulo:** preview interno con datos locales; sin conexión a
> base de datos ni afectación de presupuestos reales.

---

## 1. Dónde revisar

| Qué | Ruta |
|-----|------|
| Punto de entrada del módulo | `/steel` (dashboard de Acero) |
| Takeoffs (flujo principal a revisar) | `/steel/takeoffs` |
| Detalle de un takeoff / workspace manual | `/steel/takeoffs/[id]` |
| Revisión, catálogo, optimización, pedidos | `/steel/review`, `/steel/catalog`, `/steel/optimization`, `/steel/orders` |

**Requisitos de acceso:** la variable de entorno `STEEL_OPS_UIX_PREVIEW=true`
debe estar activa y la sesión debe tener rol `admin`, `gerencia` o
`presupuestos`. Sin ambas condiciones, las rutas `/steel/*` responden como si
no existieran (404). El módulo **no** aparece en la navegación global — se
entra por URL directa.

**Naturaleza de los datos:** los takeoffs manuales viven en `localStorage`
del navegador (no hay persistencia en servidor). Los takeoffs "de ejemplo"
son datos mock. Nada de lo que se haga en esta revisión toca producción,
Supabase ni presupuestos reales.

---

## 2. Qué debe revisar el ingeniero

El objetivo de la revisión es validar que **la interpretación del plano y las
reglas operativas de cantidad son correctas para el flujo real de obra**, no
la calidad del código. En concreto:

1. **Regla de cantidad por aparición textual** (F8F): cada texto longitudinal
   superior/inferior válido leído del DXF entra como UNA línea computable con
   cantidad 1. ¿Es la regla operativa correcta para sus planos? ¿Hay planos
   donde un solo texto representa N barras y la cantidad 1 sería incorrecta
   sin edición?
2. **Interpretación de notación**: `6#6350` = varilla #6, longitud de corte
   3.50 m (el primer dígito **nunca** se lee como cantidad). Variantes
   aceptadas: `6#6 35 L`, `6 # 6 330`, `6#6 L=330`. ¿Cubre la notación de sus
   estructuradores?
3. **Contrato de estribos** (zonas vs resumen `2xN E#d@s`): la suma por zonas
   se compara contra el resumen declarado; el desfase bloquea SOLO el estribo
   hasta decisión humana. ¿Los umbrales y mensajes son razonables?
4. **Bandas superior/inferior**: la separación se infiere de marcadores
   gráficos o del mayor salto en Y entre textos. Lo indecidible queda "sin
   clasificar" y requiere decisión. ¿El criterio corresponde a cómo se
   dibujan sus detalles?
5. **Cálculo F1** (botón "Ver cálculo" y sección 5 del panel): fórmulas de
   ML, KG, varillas comerciales y desperdicio. ¿Los factores y redondeos son
   los usados en obra?
6. **Excel exportado** (formato VC-VERF): columnas, fórmulas vivas
   (`N=I*J*K`), hoja EVIDENCIAS con "modo cantidad". ¿Sirve como entregable
   de cuantificación?

---

## 3. Flujo en 6 pasos (explicación simple)

1. **Cargar**: en `/steel/takeoffs`, crear un takeoff manual y cargar un
   archivo DXF del plano de refuerzo (también hay intake por PDF nativo/OCR
   como evidencia visual y fallback).
2. **Segmentar**: el sistema detecta las vistas/detalles de viga
   independientes del plano y arma un "Listado de vigas detectadas" con
   eje/sección, refuerzo superior/inferior, estribos y confianza.
3. **Revisar** ("Ver detalle"): panel lateral por viga con 6 secciones —
   resumen, refuerzo superior, inferior, estribos (zonas vs resumen),
   cálculo F1 y evidencia CAD (capa, color, coordenadas, handles,
   fragmentos originales).
4. **Decidir**: por cada barra se puede editar cantidad, editar longitud,
   aceptar la línea, marcar para revisión; las barras sin banda clara se
   asignan a superior/inferior o se aceptan sin clasificar. Los estribos con
   desfase piden elegir "usar resumen del plano" o "usar cálculo por zonas".
5. **Enviar**: un único botón "Enviar al takeoff" con preview honesto
   ("Se enviarán N línea(s): X superior, Y inferior, Z estribo.") y lista de
   lo que queda fuera con motivo. **Nada se aprueba solo.**
6. **Exportar**: Excel con hojas de cantidades (fórmulas vivas), evidencias,
   alertas, plan de corte y configuración.

---

## 4. quantityMode y quantitySource (trazabilidad de cantidad)

Cada línea longitudinal lleva dos campos de trazabilidad que aparecen en el
panel ("Fuente cantidad"), en la observación de evidencia y en la columna
"modo cantidad" del Excel:

| `quantityMode` | Etiqueta visible | Significado |
|----------------|-----------------|-------------|
| `textual_occurrence` | cantidad por aparición textual DXF | Regla F8F por defecto: 1 línea por texto longitudinal válido, cantidad = 1, editable. |
| `manual` | cantidad editada por la usuaria | La cantidad fue editada en el panel; se registra "editada por la usuaria". |
| `graphic_marker` | conteo gráfico de marcadores | Cantidad tomada de marcadores gráficos (círculos de sección). Hoy los marcadores son **evidencia de apoyo**, no fuente por defecto. |
| `unresolved` | cantidad sin resolver | Lectura no computable (longitud/diámetro ilegible); no entra al takeoff. |

`quantitySource` es el texto legible de la fuente ("aparición textual DXF" /
"editada por la usuaria"). Los marcadores gráficos se muestran como
"apoyo visual: N marcador(es), confianza X" o "no confiables / no
disponibles" — **jamás bloquean** una longitudinal computable.

Cada barra tiene además un `readingId` estable (interno) que ancla las
decisiones de la usuaria a la barra correcta entre renders.

---

## 5. Qué está automatizado (protegido por tests)

Suite de acero: `apps/web/tests/unit/steel/` (48 archivos). Guardas focales
del contrato F8F/F8G:

- `dxf/f8f-longitudinal-occurrence.test.ts` (20 tests):
  - `6#6 35 L` ⇒ `6#6350`: cantidad 1, varilla #6, 3.50 m, modo
    `textual_occurrence`.
  - El primer dígito del texto **jamás** es cantidad; sin override F1 leería
    "6 unidades" — el dispatch siempre manda `manualQuantity: '1'`.
  - Overrides `manualQuantity`/`manualCutLengthM`/`manualBarNumber` aplicados
    solo como inputs de F1.
  - Sin marcadores gráficos la longitudinal sigue computable (advertencia
    informativa, no bloqueante).
  - 4 superior + 4 inferior + 1 estribo ⇒ "Se enviarán 9 línea(s)".
  - 2 superior + 2 sin clasificar asignadas + estribo ⇒ 5 líneas.
  - Mismatch de estribo sin decisión ⇒ bloquea SOLO el estribo; ambiguous
    jamás entra, ni con elección.
  - Excel: CANT=1 (no 6), descripción del plano, fórmulas `I*J*K` intactas,
    EVIDENCIAS con "modo cantidad".
  - Estáticos de UI: acciones del panel y copy de la regla textual.
- `dxf/f8g-review-readiness.test.ts` (9 tests, nuevos en esta fase):
  - `readingId` único dentro del detalle y estable entre parses.
  - `manualBarNumber` standalone cuando F1 no infiere varilla del texto.
  - Trío de overrides ⇒ aritmética F1 exacta (4 × 3.50 = 14 ml).
  - Toda línea del dispatch lleva `quantityMode` + `quantitySource`.
  - Mismatch de estribo + decisión explícita (resumen/zonas) ⇒ el estribo SÍ
    entra; "marcar para revisión" ⇒ queda fuera con motivo.
- Además: F8E secuencia longitudinal completa, F8D segmentación de vistas y
  contrato de estribos, F8B/F8C notación y ensamble, F1 calculadora,
  optimizador de corte FFD, exportación Excel, gate de acceso preview.

---

## 6. Qué requiere revisión manual (no automatizado)

- **Fidelidad con planos reales**: los tests usan fixtures sintéticos por
  código (jamás DXF reales en el repo). La validación con los planos de la
  empresa (p. ej. "2504-010A R1 Refuerzo Vigas de Cimentación") es manual.
- **Criterio de banda superior/inferior** en geometrías atípicas (vigas
  verticales, detalles rotados, plantas mezcladas con despieces).
- **Calibración de confianza** (porcentajes mostrados) frente al juicio del
  ingeniero.
- **Usabilidad del panel** con vigas de muchos tramos (20+ textos).
- **Excel** abierto en el Excel real de la empresa: formatos regionales,
  fórmulas recalculando, impresión.
- **OCR de PDF escaneado**: la pérdida del símbolo `#` está mitigada
  (prioridad al texto nativo) pero la calidad depende del escaneo.

---

## 7. Límites actuales del módulo

1. **Sin persistencia en servidor**: los takeoffs manuales viven en
   `localStorage` del navegador — se pierden al limpiar datos del navegador
   y no se comparten entre usuarios/equipos. El esquema de base de datos
   (12 tablas `steel_*`) está diseñado (F2) pero no aplicado.
2. **Preview gateado**: módulo fuera de la navegación global, visible solo
   con flag + rol; no integrado a la matriz real de accesos.
3. **Sin integración a precios/BOQ reales**: los precios son referencias
   mock; la conexión con el pipeline de precios y APU/BOQ es fase futura.
4. **Alcance de lectura DXF**: optimizado para despieces de vigas
   (longitudinales + estribos). Columnas, zapatas, muros y losas no tienen
   ensamble dedicado todavía.
5. **Cantidad por defecto = 1 por texto**: correcta por regla operativa
   declarada; si un plano usa 1 texto = N barras, la usuaria debe editar la
   cantidad (queda trazado como `manual`).
6. **Un DXF a la vez** por takeoff; no hay consolidación multi-plano
   automática.
7. **PDF como evidencia/fallback**: el motor principal de lectura es DXF;
   el camino PDF (nativo/OCR) existe y se compara, pero es secundario.

---

## 8. Preguntas sugeridas para el ingeniero

1. ¿La regla "1 línea con cantidad 1 por aparición textual" coincide con
   cómo sus estructuradores anotan los despieces? ¿Excepciones conocidas?
2. En sus planos, ¿el resumen de estribos `2xN E#d@s` siempre existe? ¿Qué
   hacer cuando solo hay zonas sin resumen (hoy: `unverified`, requiere
   elección explícita)?
3. Cuando zonas y resumen difieren por 1 (p. ej. 141 vs 140), ¿cuál es la
   fuente de verdad por defecto en su práctica: el resumen del plano o la
   suma por zonas?
4. ¿Las longitudes en cm con normalización ×10 (`6#635` ⇒ 3.50 m con
   contexto) generan riesgo de ambigüedad en sus planos? ¿Prefieren bloqueo
   más agresivo?
5. ¿Qué tolerancia de desperdicio usan por proyecto (hoy: 5% asumido por
   defecto, editable 0–30%, o calculado por optimización de corte)?
6. ¿Las longitudes comerciales configurables (default 6/9/12 m) cubren sus
   proveedores?
7. ¿Qué campos del Excel VC-VERF faltan o sobran para el flujo real de
   compras/obra?
8. ¿Necesitan diferenciar acero de refuerzo por resistencia (fy) o
   recubrimiento en el takeoff, o eso queda en el APU?
9. ¿Quién debe poder editar cantidades/longitudes en el flujo real (roles)?
10. ¿Qué evidencia mínima exige una auditoría interna de cuantificación
    (hoy: archivo, capa, color, coordenadas, handles, fragmento original)?

---

## 9. Checklist de revisión estructural/operativa

Preparación: activar `STEEL_OPS_UIX_PREVIEW=true` en entorno local, iniciar
sesión con rol admin/gerencia/presupuestos, tener un DXF de despiece real.

**Acceso y flujo base**
- [ ] `/steel/takeoffs` carga y muestra la sección de takeoffs manuales.
- [ ] Crear takeoff manual y abrir su workspace (`/steel/takeoffs/[id]`).
- [ ] Cargar un DXF: aparece el listado de vigas detectadas con conteos.

**Lectura del plano (por cada viga representativa)**
- [ ] "Ver detalle": eje/ubicación/sección coinciden con el plano.
- [ ] Refuerzo superior: todos los textos del plano están, en orden.
- [ ] Refuerzo inferior: ídem (verificar que no se saltó tramos intermedios).
- [ ] Cada texto ⇒ descripción normalizada correcta (`6#6 35 L` ⇒ `6#6350`).
- [ ] Cantidad mostrada = "1 por aparición textual DXF" y NUNCA el primer
      dígito del texto.
- [ ] Marcadores gráficos aparecen como apoyo (no bloquean nada).
- [ ] Barras sin clasificar: el motivo es entendible y la asignación a
      superior/inferior funciona.

**Estribos**
- [ ] Zonas listadas coinciden con el plano; subtotal correcto.
- [ ] Resumen declarado bien leído; estado match/mismatch correcto.
- [ ] En mismatch: el estribo NO entra sin decisión; las longitudinales SÍ.
- [ ] Elegir "usar resumen del plano" y verificar la línea resultante.

**Edición y envío**
- [ ] Editar cantidad de una barra ⇒ fuente cambia a "editada por la usuaria".
- [ ] Editar longitud ⇒ el cálculo F1 (sección 5) refleja el cambio.
- [ ] Marcar una barra para revisión ⇒ no se envía y el preview lo declara.
- [ ] El preview "Se enviarán N línea(s)…" cuadra con lo decidido.
- [ ] Enviar al takeoff ⇒ las líneas aparecen en la tabla con evidencia.

**Cálculo y export**
- [ ] "Ver cálculo": fórmulas ML/KG y varillas comerciales correctas para
      2–3 líneas verificadas a mano.
- [ ] Plan de corte: desperdicio calculado vs manual, longitudes comerciales.
- [ ] Exportar Excel: CANT=1 por línea textual, fórmulas recalculan al
      editar, EVIDENCIAS con "modo cantidad" coherente.

**Totales (validación de fondo)**
- [ ] Comparar el total de kg y varillas de UNA viga contra cuantificación
      manual independiente del ingeniero.

---

## 10. Riesgos conocidos

| Riesgo | Mitigación actual |
|--------|-------------------|
| Plano donde 1 texto = N barras ⇒ subcuantificación si no se edita | Cantidad editable por barra + advertencia de fuente visible; revisión humana obligatoria antes de enviar. |
| Normalización ×10 de longitudes (`635` ⇒ `6350`) errada en notaciones atípicas | Solo se aplica con contexto; sin contexto o rango absurdo ⇒ `requiresReview`. Verificar con planos reales. |
| Segmentación de vistas mezcla detalles contiguos | Estado `ambiguous` bloquea el estribo siempre; conteos de exclusión visibles; confianza declarada. |
| Datos en `localStorage` se pierden | Límite declarado (preview); exportar Excel como respaldo; persistencia DB es fase futura. |
| El usuario confía en el porcentaje de confianza sin verificar | La confianza nunca aprueba nada; el envío siempre es clic humano con preview. |
| OCR degrada `#` en PDFs escaneados | Prioridad al texto nativo; variantes corruptas descartadas con advertencia; DXF es el motor principal. |
| Duplicados visuales en el panel cuando dos barras tienen idéntica descripción | Las barras se identifican por `readingId` (único, testeado); ver mejora UX pendiente §11. |

---

## 11. Hallazgos F8G y mejoras futuras recomendadas

Clasificación de lo encontrado en esta fase (ningún bug crítico):

**Bug crítico**
- Ninguno encontrado. El contrato F8F se comporta según lo validado.

**Mejora UX menor**
- `beam-detail-review-panel.tsx` §5 "Cálculo": la lista de explicaciones usa
  `originalDescription` como key de React; dos barras con texto idéntico
  (p. ej. `6#6840` arriba y abajo — caso real permitido por F8E) generan
  keys duplicadas (warning de consola, riesgo de reconciliación). Fix
  trivial (key compuesta con índice) — no aplicado en F8G para no tocar el
  panel validado de F8F.
- Input de cantidad del panel: al borrar el valor, el campo vuelve
  visualmente a la cantidad base (controlado con fallback); comportamiento
  correcto pero puede confundir.
- "Aceptar línea" en barras ya aceptadas es un no-op silencioso; podría
  mostrar estado "aceptada" explícito.

**Mejora técnica futura**
- Propagar `readingId` a la evidencia de la línea enviada (hoy la
  trazabilidad barra→línea es por descripción+fragmento).
- Persistir las decisiones del panel (hoy se pierden al cerrar el panel sin
  enviar).
- Consolidación multi-DXF por takeoff.

**Requiere validación de ingeniero** (antes de cambiar nada)
- Regla de cantidad 1 por aparición textual (¿excepciones?).
- Fuente de verdad por defecto en mismatch de estribos.
- Umbrales de normalización ×10 y de ambigüedad de segmentación.
- Rangos de desperdicio y longitudes comerciales por defecto.

**Requiere backend/worker futuro**
- Persistencia en Postgres/Supabase (esquema F2 `steel_*` diseñado, RLS
  planificada) y colaboración multiusuario.
- Procesamiento server-side de DXF grandes (hoy todo corre en el cliente).
- Integración con pipeline de precios real y vínculo APU/BOQ.

---

*Documento generado en la fase F8G (rama `feature/f8g-review-readiness-v3`).
No modifica lógica funcional; acompaña a los tests focales
`f8g-review-readiness.test.ts`.*
