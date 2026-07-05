# STEEL OPS — F7: Engineering Drawing Understanding Layer (Blueprint)

**Fecha:** 2026-07-05 · **Owner:** Fable (Product Architect) · **Estado:** docs-only, sin implementación.
**Padre:** `STEEL_OPS_F6_PDF_INTAKE_BLUEPRINT.md` · **Hallazgos que lo motivan:** `STEEL_OPS_F7_REAL_PDF_TEST_FINDINGS.md`.

## 0. Objetivo

Pasar de **extractor de texto/OCR** a **lector técnico asistido de planos
estructurales**: el sistema entiende el contexto del plano (regiones, ejes,
tablas, posición relativa), agrupa evidencia por elemento y reduce trabajo
humano real — sin inventar cantidades y sin quitarle la decisión al humano.

Cambio de pipeline:

```text
HOY   página → texto plano → línea aislada → regex → candidato
F7    página → regiones → texto CON posición → elementos → relaciones
      → grafo de evidencia → revisión humana → takeoff F3 (F1 calcula)
```

## 1. Reglas duras F7 (heredan y extienden F6-S1…S10)

```text
F7-S1  Nada de cantidades inventadas: toda cantidad sale de texto leído y
       verificado ida-y-vuelta contra F1, o del humano.
F7-S2  La posición/geometría es CONTEXTO y EVIDENCIA, jamás fuente de medida
       (sin escala automática; la calibración de escala sigue fuera, gate propio).
F7-S3  Ninguna relación se afirma sin evidencia trazable (página, región,
       bbox, texto literal) y toda relación inferida nace como SUGERENCIA
       confirmable con su razón en lenguaje humano.
F7-S4  Aprobación siempre humana; los estados "aprobado" solo por acción.
F7-S5  Todo en el navegador salvo decisión explícita contraria (los planos
       son datos sensibles del proyecto): sin subir archivos, sin storage,
       sin DB, sin APIs externas no aprobadas.
F7-S6  Cada capa es un módulo PURO testeable en Node; los bordes browser
       (pdfjs/tesseract/canvas) quedan en archivos `-client.ts` finos.
F7-S7  Degradación honesta: si una capa no entiende (página escaneada, tabla
       irregular), lo dice y el flujo F6 actual sigue disponible como fallback.
F7-S8  F1 sigue siendo la única calculadora; F7 no computa ml/kg/costo.
```

## 2. Arquitectura por componentes

Ubicación propuesta: `apps/web/lib/steel/drawing/` (módulos puros) +
`apps/web/lib/steel/drawing/*-client.ts` (bordes browser). La UI vive en el
intake del workspace F3, como estación de revisión ampliada.

### A. Page Understanding — regiones de página (F7A)

Dividir cada página en regiones tipadas:

```text
region_type: planta | despiece | detalle | tabla | notas | rotulado | desconocida
```

**Cómo, sin visión externa:**
- pdfjs entrega el operator list: líneas/rectángulos largos delimitan cajones
  de detalle, marcos de tabla y el rotulado (esquina inferior derecha,
  proporciones típicas).
- Clustering espacial del texto (densidad + alineación) separa bloques de
  notas (párrafos alineados) de despieces (columnas cortas) y de rótulos
  dispersos.
- Heurísticas de título por región ("DETALLE", "CORTE A-A", "CUADRO DE…",
  "NOTAS") reutilizando `suggestSourceTypeFromText`, pero POR REGIÓN, no por
  página completa.
- Siempre corregible por el humano (igual que la clasificación de página F6B).

Contrato (borrador):

```ts
interface PageRegion {
  id: string;
  pageNumber: number;
  regionType: RegionType;          // sugerido, corregible
  bbox: Box;                        // coordenadas de página pdfjs
  titleText?: string;               // "DETALLE VC-01", "CUADRO DE ZAPATAS"
  suggestionReason: string;         // por qué se clasificó así
  confidence: 'alta' | 'media' | 'baja';
}
```

