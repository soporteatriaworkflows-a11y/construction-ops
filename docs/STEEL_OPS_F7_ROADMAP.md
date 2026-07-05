# STEEL OPS — F7: Roadmap por sub-fases (Drawing Understanding)

**Fecha:** 2026-07-05 · **Owner:** Fable (Product Architect) · **Estado:** docs-only.
**Padre:** `STEEL_OPS_F7_DRAWING_UNDERSTANDING_BLUEPRINT.md` ·
**Estrategia visión/layout:** `STEEL_OPS_F7_VISION_AND_LAYOUT_STRATEGY.md` ·
**Hallazgos:** `STEEL_OPS_F7_REAL_PDF_TEST_FINDINGS.md`.

Patrón de gobierno idéntico a F6: cada sub-fase = rama + PR propio + QA
completa + prueba de fricción con los 3 PDFs reales sanitizados + aprobación
humana antes de la siguiente. Todo tras `STEEL_OPS_UIX_PREVIEW`. Sin DB, sin
Supabase, sin RLS, sin migraciones, sin storage, sin subida a servidor, sin
navegación global, sin APU/BOQ real, sin dependencias nuevas sin aprobación.

## Hotfix previo (F6C-HF1) — advertencias OCR útiles · PROPUESTO, NO IMPLEMENTADO

Pequeño y seguro; se puede hacer antes de F7A. **Pendiente de visto bueno.**

1. **Matar la advertencia genérica por página del `#`**: `hasLostHashSuspicion`
   deja de mostrarse como banner de página; se evalúa POR LÍNEA del texto OCR
   y solo cuando la línea tiene contexto de acero plausible (patrón cercano a
   despiece, p. ej. `\d+E?[:;+*=.]{1,2}\d{3,5}` o token de 5–6 dígitos junto a
   palabras de refuerzo), no ante cualquier número largo (cotas/abscisas).
2. **Advertencias específicas por candidato**: las sospechas (O/0, I/1, S/5,
   `#` perdido) se anexan al candidato afectado, deduplicadas, con el
   fragmento exacto señalado — no como texto repetido bajo la página.
3. **Corrección contextual guiada**: cuando una línea OCR "casi" es un patrón
   de acero (`545600`, `74E:+3200`), la UI muestra el fragmento resaltado y
   ofrece edición de ESA línea con las lecturas posibles como opciones a
   elegir por el humano (elige, no se autocompleta: reconstruir el `#`
   automáticamente sigue prohibido).
4. **Colapsar repetidas**: una misma advertencia N veces se muestra una vez
   con contador.

Alcance: `pdf-ocr.ts` (lógica pura + tests) y `manual-pdf-intake-section.tsx`
(presentación). Sin dependencias nuevas, sin tocar F1/F3/F4A.2.

## Sub-fases F7

