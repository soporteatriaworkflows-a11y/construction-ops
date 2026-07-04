# STEEL OPS — F6: PDF / Plan Intake (Blueprint)

**Fecha:** 2026-07-04 · **Owner:** Fable (Product Architect)
**Rama:** `feature/steel-ops-f6-pdf-intake-blueprint`
**Estado:** BLUEPRINT / UX CONTRACT — **docs-only**. Sin código, sin DB, sin
Supabase, sin RLS, sin migraciones, sin OCR real, sin librerías nuevas, sin
navegación global, sin deploy.
**Documentos hermanos de esta fase:**
- `STEEL_OPS_F6_PDF_INTAKE_UX_CONTRACT.md` — pantallas y flujos.
- `STEEL_OPS_F6_EXTRACTION_CONFIDENCE_MODEL.md` — modelo de confianza.
- `STEEL_OPS_F6_ROADMAP.md` — sub-fases F6A–F6G.

**Nota de numeración (reconciliación con el blueprint V1):** en
`docs/design-references/STEEL_OPS_V1_BLUEPRINT.md` §20, "F6" nombraba
vinculación APU/BOQ + exports y "F7" el intake de Excel arbitrario/PDF con
texto. La numeración operativa viva divergió: **F4A = Excel export de
takeoffs manuales (PR separado)** y **F6 = PDF/Plan Intake (este
documento)**. Ante conflicto de numeración, gana la serie
`STEEL_OPS_F<n>_*` de `docs/`. El contenido de este F6 corresponde
conceptualmente al "F7/V2–V3 de importación" del blueprint V1 (§11).

---

## 0. Tesis y regla conceptual obligatoria

En obra, el acero **no siempre llega como tabla limpia**. Llega como planos
con despieces claros, cuadros parciales, notas sueltas, cotas, detalles,
cortes, símbolos, llamados (`P-01`, `VC-01`, `C-03`), escaneos borrosos o
directamente geometría sin tabla.

F6 convierte "subir un PDF/plano" en **candidatos revisables de Steel
Takeoff**. Regla madre, no negociable:

> **El sistema es un asistente de lectura y extracción, NO una verdad
> automática.** Propone candidatos con evidencia y confianza; el humano
> corrige, aprueba o descarta. Nada llega al takeoff sin aprobación
> explícita. Nada se cuantifica sin base textual o calibración verificada.

