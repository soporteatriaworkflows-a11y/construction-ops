# STEEL OPS — F7: Hallazgos de la prueba con PDFs reales (F6B/F6C/F6E)

**Fecha:** 2026-07-05 · **Owner:** Fable (Product Architect) · **Estado:** docs-only.
**Fuente de los hallazgos:** prueba manual de la dueña del producto con tres
PDFs estructurales reales (planta de cimentación; vigas de cimentación con
detalles, tablas y flejado/estribos; pilotes), contrastada con auditoría
estática del código F6A/F6B/F6C/F6E. Fable **no** ejecutó los PDFs (son
privados y no viven en el repo): cada síntoma reportado se mapea aquí a su
causa raíz verificada en código.

---

## 1. Contexto de la prueba

| PDF | Contenido típico | Resultado observado |
|---|---|---|
| Planta de cimentación | Ejes A/B/C y 1/2/3, ubicación de zapatas/pilotes/vigas, rótulos | Carga y extrae texto; ubicación "no detectada" pese a estar en ejes/rótulos |
| Vigas de cimentación | VC-EJE-1/VC-EJE-A, secciones 50x60, refuerzo longitudinal, estribos/flejado, detalles laterales, tablas con CANT. | Detecta candidatos sueltos; pocas relaciones con alta confianza |
| Pilotes | Identificación de pilotes, diámetros (Ø), cantidades, refuerzo, estribos, ubicación por ejes | Igual: líneas aisladas, advertencias OCR repetitivas |

**Veredicto de la usuaria (aceptado como criterio):** el flujo funciona
técnicamente (carga, extrae, OCR, detecta), pero **todavía no supera el costo
de sacar cantidades a mano**, porque lee líneas aisladas en lugar de entender
el plano.

---

## 2. Qué hace bien hoy (para no tirarlo)

- **F6A** — detector por patrones sobre texto: reglas F1 verificadas ida y
  vuelta, campos faltantes explícitos, cero invención. Sólido para despieces
  digitados o texto limpio.
- **F6B** — plan set multi-PDF, clasificación de página corregible, menciones
  de elementos, extracción de texto nativo en el navegador sin subir nada.
- **F6C** — cobertura por página, OCR por página bajo demanda, techo de
  confianza OCR inquebrantable, comparación nativo↔OCR sin fusionar.
- **F6E** — agrupación por código de elemento con estados de completitud,
  conflictos marcados sin auto-resolución, evidencia que viaja al Excel.
- **Transversal** — todo puro/testeable, sin DB/storage/red, detrás de
  `STEEL_OPS_UIX_PREVIEW`, con 186 tests de acero en verde.

El problema NO es que estas piezas estén mal hechas: es que operan sobre una
representación demasiado pobre del plano (texto plano por líneas).

---

## 3. Síntoma → causa raíz (auditoría de código)

### S1. Advertencia repetitiva del símbolo `#` aunque el plano sí es legible

- `hasLostHashSuspicion()` (`pdf-ocr.ts`) evalúa el texto OCR de **toda la
  página**: si la página no trae `#` y hay cualquier huella (`\d{5,6}` — seis
  dígitos que pueden ser una cota, un abscisado o un NIT), se muestra
  `OCR_LOST_HASH_WARNING` completo bajo el textarea de la página.
- La advertencia es **por página, genérica y no accionable**: no señala QUÉ
  fragmento corregir ni dónde está en la imagen.
- Resultado: en planos reales (llenos de números largos) la advertencia
  aparece casi siempre, se repite por página y entrena al usuario a ignorarla.

### S2. "Hay que corregir demasiado texto manualmente"

- El OCR corre sobre la **página completa** renderizada a `OCR_RENDER_SCALE = 2`
  (~144 dpi, `pdf-ocr-client.ts`). Un pliego de 24×36" a 144 dpi deja los
  textos de despiece en pocos píxeles de altura: tesseract rinde mal y el
  usuario recibe una sopa con errores distribuidos por todo el texto.
- tesseract.js **sí soporta OCR por rectángulo** (opción `rectangle`) y **sí
  devuelve bbox por línea/palabra** — hoy los bbox se usan solo para ordenar
  líneas y luego se **descartan** (`pdf-ocr-client.ts` líneas 65–73). No hay
  forma de decir "corrige solo esta zona" ni de mostrar el recorte junto al
  texto.

### S3. Pocas relaciones con alta confianza pese a planos legibles

- Las reglas F6A exigen que **cantidad + varilla + longitud convivan en la
  misma línea de texto**. En un plano real esos datos viven repartidos:
  cantidad en la tabla (columna CANT.), sección en el detalle, refuerzo en el
  despiece, repeticiones en la planta. El pipeline `línea aislada → candidato`
  no puede unirlos, y F6E solo agrupa lo que ya trae el código del elemento en
  la misma línea.