### B. Spatial Text Model — texto con posición (F7A, base de todo)

Dejar de aplanar a líneas. Conservar por item de texto:

```ts
interface PositionedText {
  str: string;
  bbox: Box;                // x,y,w,h en unidades de página
  rotation: number;         // del transform completo (cotas verticales)
  fontHeight: number;       // distinguir título/rótulo/nota
  pageNumber: number;
  method: 'native_text' | 'ocr';
}
```

- `buildPageLines` NO se elimina: se vuelve una VISTA derivada ("texto por
  líneas") para el flujo F6 actual y el fallback.
- El OCR también produce `PositionedText` (tesseract ya devuelve bbox por
  línea/palabra; hoy se descartan).
- Detalle técnico conocido: los items de pdfjs traen `transform` completo
  (rotación y escala) y `width/height`; el costo de conservarlos es bajo.

### C. Axis/Grid Model — ejes como sistema de referencia (F7B)

- Detectar líneas de eje: segmentos vectoriales largos (casi de borde a
  borde) + burbuja (círculo pequeño) con texto de un solo token (`A`, `B`,
  `1`, `27`) en el extremo.
- Producir un modelo de grilla por página:

```ts
interface GridAxis { name: string; orientation: 'x' | 'y'; positions: number[]; bbox: Box }
interface PageGrid { axes: GridAxis[]; cells?: GridCell[] }
```

- Uso: dado el bbox de un rótulo (`VC-01`), derivar **ubicación sugerida**
  "entre ejes A y B, tramo 2–3" como EVIDENCIA de ubicación (F7-S3: sugerencia
  con razón, confirmable). Esto revierte el falso "falta ubicación" de F6E.
- Los ejes dejan de EXCLUIRSE (F6B los bota) y pasan a ser contexto de primera
  clase. Nunca miden nada (F7-S2).

### D. Element Registry — índice de elementos (F7B/F7D)

Registro único por takeoff de todos los elementos vistos, con nomenclatura
ampliada a los planos reales:

```text
VC-01 · VC-EJE-1 · VC-EJE-A · V.C.-1 · VC 01 · Z-01 · ZAPATA Z1
P-03 · PILOTE Ø60 · C-02 · COLUMNA C2 · MURO M-1 …
```

```ts
interface ElementRecord {
  key: string;                  // normalizado para agrupar
  aliases: string[];            // formas vistas (VC-01, VC 01, V.C.-1)
  kind?: 'viga' | 'zapata' | 'pilote' | 'columna' | ...;
  sectionSpec?: string;         // "50x60" visto cerca (evidencia, no dato)
  diameterSpec?: string;        // "Ø60" en pilotes
  occurrences: ElementOccurrence[]; // página+región+bbox+texto
}
```

- La normalización de alias es conservadora: variantes tipográficas del MISMO
  código (espacio/guion/puntos) sí; códigos distintos jamás (regla F6E de
  "parecidos se avisan, no se fusionan" se mantiene).

### E. Evidence Graph — grafo de evidencia (F7D, evolución de F6E)

F6E agrupa por código en listas planas. F7D lo convierte en grafo tipado:

```text
(Elemento) —ubicado_en→ (Región planta + celda de grilla)
(Elemento) —refuerzo_desde→ (Región despiece / fila de tabla)
(Elemento) —seccion_desde→ (Región detalle "50x60")
(Elemento) —estribos_desde→ (Detalle flejado / columna de tabla)
(Elemento) —cantidad_desde→ (Celda CANT. de tabla / repeticiones en planta)
(Evidencia) —contradice→ (Evidencia)      // conflicto, nunca auto-resuelto
(Evidencia) —confirmada_por→ (humano)
```

- Cada arista lleva: fuente (página/región/bbox), método (nativo/OCR/manual/
  visión si se aprueba F7E), razón de inferencia y estado
  (sugerida/confirmada/descartada).
- Los estados de completitud F6E se recalculan sobre el grafo (misma
  semántica, mejor recall): "falta ubicación" solo si NI mención textual NI
  posición-en-grilla existen.
- La conversión a takeoff sigue el mismo puente F6E→F3 (evidencia adjunta a
  la línea manual → Excel F4A.2), ampliando `observation` con la ruta de
  evidencia del grafo.

### F. Table Understanding — cuadros como estructura (F7C)

- Detección de tabla: marcos/reglas vectoriales del operator list +
  alineación de columnas de `PositionedText` (X-clustering) cuando la tabla
  no tiene bordes.
- Producir estructura, no texto suelto:

```ts
interface DetectedTable {
  bbox: Box; pageNumber: number;
  headers: TableCell[];          // "ELEMENTO", "SECCION", "CANT.", "LONG.", "Ø"
  rows: TableRow[];              // celdas con bbox + texto + método
  headerMapping: SuggestedMapping; // header→campo F1, corregible
  gaps: TableGap[];              // celdas ilegibles: hueco marcado, jamás rellenado
}
```

- Una fila mapeada (elemento + varilla + longitud + cantidad) se convierte en
  **candidato F6A por fila**, verificado ida-y-vuelta contra F1 como siempre;
  la celda CANT. alimenta `cantidad` con su celda como evidencia.
- Tablas partidas entre páginas: se marcan (`continúa en p.N`), nunca se
  cosen automáticamente.

### G. Human Review — estación de comprensión (transversal, se entrega con cada fase)

La UI deja de ser "lista de candidatos" y pasa a: **"esto es lo que entiendo
del plano"**:

- Vista por página: regiones sobre la miniatura (F7A), grilla detectada
  (F7B), tablas resaltadas (F7C) — cada una corregible.
- Vista por elemento (evolución del panel F6E): ficha con ubicación sugerida,
  refuerzo, sección, estribos, cantidad — cada dato con su recorte de imagen
  (bbox → crop del render) al lado del texto leído.
- Tres bandejas: **entendido** (evidencia completa, lista para aprobar),
  **falta** (qué exactamente y dónde buscarlo), **contradice** (conflictos).
- Corrección contextual: al editar un texto OCR se muestra el recorte de la
  zona, no la página entera (mata el síntoma S2 de los hallazgos).

## 3. Qué se reutiliza tal cual

- Parser/calculadora/alertas F1 (única fuente de verdad).
- Compuertas de aprobación F6A (`canApprovePdfIntakeCandidate`), techo OCR
  F6C, comparación nativo↔OCR, estados y acciones de grupo F6E, puente de
  evidencia a F3/F4A.2.
- El flujo F6 completo queda como fallback cuando F7 no entiende (F7-S7).

## 4. Riesgos específicos de F7

| Riesgo | Mitigación |
|---|---|
| Heurísticas de región frágiles entre oficinas de diseño | Todo corregible por humano; fixtures sanitizados de los 3 PDFs reales como suite de regresión |
| Falsa sensación de "el sistema entiende" | Cada inferencia lleva razón visible + estado sugerido; bandeja "falta/contradice" siempre presente |
| Sobre-normalizar alias y fusionar elementos distintos | Normalización solo tipográfica; parecidos se avisan (regla F6E) |
| Rendimiento en el navegador (operator list + clustering en pliegos densos) | Procesar por página bajo demanda; medir con los PDFs reales antes de ampliar |
| Scope creep hacia medición geométrica | F7-S2 explícito; la escala sigue teniendo gate propio fuera de F7A–F7D |

## 5. Criterio de éxito (medible, con los mismos 3 PDFs)

1. VC-EJE-1 y variantes reales entran al registro de elementos.
2. "Falta ubicación" desaparece cuando el elemento está rotulado en la planta
   o posicionado en la grilla.
3. Una tabla de despiece produce candidatos por fila con CANT. asociada.
4. El usuario corrige texto por zona (recorte), no por página.
5. Métrica de valor: **tiempo hasta takeoff aprobado** menor que digitar a
   mano los mismos elementos (medido en la prueba de fricción de cada fase).