Esto es el espejo directo de dos decisiones ya vigentes en el proyecto:
la aprobación humana de coincidencias SKU (Homecenter, PROJECT_MASTER §7.5:
"Nunca aprobar automáticamente una coincidencia dudosa") y el
human-in-the-loop del blueprint Steel V1 §11 ("el sistema propone, el humano
confirma").

### Flujo objetivo

```text
PDF/plano
→ ingestión y registro de fuente
→ lectura/extracción (texto, tablas; OCR y visión en fases futuras)
→ candidatos detectados (con página/zona/evidencia/confianza)
→ pantalla de revisión humana (original vs interpretación)
→ corrección / aprobación / descarte
→ conversión a takeoff manual/estructurado (F3)
→ cálculo con dominio F1 (ml/kg/desperdicio/alertas/FFD)
→ export (CSV F3, Excel F4A) / pedido mock / revisión
```

---

## 1. Estrategia general de F6

### 1.1 Qué SÍ puede hacerse de forma segura en V1

| Capacidad | Por qué es segura |
|---|---|
| Subir un PDF y registrarlo como fuente (nombre, hash, páginas) | Solo metadatos + trazabilidad; en preview ni siquiera se persiste el binario |
| Extraer la capa de **texto seleccionable** de un PDF nativo | Determinista, sin inferencia; el texto es evidencia literal |
| Dejar que el usuario **seleccione/pegue** fragmentos de texto y los proponga como candidatos | El humano delimita; el sistema solo interpreta con el parser F1 ya probado |
| Detectar en el texto **patrones de despiece** que el parser F1 ya entiende (`5#5600`, `74E#3200`, `2X65E#3182`, `10#7205 @ 15CM`, `#4 L=0.62`, dobleces `15+35+15`) | Reutiliza F1 tal cual: cada match trae confianza, explicación y `needs_review` |
| Mostrar candidatos con **fuente (página/zona), confianza y explicación** | Transparencia total; el usuario ve de dónde salió cada dato |
| Revisión humana: corregir, aprobar, descartar, asignar elemento/ubicación | Es el corazón del contrato; nada pasa sin este paso |
| Convertir candidatos **aprobados** en líneas de takeoff manual F3 | El destino es un flujo ya existente y validado (parser + cálculo F1) |
| Decir honestamente **"no interpretable"** o "información insuficiente" | El estado honesto es un feature, no un fallo |

### 1.2 Qué NO debe prometerse (nunca, en ninguna fase)

- **Cantidades definitivas automáticas.** El output de F6 son candidatos,
  no cantidades aprobadas.
- **Lectura garantizada de cualquier plano.** Hay planos que un humano
  experto tampoco puede cuantificar sin el ingeniero; el sistema lo dirá.
- **Medición automática sobre geometría sin calibración.** Sin escala
  verificada por el usuario no existe ninguna longitud derivada de dibujo.
- **Interpretación de símbolos/convenciones sin diccionario confirmado.**
  Cada oficina de ingeniería dibuja distinto.
- **Sustituir la revisión del ingeniero/presupuestador.** F6 ahorra
  digitación y búsqueda, no responsabilidad técnica.
- **OCR "perfecto" de escaneados.** Cuando llegue OCR (F6D), todo lo que
  produzca nace `requiere_revision` como máximo.

### 1.3 Qué queda para fases futuras (resumen; detalle en ROADMAP)

- Extracción estructurada de tablas (F6C).
- OCR de escaneados (F6D — requiere aprobación de librería/licencia).
- Regiones/BBox navegables por página (F6E).
- Geometría y cotas con calibración de escala asistida (F6F).
- Asistencia multimodal (visión) como sugeridor, jamás como aprobador (F6G).
- Persistencia real (tablas §9) — depende del gate F2 y NO es parte de F6.

---

## 2. Taxonomía de PDF/plano de entrada

El intake clasifica cada fuente ANTES de prometer nada. La clase determina
qué pipeline aplica y qué techo de confianza es alcanzable.

| # | Tipo | Señales de detección | Qué se puede extraer | Techo de confianza |
|---|---|---|---|---|
| T1 | PDF con texto seleccionable y tabla de despiece clara | capa de texto presente; filas repetitivas con №/longitud/cantidad | candidatos por fila, casi 1:1 | **alta** (aún así, revisión obligatoria) |
| T2 | PDF con texto y cuadros parciales | texto presente; tablas incompletas o partidas entre páginas | candidatos parciales + huecos marcados | media |
| T3 | PDF con texto sin tablas (notas, especificaciones) | texto corrido; patrones de despiece sueltos | candidatos por patrón (`#4@0.15`, `3#5`…) sin cantidades totales | media/baja |
| T4 | PDF escaneado (imagen) | sin capa de texto; páginas = bitmaps | **nada en V1** (estado honesto); OCR en F6D | baja tras OCR; nunca alta |
| T5 | Plano con cotas y geometría (planta/alzado) | dibujo vectorial o imagen; medidas como cotas | **nada automático**; selección manual + calibración (F6F) | media con calibración verificada |
| T6 | Plano con detalles constructivos separados y llamados (`P-01`, `VC-01`, `C-03`, cortes) | texto de llamados detectable; detalle en otra zona/página | vínculo llamado↔detalle como *sugerencia*; el despiece sale del detalle | media (el vínculo); el despiece según su propio tipo |
| T7 | Plano con notas ambiguas / texto mal leído / mixto | texto parcial, garbled, unidades dudosas | candidatos `baja`/`no_interpretable` con evidencia | baja |

Reglas transversales:

- Una fuente real suele ser **mixta** (páginas T1 + páginas T5 en el mismo
  PDF): la clasificación es **por página**, no por archivo.
- La clase asignada se muestra al usuario con lenguaje claro ("esta página
  es un escaneo: hoy no puedo leerla automáticamente, puedes digitarla con
  el flujo manual").
- La clasificación misma es corregible por el usuario (es otra forma de
  revisión humana).

---

## 3. Niveles de confianza (resumen; modelo completo en doc hermano)

Cinco niveles, alineados con el `confidence` numérico del parser F1 y con
`verification_status` del esquema F2:

| Nivel | Significado operativo | Puede convertirse a takeoff |
|---|---|---|
| `alta` | texto nativo + patrón inequívoco + magnitudes plausibles | Sí, tras aprobación humana (un clic) |
| `media` | interpretable pero con al menos una decisión asumida (unidad, escala de notación, contexto) | Sí, tras revisión con la asunción mostrada |
| `baja` | patrón parcial, texto degradado, o fuente OCR | Solo tras corrección/confirmación campo a campo |
| `requiere_revision` | contradicción interna o dato crítico faltante (p. ej. cantidad sin longitud) | Solo tras completar/corregir |
| `no_interpretable` | sin base textual/calibrada suficiente | **No.** Solo descartar o re-crear manualmente (con vínculo a la evidencia) |

Regla dura: **la aprobación humana nunca se omite en ningún nivel**, ni
siquiera en `alta`. La confianza gradúa la fricción de la revisión (aprobar
en lote vs campo a campo), jamás la necesidad de revisión.

---

## 4. Pipeline propuesto (contrato conceptual, no implementación)

```text
[1] Ingestión de archivo
    - validar tipo/tamaño; calcular hash; registrar fuente
    - en preview F6A: archivo en memoria del navegador, metadatos en
      localStorage; en futuro: bucket privado + steel_source_files (F2)

[2] Inventario de páginas
    - una entrada por página: número, dimensiones, ¿tiene capa de texto?,
      clasificación T1–T7 (heurística + corregible)

[3] Extracción de texto (solo páginas con capa de texto)
    - texto plano + posiciones aproximadas cuando estén disponibles
    - NUNCA se inventa texto: lo que no está, no está

[4] Detección de tablas (F6C)
    - heurística de filas/columnas repetitivas sobre el texto posicionado
    - salida: regiones candidatas a tabla, con filas crudas

[5] OCR opcional (F6D, futuro, gated)
    - solo páginas sin texto; TODO resultado nace ≤ baja
    - librería sujeta a aprobación de licencia (docs/LICENSING.md)

[6] Detección de entidades de acero
    - sobre texto (nativo u OCR): patrones de despiece vía parser F1,
      diámetros (#3–#18), longitudes, separaciones (@), llamados (P-01…),
      unidades; cada hallazgo = candidato con evidencia literal

[7] Agrupación por elemento
    - sugerir agrupación por encabezados cercanos ("VIGA VC-01",
      "COLUMNA C-3"), llamados y proximidad; SIEMPRE editable

[8] Vinculación con detalles/cortes (F6E/F6F)
    - llamado en planta ↔ detalle de despiece: propuesta de vínculo,
      confirmación humana

[9] Revisión humana (pantallas del UX contract)
    - comparar original vs interpretación; corregir; aprobar; descartar;
      asignar elemento/ubicación; registrar advertencias

[10] Aprobación
    - candidato aprobado = descripción canónica F1 + metadatos de origen
    - queda registro de quién/cuándo/qué cambió respecto a lo detectado

[11] Conversión a takeoff
    - candidatos aprobados → líneas del takeoff manual F3 (misma estructura
      de INPUT: descripción, % desperdicio, varilla manual opcional)
    - F1 recalcula TODO (ml/kg/costo/alertas); F6 no calcula nada propio
    - futuro DB: filas en steel_lines con source_file/page/bbox poblados
```

Principio de una sola fuente de verdad aplicado a F6: **el pipeline no
tiene calculadora propia**. Todo número derivado (ml, kg, unidades, costo,
desperdicio) sale del dominio F1, exactamente igual que en F3.

---

## 5. Alternativas de implementación (análisis)

| Alternativa | Qué resuelve | Riesgo/costo | Veredicto |
|---|---|---|---|
| **A. Extracción textual simple** (capa de texto del PDF) | T1–T3; el caso más común de despieces digitales | bajo; determinista; sin dependencias pesadas (evaluar `pdfjs-dist` u similar cuando toque — con aprobación de licencia) | **Base de F6A/F6B.** Primera inversión |
| **B. Lectura de tablas** (heurística sobre texto posicionado) | T1/T2 con estructura de filas | medio; tablas partidas/anidadas fallan; requiere posiciones | **F6C.** Segunda inversión; degradación elegante a A |
| **C. OCR** (escaneados) | T4 | alto: dependencia nueva + licencia + errores sistemáticos (1↔l, 0↔O, .↔,) | **F6D**, gated; salida siempre ≤ `baja` |
| **D. Visión multimodal** (LLM con imagen) | T5–T7; entiende layout y símbolos "como humano" | alto: costo por página, no determinismo, riesgo de alucinación de cantidades — exactamente lo que la regla madre prohíbe | **F6G**, solo como *sugeridor* con evidencia obligatoria; jamás fuente única de un número |
| **E. Calibración por escala** (usuario marca una cota conocida; el sistema mide segmentos seleccionados) | T5; geometría sin tabla | medio; requiere visor con interacción; la escala impresa MIENTE a veces (planos re-escalados al imprimir/exportar) | **F6F**; medición solo tras calibración verificada con doble cota |
| **F. Selección manual asistida** (usuario marca zona/texto; el sistema interpreta la selección) | TODOS los tipos; es el fallback universal | bajo; convierte al humano en el detector y al sistema en el intérprete | **Desde F6A.** Es la red de seguridad de todo el intake |
| **G. Híbrido (A+B+F ahora; C/D/E después)** | cobertura máxima con riesgo escalonado | — | **Recomendación oficial de F6** |

Justificación del híbrido: A y B capturan el valor de los planos "buenos"
(digitales con tabla), F garantiza que NINGÚN plano deja al usuario
bloqueado (siempre puede seleccionar/pegar/digitar), y C/D/E/G se agregan
por fases con sus gates de licencia y sus techos de confianza.

---

## 6. Casos donde NO hay tabla (comportamiento obligatorio)

Este es el caso que define la honestidad del producto. Cuando una página
solo trae cotas, medidas en planta, símbolos, llamados a detalle, cortes o
notas estructurales:

1. **El sistema lo dice explícitamente**, con el mensaje canónico:

   > "No hay información suficiente para proponer cantidades automáticas en
   > esta página. Se requiere selección manual, calibración de escala o
   > revisión con el detalle correspondiente."

2. **Nunca produce candidatos cuantitativos** desde geometría no calibrada.
   Ni una longitud, ni una cantidad, ni un diámetro "estimado visualmente".

3. **Sí puede producir candidatos NO cuantitativos**, claramente marcados:
   - *Elementos detectados*: "hay llamados `VC-01` (×4), `C-03` (×6) en la
     página 3" → sugiere crear elementos/etiquetas, sin cantidades.
   - *Vínculos sugeridos*: "el detalle de la página 7 podría corresponder
     al llamado `VC-01`" → el usuario confirma el vínculo.
   - *Notas estructurales*: "Nota: 'refuerzo #4 @ 0.15 en ambas caras'" →
     candidato de **especificación** (diámetro+separación) SIN cantidad
     total, marcado `requiere_revision` porque falta la luz/área a cubrir.

4. **Ofrece los caminos de salida**, en este orden:
   - Selección manual asistida (F): marcar el texto/zona y digitarlo con
     preview del parser F1 (el flujo F3 embebido).
   - Calibración de escala (F6F, cuando exista): medir en el plano tras
     calibrar con una cota conocida y verificar con una segunda cota.
   - Digitación manual pura en el takeoff F3, con la página como referencia
     visual al lado.

5. **Conserva la página como evidencia** vinculable: aunque no salga ningún
   candidato automático, la línea digitada a mano puede apuntar a
   "archivo X, página N" como su fuente.

---

## 7. Anti-alucinación / seguridad técnica (reglas duras)

Numeradas para citarse en revisiones y tests (`F6-S*`):

- **F6-S1 — Nunca inventar longitudes.** Toda longitud de un candidato debe
  provenir de: (a) texto literal extraído, (b) corrección humana, o
  (c) medición con calibración verificada (F6F). No hay cuarta fuente.
- **F6-S2 — Nunca inferir escala sin calibración.** La escala impresa
  ("1:50") NO habilita medición: solo la calibración del usuario contra una
  cota conocida + verificación con una segunda cota independiente.
- **F6-S3 — Nunca aprobar automáticamente.** Ni con confianza `alta`.
  La aprobación es una acción humana explícita, auditada (quién/cuándo).
- **F6-S4 — Mostrar fuente siempre.** Cada candidato exhibe archivo,
  página, zona (cuando exista bbox) y el **texto original literal** junto a
  la interpretación. Sin evidencia visible no hay candidato.
- **F6-S5 — Conservar evidencia.** La corrección humana no borra lo
  detectado: se conserva el par (detectado → corregido) para auditoría y
  para el aprendizaje supervisado por organización (blueprint V1 §11).
- **F6-S6 — Marcar baja confianza de forma imposible de ignorar.**
  `baja`/`requiere_revision` bloquean la aprobación en lote: solo revisión
  campo a campo.
- **F6-S7 — Permitir descarte con razón.** Descartar es una salida de
  primera clase (falso positivo, duplicado, plano desactualizado, ilegible)
  y queda registrada; el candidato descartado no desaparece de la evidencia.
- **F6-S8 — Los totales no existen en F6.** Ningún resumen de F6 muestra
  "total kg del plano": los totales aparecen solo DESPUÉS de la conversión,
  calculados por F1 sobre líneas aprobadas, y rotulados como estimación de
  takeoff (no como cantidad contractual).
- **F6-S9 — OCR y visión degradan, nunca elevan.** Un dato que pasó por OCR
  o por modelo de visión no puede superar `baja` sin confirmación humana
  del texto contra la imagen.
- **F6-S10 — Sin efecto sobre el presupuesto.** F6 jamás escribe
  APU/BOQ/catálogo; su única salida es el takeoff manual F3 (que a su vez
  ya es preview sin persistencia real).

---

## 8. Contrato de datos futuro (SIN migraciones — propuesta para el gate F2)

Convenciones heredadas de F2 (`STEEL_OPS_F2_SCHEMA_DRAFT.md`): todas las
tablas con `organization_id`, RLS ENABLE+FORCE, auditoría vía
`steel_actions`, escrituras sensibles por RPC. **`steel_source_files` YA
existe en el draft F2 (§1.2): F6 lo extiende, no lo duplica.**

```text
steel_source_files (EXISTENTE en F2 — extensiones F6)
  += page_count, has_text_layer boolean, intake_classification jsonb
     (clase T1–T7 por página, corregible), intake_status
     (uploaded|classified|extracting|extracted|in_review|reviewed|failed)

steel_source_pages (NUEVA)
  id, organization_id, source_file_id FK, page_number,
  width_pt, height_pt, has_text_layer,
  classification (t1_text_table|t2_partial|t3_text_only|t4_scan|
                  t5_geometry|t6_details|t7_ambiguous),
  classification_confidence, classification_overridden_by NULL,
  extracted_text_ref NULL (storage, no en fila), ocr_status NULL (futuro),
  scale_calibration jsonb NULL (F6F: cota patrón, factor, verificación,
  calibrated_by, calibrated_at), notes

steel_detected_regions (NUEVA)
  id, organization_id, source_page_id FK,
  region_type (table|table_fragment|note|callout|detail|dimension|
               symbol_cluster|unknown),
  bbox jsonb {x0,y0,x1,y1, unit:'pt', origin:'top-left'},
  raw_text, detector (text_layout|table_heuristic|ocr|vision|user_selection),
  detector_version, confidence_score numeric(4,3),
  linked_region_id NULL (llamado ↔ detalle), created_at

steel_extraction_candidates (NUEVA — el corazón de F6)
  id, organization_id, source_file_id FK, source_page_id FK NULL,
  detected_region_id FK NULL,
  page_number int NOT NULL,            -- redundante deliberado: evidencia
  source_bbox jsonb NULL,              -- mínima aunque se borre la región
  original_text NOT NULL,              -- evidencia literal, inmutable
  candidate_kind (takeoff_line|element|spec_note|link_suggestion),
  parsed_payload jsonb NULL,           -- salida del parser F1 (estructura,
                                       -- explicación, asunciones)
  parser_version, confidence_level
  (alta|media|baja|requiere_revision|no_interpretable),
  confidence_score numeric(4,3), confidence_factors jsonb,
  suggested_element_label NULL, suggested_scope_hint NULL,
  status (detected|in_review|corrected|approved|discarded|converted),
  created_by (system|user_selection:<id>), created_at

steel_candidate_reviews (NUEVA — append-only, patrón steel_actions)
  id, organization_id, candidate_id FK, reviewer_id FK profiles,
  action (correct|approve|discard|reclassify|assign_element|assign_scope|
          split|merge),
  before_payload jsonb, after_payload jsonb,  -- F6-S5: par detectado→corregido
  reason NULL (obligatoria en discard), created_at
  -- sin UPDATE/DELETE; idempotency_key UNIQUE (org, key)

steel_takeoff_links (NUEVA)
  id, organization_id, candidate_id FK UNIQUE, steel_takeoff_id FK,
  steel_line_id FK,                    -- la línea creada en la conversión
  converted_by FK profiles, converted_at,
  conversion_snapshot jsonb            -- payload exacto convertido
```

Notas de diseño:

- `original_text` y `page_number` son **inmutables**: la corrección vive en
  `steel_candidate_reviews.after_payload` y en el estado del candidato,
  nunca sobrescribe la evidencia (F6-S5).
- `confidence_level` (categórico, para humanos y gates de UX) coexiste con
  `confidence_score` (numérico, para ordenamiento y telemetría); el mapeo
  vive en el doc de confianza y va versionado (`confidence_factors` guarda
  el desglose para poder re-explicar cualquier nivel).
- `steel_lines` (F2 §1.4) ya tiene `source_file_id`, `source_page`,
  `original_description`, `parsed_description`, `parser_version`,
  `confidence_score`, `verification_status`: la conversión F6 los puebla;
  no se necesita columna nueva en `steel_lines` salvo
  `source_candidate_id NULL` (trazabilidad inversa, opcional si
  `steel_takeoff_links` cubre la relación).
- Nada de esto se migra en F6. Es el contrato que Codex Data Model tomará
  cuando el gate F2→DB se abra, con RLS y harness `[ST]` como el resto.

---

## 9. Relación con F1 / F3 / F4A

```text
F6 (candidatos)          F3 (takeoff manual)          F1 (dominio puro)
original_text ──aprobar──▶ línea INPUT (descripción, ──▶ parseSteelDescription
+ corrección              % desperdicio, varilla       calculateSteelLine
+ elemento/ubicación      manual opcional)             evaluateSteelLineAlerts
                                                       optimizeSteelCutsFFD
                                                            │
                              CSV local (F3) ◀── totales ◀──┘
                              Excel export (F4A)
                              pedido mock (F3)
```

- **F1 es la única calculadora.** Un candidato aprobado se convierte en el
  MISMO tipo de input que una línea digitada en F3: una descripción textual
  canónica (más metadatos de origen). F1 la parsea y calcula ml/kg/unidades
  comerciales/costo/desperdicio/alertas exactamente igual. Si la corrección
  humana cambió el texto, F1 parsea el texto corregido — no hay un "modo
  F6" del cálculo.
- **F3 es el destino.** En preview, la conversión crea líneas en el takeoff
  manual (localStorage, `steel-ops-preview.manual-takeoffs.v1`) con la misma
  estructura de INPUT que F3 persiste hoy; los campos de procedencia
  (archivo/página/candidato) viajan como metadato de línea para que la UI
  pueda mostrarlos. Todo lo derivado se recalcula con F1 en cada carga,
  como ya hace F3.
- **F4A es la salida Excel.** Las líneas convertidas son líneas F3
  normales, así que el export Excel de F4A las incluye sin cambio alguno;
  la columna de origen/fuente (si F4A la expone) mostrará
  "PDF: archivo, pág. N" en lugar de "manual".
- **Las alertas F1 siguen mandando.** `needs_review` del parser F1 y las
  alertas A4/A17 etc. aplican a líneas convertidas igual que a manuales;
  la confianza F6 NO silencia una alerta F1 (se suman, nunca se restan).

---

## 10. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | Errores de OCR (1↔l, 0↔O, separadores decimales) producen longitudes/diámetros falsos pero plausibles | pedido de acero equivocado = plata | OCR gated a F6D; techo `baja`; confirmación campo a campo contra la imagen; validación de plausibilidad (kg/ml vs №) vía alertas F1 |
| R2 | Escala incorrecta (plano re-escalado al imprimir/exportar; "1:50" impreso que no corresponde) | todas las mediciones malas a la vez | F6-S2: calibración con cota conocida + verificación con SEGUNDA cota independiente; sin doble verificación no hay medición |
| R3 | Confusión de símbolos/convenciones entre oficinas de ingeniería | interpretación sistemáticamente errada | sin diccionario confirmado no se interpretan símbolos; correcciones aprendidas POR organización (nunca globales) |
| R4 | Planos desactualizados (versión superada del diseño) | cuantificar lo que ya no se va a construir | metadatos de fuente visibles (nombre/fecha/hash); advertencia al convertir desde fuentes con nombre/sello de revisión antigua; razón de descarte "plano desactualizado" |
| R5 | Información incompleta (nota sin luz, tabla partida) | cantidades parciales tomadas como totales | `requiere_revision` bloquea conversión hasta completar; F6-S8 prohíbe totales en F6 |
| R6 | Responsabilidad técnica: el usuario trata la salida como cantidad contractual | disputa comercial/legal | copy permanente de asistente ("estimación de takeoff, no cantidad contractual"), marca BORRADOR heredada de F3/F4A, aprobación nominal auditada |
| R7 | Confianza excesiva del usuario en el nivel `alta` (automation bias) | deja de mirar el original | incluso `alta` requiere aprobación; el compare original↔interpretación es la pantalla por defecto, no opcional; muestreo de verificación sugerido en lotes grandes |
| R8 | Alucinación multimodal (F6G): el modelo "ve" una tabla que no existe | candidatos falsos con apariencia sólida | F6-S9: visión solo sugiere regiones/lecturas con evidencia bbox; sin texto extraíble que la respalde, la lectura nace `baja` y va campo a campo |
| R9 | Deriva de alcance: F6 intenta calcular/persistir | duplicar fuente de verdad, violar reglas del repo | F6-S8/F6-S10 + esta fase es docs-only; cualquier código llega por sub-fases con sus propios PRs y QA |

---

## 11. Qué puede implementar Codex después (handoff de implementación)

En orden, cada uno como PR propio contra los contratos de estos docs:

1. **F6A — Codex Import/Export + Fable UIX:** upload mock (memoria del
   navegador) + inventario de páginas + extracción de texto seleccionable
   (librería a aprobar por licencia ANTES de instalar) + selección manual
   asistida + candidatos vía parser F1. Detrás de `STEEL_OPS_UIX_PREVIEW`.
2. **F6B — Fable UIX + Codex Calc:** pantallas de revisión (compare,
   corrección, aprobación/descarte, asignación) + conversión a takeoff F3 +
   registro de advertencias. Motor de conversión puro y testeado.
3. **F6C — Codex Import/Export:** heurística de tablas sobre texto
   posicionado, con fixtures sanitizados de planos reales.
4. **F6D — gate de licencia OCR** (docs/LICENSING.md) antes de una línea de
   código.
5. **F6E/F6F/F6G** según roadmap; F6F exige el contrato de calibración
   (doble cota) como test de aceptación.
6. **Codex Data Model:** cuando se abra el gate F2→DB, materializar §8
   como migraciones gated + RLS + harness `[ST]`, junto con las 15 tablas F2.

Reglas de reporte y aprobación: idénticas al blueprint V1 §15 (contrato de
reporte por agente, cruces por `INTEGRATION_REQUESTS.md`, nada a main sin
aprobación humana).