- Además `ELEMENT_CODE_PATTERN` (`pdf-intake-candidates.ts`) solo reconoce
  `LETRAS-DÍGITOS` (`VC-01`, `P-03`, `Z-1A`). **No reconoce**:
  - `VC-EJE-1` / `VC-EJE-A` (nomenclatura real del plano de vigas probado);
  - `VC 01` (espacio en vez de guion), `V.C.-1`;
  - pilotes por diámetro (`PILOTE Ø60`), secciones `50x60`, `CANT.`.
  Elementos reales quedan sin registro ⇒ sin grupo ⇒ "pocas relaciones".

### S4. "Dice que falta ubicación" aunque la ubicación está en el plano

- La evidencia de ubicación en F6B/F6E es **por tipo de página**: solo cuenta
  si el elemento aparece MENCIONADO en una página clasificada
  `ubicacion_ejes`. Tres huecos:
  1. `extractElementMentionsFromLine` **excluye deliberadamente los ejes**
     ("EJE A-1" se descarta como grilla) y no existe ningún modelo que use
     ejes como contexto de ubicación.
  2. La ubicación real suele ser **espacial** (el rótulo VC-01 está dibujado
     ENTRE los ejes A y B), no textual: al aplanar la página a líneas se
     pierde la posición.
  3. Si la planta no trae capa de texto (SHX→geometría) las menciones de
     ubicación ni siquiera existen como texto nativo.

### S5. No usa el contexto gráfico (ejes, grillas, cotas, tablas, cortes)

- `extractPdfTextInBrowser` recibe de pdfjs los items con `transform`
  completo y se queda solo con la traslación `x,y`; ignora **rotación**
  (cotas verticales quedan como ruido) y **tamaño de fuente** (no distingue
  título de rótulo de nota).
- `buildPageLines` colapsa esos items a strings con tolerancia Y fija de 2.5
  unidades y **tira las coordenadas**. Desde ese momento ninguna capa
  posterior puede razonar espacialmente: dos columnas de una tabla se mezclan
  en una "línea", y un rótulo lejano queda pegado a un despiece ajeno.
- La geometría vectorial de la página (líneas de ejes, burbujas de grilla,
  bordes de tabla) está disponible en el operator list de pdfjs y hoy solo se
  usa como **conteo** (`drawingOpCount`) para sospechar texto oculto.

### S6. Pipeline conceptual equivocado para planos

Hoy: `página → texto plano → línea → regex → candidato`.
Necesario: `página → regiones (planta/despiece/detalle/tabla/notas/rotulado)
→ texto CON posición por región → elementos → relaciones → evidencia →
revisión humana`. Ese salto es exactamente el alcance F7 (blueprint aparte).

### S7. El valor neto aún no supera el trabajo manual

Consecuencia de S1–S6: el usuario revisa candidato por candidato, corrige
texto OCR de páginas enteras y aun así el sistema le devuelve "falta
ubicación / falta detalle" sobre cosas que él ve en el plano. La fricción
percibida es mayor que digitar. Este es el criterio de éxito a revertir en
F7: **minutos ahorrados frente a digitar, medidos con estos mismos 3 PDFs**.

---

## 4. Atribución honesta de las fallas

| Parte | Qué explica | Evidencia |
|---|---|---|
| **OCR (tesseract)** | Confusión de `#`, Ø, decimales; texto pequeño/rotado a 144 dpi página completa; español genérico sin vocabulario técnico | S1, S2 |
| **Falta de visión/layout** | Sin regiones (planta vs tabla vs detalle), sin OCR por zona, sin recortes de evidencia, sin lectura de páginas 100 % geométricas | S2, S4, S5 |
| **Falta de modelo técnico** | Nomenclaturas reales no reconocidas (VC-EJE-1, Ø, 50x60, CANT.), sin taxonomía de elementos ni de secciones | S3 |
| **Falta de relación espacial** | Coordenadas descartadas; imposible asociar rótulo↔detalle↔tabla por cercanía; ejes excluidos en vez de usados como sistema de referencia | S3, S4, S5, S6 |

Nada de esto se arregla "afinando regex": exige cambiar la representación
(texto con posición + regiones + registro de elementos + grafo de evidencia).

---

## 5. Lo que NO se concluye de esta prueba

- No se concluye que haya que abandonar pdfjs/tesseract: sin regiones ni
  posición no han tenido oportunidad de rendir.
- No se concluye que un modelo de visión sea imprescindible desde ya: es una
  opción evaluada en `STEEL_OPS_F7_VISION_AND_LAYOUT_STRATEGY.md`, con gate
  de privacidad/costo/aprobación explícita.
- No se concluye que F6A–F6E se reescriban: son la capa de validación y
  revisión sobre la que F7 monta la comprensión.

## 6. Próximo paso

Diseño F7 en `STEEL_OPS_F7_DRAWING_UNDERSTANDING_BLUEPRINT.md`, estrategia de
visión/layout en `STEEL_OPS_F7_VISION_AND_LAYOUT_STRATEGY.md`, fases en
`STEEL_OPS_F7_ROADMAP.md` (incluye el hotfix F6C de advertencias OCR,
propuesto y NO implementado).