| Sub-fase | Contenido | Prerrequisitos | Gates específicos | Valor entregado |
|---|---|---|---|---|
| **F7A — Page Region & Layout Model** | `PositionedText` (texto con bbox/rotación/tamaño, nativo y OCR; `buildPageLines` queda como vista derivada/fallback); regiones de página sugeridas (planta/despiece/detalle/tabla/notas/rotulado) desde vectores + clustering + títulos; OCR por ZONA (`rectangle` de tesseract, render a mayor escala solo de la zona) con recorte de evidencia junto al texto; UI de regiones corregibles | F6 completo; fixtures sanitizados de los 3 PDFs reales (posiciones sí, datos sensibles no) | Sin dependencias nuevas; F7-S1/S2/S5/S6/S7; el flujo F6 sigue operativo como fallback; presupuesto de rendimiento medido en los 3 PDFs | Corregir por zona y no por página; regiones como contexto; base espacial para todo F7 |
| **F7B — Axis/Grid Context** | Detección de ejes/grilla (segmentos largos + burbujas); `PageGrid`; nomenclatura ampliada de elementos (VC-EJE-1, VC 01, V.C.-1, PILOTE Ø60…) con registro de alias conservador; ubicación sugerida por posición en grilla como evidencia confirmable | F7A | F7-S2 (la grilla jamás mide); alias solo tipográficos (parecidos se avisan, no se fusionan — regla F6E); cada ubicación inferida trae razón + bbox | "Falta ubicación" deja de ser falso negativo; elementos reales entran al registro |
| **F7C — Table/Despiece Understanding** | `DetectedTable` (headers/filas/celdas con bbox); mapeo header→campo sugerido y corregible (ELEMENTO/SECCIÓN/CANT./LONG./Ø); candidato F6A por FILA con CANT. asociada y celda como evidencia; huecos marcados, tablas partidas señaladas, jamás cosidas | F7A (idealmente F7B) | Verificación ida-y-vuelta F1 por fila; degradación a F6A si la tabla no se reconoce; cero relleno de celdas ilegibles | El caso más denso en cantidades (cuadros) produce candidatos completos con evidencia |
| **F7D — Element Evidence Graph** | Grafo tipado elemento↔evidencia (ubicación/refuerzo/sección/estribos/cantidad/nota; contradice/confirmada_por); estados F6E recalculados sobre el grafo; ficha por elemento con recortes; bandejas entendido/falta/contradice; puente a F3/F4A.2 ampliando `observation` con la ruta de evidencia | F7A–F7C | F7-S3/S4 (toda relación con evidencia y razón; aprobación humana); conflictos jamás auto-resueltos; export Excel sin cambios de contrato | El sistema muestra "esto entiendo, esto falta, esto contradice" por elemento; menos revisión ciega |
| **F7E — Vision Model Assisted Reading** | Modelo multimodal como *sugeridor* para regiones difíciles/escaneadas: propone regiones, transcripciones y relaciones CON bbox; tope `baja`; números siempre re-verificados contra texto local; proxy server mínimo para la key | F7A–F7D; **aprobación explícita de la dueña** (privacidad + costo + proveedor) registrada en DECISIONS | Opt-in por takeoff/región; sin key en cliente; presupuesto por página y tope mensual; anti-alucinación R8 (confirmación humana contra imagen); sin storage | Escaneados y layouts atípicos dejan de ser muro, sin ceder control ni privacidad por defecto |
| **F7F — DWG/IFC Future Strategy** | Solo estrategia+spike: DWG vía export a PDF vectorial (pipeline F7 aplica tal cual; conversores solo con gate de licencia); IFC como importador ESTRUCTURADO propio (fuera de OCR/visión), evaluado si el piloto BIM llega | F7A–F7D estables | Nada de leer DWG nativo; cualquier conversor/librería pasa por LICENSING; decisión propia en DECISIONS | Camino claro a futuro sin hipotecar el pipeline actual |

## Qué NO está en F7 (para que nadie lo asuma)

- Medición por escala/geometría (calibración de cotas sigue siendo fase
  aparte con su gate F6-S2 estricto, la antigua "F6F").
- Cuantificación automática sin revisión, en cualquier forma.
- Persistencia DB/RLS de candidatos/grafo (contrato F2→DB, fuera de F7).
- Integración APU/BOQ/catálogo real.
- Lectura nativa de DWG/IFC (F7F es estrategia, no implementación).

## Criterio de "sub-fase lista" (hereda F6 y agrega métrica de valor)

1. QA técnica (typecheck/lint/suite/build/diff-check).
2. Reglas F7-S* aplicables cubiertas por tests (módulos puros en Node).
3. Prueba de fricción con los 3 PDFs reales: **tiempo hasta takeoff aprobado
   ≤ digitar a mano** los mismos elementos; si no mejora, la fase no sale.
4. HANDOFF_LOG + DECISIONS actualizados.
5. Aprobación humana explícita para pasar a la siguiente.

## Orden recomendado de arranque

1. Aprobar (o ajustar) el hotfix F6C-HF1 → implementarlo como PR pequeño.
2. F7A (fundación espacial; desbloquea todo lo demás).
3. F7B y F7C (pueden paralelizarse tras F7A; F7C gana con F7B).
4. F7D (integra y reemplaza la vista plana de F6E).
5. Decisión de visión (OPEN_QUESTIONS) → F7E solo si se aprueba.
6. F7F cuando el piloto lo pida.
