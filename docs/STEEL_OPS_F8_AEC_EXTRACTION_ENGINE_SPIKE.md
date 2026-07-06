# STEEL OPS F8 — AEC Extraction Engine Spike

**Fecha:** 2026-07-05
**Rama:** `feature/steel-ops-f8-aec-extraction-engine-spike` (base `origin/main = b6f9c20`, post F7.1 #61)
**Naturaleza:** spike exploratorio/técnico. NO es un hotfix. Nada de este spike toca
producción, DB, Supabase, RLS, storage, `.env`, navegación global ni el flujo F7 vigente.
**Prototipo:** `apps/web/lib/steel/research/` (aislado; ningún archivo de producción lo importa).

---

## 0. Problema que motiva F8

La usuaria probó F7/F7.1 con 3 PDFs reales (planta de cimentación; vigas/detalles/
estribos/tablas; pilotes). Mejoró, pero el sistema sigue comportándose como **lector de
líneas de texto**, no como **lector técnico de planos**:

- no entiende elementos como objetos técnicos con ubicación, sección, refuerzo y repeticiones;
- no relaciona planta ↔ ejes ↔ detalles ↔ tablas ↔ despieces ↔ cortes;
- no detecta discrepancias gráfico/texto (35+150+35=220 vs texto del estribo; 19 zapatas
  dibujadas vs 16 listadas; símbolo Q sin leyenda; VC-EJE-1 repartida entre planos);
- no contabiliza repeticiones dibujadas;
- la revisión humana sigue siendo casi desde cero, así que aún no le gana al takeoff manual.

**Diagnóstico central del spike:** el techo NO es de calibración — es del INSUMO. Un PDF es
una impresión: pierde capas, bloques, entidades y estructura. Todo lo que F7 intenta
reconstruir con heurísticas (regiones, grillas, asociación texto→elemento) **ya existe como
dato exacto en el archivo CAD original (DWG/DXF)** y, cuando hay modelo, en el IFC.

---

## Parte A — Research matrix

### A.1 Pipeline actual: pdfjs + tesseract + F7 (interno, en navegador)

- **Qué logra:** texto nativo posicionado, OCR híbrido con conflictos, plan set, regiones,
  ejes, registro de elementos con alias, nomenclaturas, tablas MVP, hallazgos, evidencia
  por elemento con fuente/página/método/confianza. Todo client-side, cero costo, cero fuga
  de datos, cero dependencias de servicios.
- **Qué NO puede lograr (techo estructural):**
  - El PDF no trae capas ni bloques ⇒ no hay forma robusta de saber que un rectángulo es
    una zapata ni de contar instancias dibujadas.
  - La asociación texto→elemento es por proximidad/heurística, no por pertenencia real.
  - Las tablas son reconstrucción frágil de posiciones de texto.
  - La geometría (líneas de viga, sumas de segmentos 35+150+35) requiere interpretar
    vectores del PDF sin semántica, y en planos escaneados ni siquiera hay vectores.
  - OCR sobre planos densos produce variantes corruptas que exigen revisión completa.
- **Veredicto:** correcto como **capa base de evidencia y revisión**, insuficiente como
  motor de entendimiento AEC. Seguir "exprimiendo" OCR tiene retorno decreciente.

### A.2 Datalab **Lift** (extracción estructurada por schema)

- **Qué es:** modelo de visión de **9B parámetros open-weights** (junio 2026) especializado
  en extraer JSON estructurado de PDFs/imágenes usando **JSON Schema con decoding
  restringido** (la salida SIEMPRE valida contra el schema). De los autores de Marker/Surya.
- **Schema JSON:** sí — JSON Schema estándar (strings, números, booleans, arrays, objetos
  anidados). Recomiendan evitar `enum`, `anyOf/oneOf`, `$ref`, `additionalProperties`
  (el decoder los salta y se pierde la garantía). Nuestro `steel-ext-2` es compatible si se
  simplifican los enums a strings al copiarlo.
- **Licencias:** código **Apache-2.0** (sin riesgo de contaminación); **pesos** bajo
  OpenRAIL-M modificado — gratis para investigación, uso personal y **startups con <$2M de
  funding/revenue**; por encima requiere licencia comercial de Datalab.
- **Local:** sí, vía HuggingFace/vLLM, pero **requiere GPU** (tuning documentado para T4 →
  H100; un 9B necesita en la práctica una GPU dedicada). No viable en el navegador ni en
  Vercel serverless.
- **Managed:** API de Datalab. Precio reportado ≈ **US$25 por 1.000 páginas** (tier
  balanced); allowance gratis de ~US$20/mes con correo corporativo. La API managed reporta
  mayor precisión que los pesos abiertos + verificación y citas.
- **Privacidad:** managed ⇒ los planos SALEN a Datalab (requiere consentimiento de la
  usuaria y contrato); local ⇒ privado pero con GPU propia.
- **¿Sirve para planos estructurales?** Está entrenado para *documentos* (facturas, papers,
  tablas). En planos: fuerte para **tablas/cuadros de despiece y texto denso**; no está
  entrenado para semántica gráfica AEC (contar zapatas dibujadas, leer grillas). Puede
  devolver beams/footings/piles/rebar como JSON si el schema lo pide, con la calidad
  limitada a lo textual/tabular de la lámina.
- **Encaje:** candidato fuerte para el **External JSON Bridge** que ya existe en F7.1
  (BYO-JSON): la usuaria lo corre por su cuenta y pega el JSON; Steel Ops valida y compara.
  Cero integración de riesgo hoy.

### A.3 Marker / Surya / PDFText (Datalab open-source)

- **Marker:** PDF → markdown/JSON con layout y tablas. Código **GPL-3.0** ⇒ **prohibido
  dentro del app** (regla LICENSING; mismo criterio que AGPL). Solo sería usable como
  **proceso externo separado** (CLI aparte que la usuaria corre), nunca vendorizado.
- **Surya:** OCR/layout/tablas. Código **Apache-2.0**, pero **pesos** OpenRAIL-M
  restringido (<$2M) — igual que Lift. Python + GPU recomendada.
- **PDFText:** extracción de texto (Apache-2.0), equivalente a lo que ya hacemos con pdfjs.
- **¿Como preprocess?** Marker/Surya darían mejores tablas que nuestro MVP, pero: GPL en
  Marker, Python+GPU en ambos, y el beneficio real en PLANOS (no documentos) es moderado.
- **Veredicto:** descartados como dependencia del producto. Marker queda documentado como
  herramienta externa opcional del flujo BYO-JSON (la usuaria la corre fuera y pega el
  resultado), sin código GPL en el repo.

### A.4 Autodesk APS (Forge) — Model Derivative API

- **Qué permite:** subir DWG/DXF/RVT/IFC y obtener derivados: **árbol de objetos,
  propiedades/metadata, geometría (OBJ/SVF), thumbnails**, visor web. Es la vía "oficial"
  para DWG sin ingeniería inversa.
- **Costo:** por Flex tokens (~**US$3/token**; paquete mínimo 33 tokens ≈ US$99).
  Model Derivative cobra **0.1 tokens por trabajo simple** (DWG⇒derivado ≈ **US$0.30 por
  archivo**) y 0.5 tokens por complejo (RVT/IFC/NWD ≈ US$1.50). Requiere cuenta APS,
  OAuth 2-legged y bucket cloud de Autodesk.
- **Privacidad:** los planos SUBEN a la nube de Autodesk. Contractualmente serio, pero es
  salida de datos que hoy no hacemos y requiere aprobación explícita de la usuaria.
- **Dificultad:** media (REST + colas de traducción + normalizar el árbol de propiedades).
  SDKs oficiales para Node.
- **¿Más correcto para DWG?** Es la opción managed más sólida para DWG *sin convertir*.
  Pero para el caso Steel Ops (texto, bloques, capas, conteos) el flujo **DWG→DXF→parser
  propio** logra lo mismo sin costo por archivo ni salida de datos.
- **Veredicto:** reserva estratégica — activar solo si aparecen DWG que no se puedan
  convertir a DXF o si se necesita el visor 2D/3D embebido.

### A.5 Open Design Alliance (ODA)

- **Qué ofrece:** SDKs C++/.NET para leer/escribir DWG/DGN/RVT nativos (ex-Teigha), el
  estándar de facto fuera de Autodesk. También **ODA File Converter** (app gratuita,
  binario propietario) que convierte DWG↔DXF por lotes.
- **Licenciamiento:** membresía anual por suscripción. Tier **startup desde ~US$100/año**;
  Commercial limitado a 100 seats; Sustaining ~US$6K primer año (~US$3.6K/año después);
  BIM/Revit aparte (US$5K–10K/año). Si la suscripción termina, se pierde el derecho de
  distribuir el producto basado en ODA — riesgo de lock-in contractual.
- **¿Aplica a una startup/producto?** El tier de US$100/año es accesible, pero integra
  C++/.NET en un monolito Next.js = worker separado + build nativo + contrato anual. Es
  MUCHA infraestructura para leer texto/bloques/capas.
- **Veredicto:** no para F8/F8A. El **ODA File Converter** (gratuito, se usa como programa
  externo sin vincular código) sí es la pieza recomendada del flujo DWG→DXF del lado de la
  usuaria; no entra al repo.

### A.6 LibreDWG

- **Capacidades:** lectura DWG en C, madura para versiones comunes, con bindings.
- **Licencia:** **GPL-3.0** ⇒ vincularla contaminaría el producto (prohibido por LICENSING,
  mismo criterio que AGPL/no-copiar).
- **¿Como herramienta externa?** Legalmente posible correr `dwg2dxf` como PROCESO separado
  (GPL no se propaga por exec), pero significa distribuir/gestionar binarios GPL en la
  infraestructura del producto por algo que el ODA File Converter gratuito ya resuelve.
- **Veredicto:** descartada.

### A.7 ezdxf (Python, MIT)

- **Utilidad:** la librería de referencia para DXF — entidades completas (TEXT, MTEXT,
  INSERT, atributos de bloque, LWPOLYLINE, DIMENSION, HATCH), capas, bloques, coordenadas,
  layouts, consultas. **MIT** ⇒ sin riesgo de licencia.
- **Límites:** NO lee DWG (binario propietario) — necesita DXF. Python ⇒ requiere worker
  aparte (PROJECT_MASTER §5.3 ya prevé "lectura avanzada de planos" como el caso válido
  para un servicio Python futuro).
- **Flujo DWG→DXF→Steel Ops:**
  1. La usuaria exporta DXF desde AutoCAD (`SAVEAS`) o convierte DWG con **ODA File
     Converter** (gratis, local — los planos no salen de su máquina).
  2. Motor DXF lee entidades: capas dicen QUÉ es cada cosa, los INSERT cuentan instancias
     dibujadas, los textos vienen exactos (sin OCR), las coordenadas dan la relación
     espacial real con los ejes.
  3. Salida en `steel-ext-2` → mismo flujo de evidencia/comparación/aprobación humana.
- **Hallazgo clave del spike:** para el subconjunto que Steel Ops necesita (texto, capas,
  bloques, coordenadas), el DXF ASCII se puede parsear **en TypeScript puro, sin ninguna
  dependencia** (formato público de pares código/valor). El prototipo de la Parte C lo
  demuestra con tests. ezdxf queda como upgrade natural si luego se necesita geometría
  avanzada (dimensiones asociativas, hatches, paper space), vía worker Python.

### A.8 IFC: web-ifc / IfcOpenShell

- **web-ifc (ThatOpen `engine_web-ifc`):** lee/escribe IFC en JS/WASM a velocidad nativa,
  corre EN EL NAVEGADOR (igual que pdfjs/tesseract hoy). Licencia **MPL-2.0** — copyleft
  débil por archivo, compatible con producto propietario si no se modifica la librería
  (uso normal via npm = sin obligaciones prácticas). npm: `web-ifc`.
- **IfcOpenShell:** C++/Python, parsing completo IFC2x3–IFC4x3 + geometría. Licencia
  **LGPL-3.0** — usable dinámicamente pero incómoda; además Python/C++ ⇒ worker aparte.
- **¿Extracción real de elementos estructurales?** Sí y de la mejor calidad posible:
  `IfcBeam`, `IfcFooting`, `IfcPile`, `IfcColumn` con cantidades (`IfcElementQuantity`) y,
  si el modelo está bien armado, refuerzo explícito (`IfcReinforcingBar`,
  `IfcReinforcingElement`) con diámetros, longitudes y hasta geometría de doblado.
- **Limitación honesta:** depende 100% de que EXISTA un modelo IFC bien modelado. Los
  proyectos actuales de la usuaria llegan como PDF/DWG; el refuerzo casi nunca viene
  modelado en IFC en el mercado local. Es la vía correcta a FUTURO (clientes BIM), no la
  solución del dolor de hoy.
- **Veredicto:** web-ifc (MPL-2.0, browser) es la elección si/cuando entre IFC; IfcOpenShell
  solo si algún día se necesita geometría avanzada server-side.

### A.9 API multimodal directa (Claude / GPT / Gemini)

- **Qué haría:** renderizar cada página del plano a imagen (el pipeline F6B ya rasteriza
  con pdfjs), enviarla al modelo con el schema `steel-ext-2` y recibir JSON estructurado
  (Claude: structured outputs con `output_config.format`; los tres soportan salida JSON).
- **Costo por página (orden de magnitud, precios oficiales 2026):** una lámina en alta
  resolución ≈ 1.600–4.800 tokens de imagen + salida JSON.
  - Claude Opus 4.8 ($5/M in, $25/M out): ≈ **US$0.03–0.10/página**; Haiku 4.5 ($1/$5):
    ≈ US$0.01–0.03. Batch API: −50%.
  - Gemini 2.5 Pro ($1.25/M in, $10/M out): similar o menor.
  - Un plan set de 30 láminas ≈ US$1–3 con modelo top. Costo NO es la barrera.
- **Privacidad:** los planos salen al proveedor. Con API de pago no se entrena con los
  datos (términos estándar de Anthropic/OpenAI/Google), pero sigue siendo egreso de
  información de proyecto ⇒ **opt-in explícito, por plan set, con aviso claro**.
- **Precisión:** la mejor comprensión *visual* disponible hoy — relaciona planta, detalles,
  cortes y tablas "como un humano". Riesgos: alucinación de cantidades, conteo gráfico
  poco fiable en láminas densas, variabilidad entre corridas.
- **Validación (por qué JAMÁS auto-aprobar):** el JSON llega con `evidenceText` literal +
  página + confianza; Steel Ops re-verifica cada `evidenceText` contra el texto extraído
  por F7 de esa página (si el texto citado no existe ⇒ marca de alucinación), compara
  contra la detección interna (matches/missing/conflicts, ya construido en F7.1) y todo
  entra `needsReview=true`. El modelo propone; la ingeniera dispone.
- **Encaje:** hoy ya funciona SIN integración vía BYO-JSON (F7.1). La integración nativa
  (server-side con key propia) es una fase posterior con flag + opt-in.

---

## Parte B — Decision architecture (arquitectura por capas)

Cuatro motores sobre UN solo contrato de salida (`steel-ext-2`) y UN solo flujo de
revisión/aprobación humana (el de F6E/F7). Ningún motor calcula (F1 única calculadora) ni
aprueba.

```text
┌────────────────────────────────────────────────────────────────────┐
│                    Steel Ops — Review & Evidence UI                │
│   (comparación, matches/missing/conflicts, aprobación humana)      │
└──────────────────────────▲─────────────────────────────────────────┘
                           │  steel-ext-2 (contrato único)
   ┌───────────┬───────────┴────────────┬──────────────────┐
   │ 1. F7     │ 2. External JSON       │ 3. CAD/DXF/IFC   │ 4. Vision
   │ Engine    │    Bridge              │    Engine        │    Assisted
   │ (PDF, en  │ (BYO-JSON: Lift,       │ (DXF parser TS;  │ (API multi-
   │ navegador)│  Claude, GPT, Gemini)  │  web-ifc futuro) │  modal opt-in)
   └───────────┴────────────────────────┴──────────────────┴──────────┘
```

1. **Internal F7 Engine** (existe): PDF sin salir del navegador. Base de evidencia,
   revisión básica, y **verificador** de lo que digan los demás motores (el texto citado
   por un motor externo debe existir en la página).
2. **External JSON Bridge** (existe en F7.1 con `steel-ext-1`; F8A lo sube a `steel-ext-2`):
   la usuaria corre Lift/Claude/GPT/Gemini por su cuenta con el schema copiable y pega el
   JSON. Steel Ops valida shape, compara contra F7 y JAMÁS auto-aprueba. Cero costo, cero
   keys, cero egreso desde el producto.
3. **CAD/DXF/IFC Engine** (el camino serio; prototipado en Parte C): con DXF se leen
   entidades REALES — capas, textos exactos, bloques con conteo de inserciones,
   coordenadas, y a futuro cotas/polilíneas para verificar sumas 35+150+35. Con IFC
   (web-ifc) se leen elementos estructurales tipados. Sin OCR, sin heurística de regiones,
   sin salida de datos (todo local/navegador).
4. **Vision Assisted Engine** (opt-in, última capa): solo cuando F7+CAD no alcancen
   (escaneados viejos, detalles a mano). Con costo visible por página, aviso de privacidad,
   verificación anti-alucinación contra F7 y aprobación humana.

**Regla transversal:** los cuatro motores emiten evidencia con
`sourceFileName/pageNumber/region/bbox/method/confidence/evidenceText/needsReview/warnings`.
La discrepancia (gráfico vs texto, suma de cotas vs texto, plano A vs plano B, símbolo sin
leyenda) es entidad de primera clase — ahí es donde la herramienta le AHORRA trabajo real a
la ingeniera en vez de dársela.

---

## Parte C — Prototype mínimo (implementado: Opción 1, DXF)

**Archivos** (aislados en `apps/web/lib/steel/research/`, sin imports desde producción):

| Archivo | Qué es |
|---|---|
| `lib/steel/research/dxf-extraction-spike.ts` | Parser DXF ASCII mínimo (TEXT/MTEXT/INSERT/LWPOLYLINE, capas, coordenadas) + fixture sintético generado por código + candidatos estructurales + conteos + salida `steel-ext-2`. **Cero dependencias nuevas.** |
| `lib/steel/research/steel-ext-2-schema.ts` | Schema profesional Parte D (tipos TS + JSON Schema draft-07 copiable + validador de invariantes). |
| `tests/unit/steel/research/dxf-extraction-spike.test.ts` | 12 tests. |

**Lo que el prototipo demuestra (12/12 tests verdes):**

- Un DXF se parsea en TS puro (pares código-de-grupo/valor del formato público) — no hizo
  falta instalar ezdxf ni nada para el subconjunto que Steel Ops necesita.
- Detección de `VC-2 (50x60)`, `Z-01`, `P-03 Ø60` **reutilizando el registro F7**
  (`extractElementMentions`): las nomenclaturas ya calibradas sirven tal cual sobre CAD.
- La capa dice QUÉ es cada texto (`layer:ZAPATAS-TEXTO`, `layer:ROTULO`): el ruido de
  rótulo se descarta por capa, sin la heurística de posición que en PDF falla.
- **Conteo gráfico real:** 3 inserciones del bloque `ZAPATA_TIPO_1` = 3 zapatas dibujadas,
  vinculadas al código `Z-01` por cercanía.
- **Discrepancia de primera clase:** el cuadro dice `CANT: 4` ⇒ hallazgo crítico
  `graphic_vs_text_count` "3 dibujadas vs 4 listadas" — exactamente el dolor real
  (19 vs 16) que F7 no puede ver en PDF.
- Toda la salida valida los invariantes `steel-ext-2`: evidencia completa, método
  `dxf_entity`, confianza 0.95, `needsReview=true` siempre (el validador rechaza documentos
  auto-aprobados).

**Por qué NO se instaló nada:** ezdxf es Python (worker aparte, prematuro para un spike);
librerías DXF de npm existen pero ninguna aporta nada que el parser de 150 líneas no cubra
para texto/capas/bloques, y evitar dependencia = cero superficie de licencia/peso. Documentado
como decisión, no como limitación: si F8A necesita cotas asociativas/hatches/geometría, el
upgrade es ezdxf en el worker Python previsto por PROJECT_MASTER §5.3.

**Opción 3 (bridge externo):** ya existe desde F7.1 (`external-structured-extraction.ts`,
comparación matches/missing/conflicts). F8 no lo duplica; F8A lo migra a `steel-ext-2`.

---

## Parte D — Schema profesional `steel-ext-2`

Definido en `lib/steel/research/steel-ext-2-schema.ts` (tipos TS + JSON Schema draft-07
copiable a motores externos + `validateSteelExt2Invariants`). Entidades:

- `project`, `planSet`, `sourceDocuments` (formato, capas CAD, disciplina), `pages`;
- `elements` con `elementType` (`beam`/`footing`/`pile`/`column`/`wall`/`slab`/`other`),
  `axisContext`, `section`, `diameter`, `quantity`, `instances` (coordenadas dibujadas),
  `tableReference`, `detailReference`, `unresolvedFields`;
- `reinforcement` desglosado: `longitudinalBars`, `stirrups`, `hooks`, `laps` (marca,
  cantidad, longitud CON unidad, separación, repeticiones);
- `tableRows` (cuadros con celdas crudas + elemento asociado);
- `axisContext` (ejes con orientación y posición);
- `graphicCounts` vs `textCounts` (separados, cada uno con su base y evidencia);
- `discrepancies` tipadas: `graphic_vs_text_count`, `dimension_sum_mismatch`,
  `cross_document_conflict`, `symbol_without_legend`, `other`, con severidad;
- `unresolvedNomenclature` (símbolo + razón), `sourceEvidence` (evidencia suelta).

**Evidencia obligatoria en cada dato:** `sourceFileName`, `pageNumber`, `region`, `bbox`
(si existe), `method` (`native_text|ocr|external_json|dxf_entity|ifc_entity|vision_api|manual`),
`confidence` 0–1, `evidenceText` literal, `needsReview` (true al importar, siempre) y
`warnings`. El JSON Schema los declara `required` en elementos, conteos y discrepancias.

---

## Parte E — Criterios de decisión

| Ruta | Costo | Privacidad | Precisión esperada | Complejidad | Licencia | PDF | DWG | IFC | Recomendación |
|---|---|---|---|---|---|---|---|---|---|
| F7 interno (pdfjs+tesseract) | $0 | Total (navegador) | Media en texto; nula en gráfico | Ya construido | MIT/Apache | ✅ | ❌ | ❌ | Mantener como base + verificador |
| DXF parser propio (TS) | $0 | Total (navegador) | **Alta** en texto/capas/bloques/conteos | Baja-media (spike hecho) | Propia (0 deps) | ❌ | ✅ vía DXF | ❌ | **PRIMERA — F8A** |
| ezdxf (Python) | $0 | Total (local) | Alta + geometría avanzada | Media-alta (worker Python) | MIT ✅ | ❌ | ✅ vía DXF | ❌ | Upgrade futuro del motor DXF |
| ODA File Converter (DWG→DXF) | $0 (app gratuita) | Total (máquina de la usuaria) | Conversión fiel | Nula (externo, no se integra) | Propietaria, uso gratuito, fuera del repo | ❌ | ✅ | ❌ | Recomendar como paso del flujo |
| ODA SDK | US$100+/año (startup) | Total | Máxima DWG nativo | Alta (C++/.NET + contrato) | Comercial | ❌ | ✅ | parcial | Evitar por ahora |
| LibreDWG | $0 | Total | Media-alta | Media | **GPL-3 ⛔** | ❌ | ✅ | ❌ | **Descartada** (contaminación) |
| Autodesk APS Model Derivative | ~US$0.30/DWG (0.1 token × US$3) + cuenta | Planos suben a Autodesk | Alta (metadata/geometría oficial) | Media (REST/OAuth/colas) | Servicio comercial | parcial | ✅ | ✅ | Reserva si DXF no alcanza |
| web-ifc | $0 | Total (WASM en navegador) | **Máxima** si hay modelo IFC | Media | **MPL-2.0 ✅** | ❌ | ❌ | ✅ | Segunda ola (clientes BIM) |
| IfcOpenShell | $0 | Total (local) | Máxima + geometría | Alta (Python/C++) | LGPL-3 ⚠️ | ❌ | ❌ | ✅ | Solo si web-ifc queda corto |
| Lift (Datalab) managed | ~US$25/1.000 págs (≈$0.025/pág) | Planos salen a Datalab | Alta en tablas/texto; limitada en gráfico | Baja (BYO-JSON ya existe) | Código Apache-2.0; **pesos <$2M** | ✅ | ❌ | ❌ | Vía BYO-JSON, sin integrar |
| Lift local (GPU) | GPU dedicada | Total | Ídem | Alta (vLLM+GPU) | Pesos OpenRAIL-M restringido | ✅ | ❌ | ❌ | No por ahora |
| Marker/Surya | $0 (self-host GPU) | Total | Buena en tablas | Media (Python/GPU) | **Marker GPL-3 ⛔** / Surya Apache+pesos restr. | ✅ | ❌ | ❌ | Descartada como dependencia |
| API multimodal (Claude/GPT/Gemini) | ~US$0.01–0.10/pág (batch −50%) | Planos salen al proveedor (no-training estándar) | La mejor comprensión visual; riesgo alucinación | Media (render+schema+verificación) | Servicio | ✅ | imagen | ❌ | Cuarta capa, opt-in |

---

## Parte F — Recomendación clara

**Probar primero (F8A):** el **motor CAD/DXF propio** (capa 3), promoviendo el spike a
feature detrás de `STEEL_OPS_UIX_PREVIEW`: subir `.dxf` en el intake existente → entidades
reales → `steel-ext-2` → mismo centro de revisión/comparación de F6E/F7. Es la única ruta
que ataca la causa raíz (el PDF destruye la estructura), con costo $0, privacidad total,
cero dependencias y el spike ya probado. En paralelo, **subir el bridge externo a
`steel-ext-2`** para que Lift/Claude/GPT/Gemini devuelvan discrepancias y refuerzo
desglosado por el mismo contrato.

**Evitar:** LibreDWG y Marker como dependencias (GPL-3, contaminan el producto); ODA SDK
(contrato + C++ desproporcionados hoy); Lift self-hosted (GPU + pesos restringidos).

**Dejar para más adelante:** web-ifc/IFC (esperar proyectos con modelo BIM real);
integración nativa de API multimodal (después de que CAD pruebe valor; hoy la cubre
BYO-JSON); APS (solo si aparecen DWG inconvertibles o se quiere visor embebido); worker
Python + ezdxf (cuando se necesite geometría DXF avanzada).

**Sin costo:** todo lo recomendado para F8A (parser DXF propio, schema v2, bridge v2,
ODA File Converter gratuito del lado de la usuaria, export DXF desde AutoCAD).
**Requiere cuenta/API:** Datalab managed, APS, APIs multimodales (keys + opt-in + aviso
de egreso de datos). **Requiere GPU:** Lift/Surya/Marker locales. **Requiere licencia
comercial:** ODA SDK; Lift/Surya por encima de $2M revenue; Marker uso comercial sin GPL.

**Puede ir en ICONIC OPS sin riesgo:** el motor DXF TS (código propio), `steel-ext-2`,
el bridge BYO-JSON, y web-ifc cuando toque (MPL-2.0 via npm). Nada de esto toca DB, RLS,
storage ni navegación; todo tras el flag y con aprobación humana obligatoria.

---

## Parte G — Por qué esto SÍ reduce trabajo real (no "más OCR")

La conclusión de F8 no es "mejorar OCR" ni "que revise un humano". Es un cambio de insumo y
de unidad de trabajo:

- Con DXF, el sistema deja de ADIVINAR texto (OCR) y regiones (heurística): lee el dato
  exacto con su capa y su posición. La ingeniera pasa de "revisar todo desde cero" a
  "resolver las discrepancias que el sistema encontró" — 3 vs 4 zapatas, estribo cuya suma
  de cotas no cuadra, símbolo sin leyenda, viga con refuerzo en una lámina y ubicación en otra.
- El conteo de repeticiones (bloques) y la ubicación por ejes (coordenadas reales) salen
  gratis del CAD; en PDF eran imposibles o frágiles.
- La aprobación humana se mantiene COMO CONTROL (needsReview en el contrato y validador que
  rechaza auto-aprobación), pero sobre una lista corta de conflictos con evidencia, no
  sobre cada línea leída.

**Listo para F8A (implementación real):** contrato `steel-ext-2` + validador; parser DXF
probado; mapa de decisión y licencias; plan de capas. F8A = intake `.dxf` en la UI gateada,
migración del bridge a v2, comparador DXF↔F7↔externo unificado, y guía "cómo exportar DXF /
convertir DWG con ODA File Converter" para la usuaria.

---

## Fuentes consultadas (2026-07-05)

- Lift: [github.com/datalab-to/lift](https://github.com/datalab-to/lift) (Apache-2.0, 9B, vLLM/GPU, schema-constrained), [documentation.datalab.to — Structured Extraction](https://documentation.datalab.to/docs/recipes/structured-extraction/api-overview), [datalab.to/pricing](https://www.datalab.to/pricing), [anuncio](https://www.marktechpost.com/2026/06/23/datalab-releases-lift-a-9b-open-weights-vision-model-that-extracts-structured-json-from-pdfs-using-schemas/)
- Marker/Surya: [github.com/datalab-to/marker](https://github.com/datalab-to/marker) (GPL), [LICENSE](https://github.com/datalab-to/marker/blob/master/LICENSE), [github.com/datalab-to/surya](https://github.com/datalab-to/surya) (Apache-2.0 + [MODEL_LICENSE](https://github.com/datalab-to/surya/blob/master/MODEL_LICENSE) OpenRAIL-M restringido)
- APS: [Model Derivative API](https://aps.autodesk.com/developer/overview/model-derivative-api), [precios por token (0.1/0.5 por trabajo)](https://aps.autodesk.com/blog/forge-pricing-explained-3-what-does-each-forge-api-cost), [Flex US$3/token](https://www.autodesk.com/buying/flex), [token estimator](https://aps.autodesk.com/blog/introducing-new-token-estimator-tool-aps)
- ODA: [opendesign.com/pricing](https://www.opendesign.com/pricing) (startup ~US$100/año; Sustaining US$6K/3.6K), [membership FAQ](https://www.opendesign.com/faq/membership)
- IFC: [github.com/ThatOpen/engine_web-ifc](https://github.com/ThatOpen/engine_web-ifc) ([MPL-2.0](https://github.com/ThatOpen/engine_web-ifc/blob/main/LICENSE.md), [npm web-ifc](https://www.npmjs.com/package/web-ifc)), [IfcOpenShell](https://github.com/ifcopenshell/ifcopenshell) (LGPL)
- Multimodal: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing); Claude: referencia oficial local (skill claude-api, precios 2026: Opus 4.8 $5/$25, Sonnet 5 $3/$15, Haiku 4.5 $1/$5 por MTok; batch −50%; imágenes alta resolución hasta ~4.784 tokens)
- ezdxf (MIT, PyPI) y formato DXF ASCII (Autodesk DXF Reference pública): conocimiento estable verificado contra el prototipo.
