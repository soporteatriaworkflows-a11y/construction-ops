# STEEL OPS — F6: Roadmap por sub-fases (PDF / Plan Intake)

**Fecha:** 2026-07-04 · **Owner:** Fable (Product Architect) · **Estado:**
docs-only. Cada sub-fase = rama + PR propio + QA completa + aprobación
humana antes de la siguiente (patrón blueprint V1 §16/§20).
**Padre:** `STEEL_OPS_F6_PDF_INTAKE_BLUEPRINT.md`.

Regla de dependencias: F6A→F6B son el núcleo (sin ellas no hay fase);
F6C–F6G son incrementos independientes que pueden reordenarse con evidencia
de uso, pero ninguna se salta la revisión humana ni los techos de confianza.

| Sub-fase | Contenido | Prerrequisitos | Gates específicos | Valor entregado |
|---|---|---|---|---|
| **F6A** — Upload mock + texto seleccionable + candidatos manuales | Subir PDF (memoria del navegador, metadatos en localStorage), inventario/clasificación de páginas (T1–T7 heurística corregible), extracción de capa de texto, resaltado de patrones F1, **selección manual asistida** → candidatos con evidencia (página + texto literal) | F1 (parser), F3 (workspace), este blueprint | licencia de la librería PDF aprobada ANTES de instalar (docs/LICENSING.md, nada AGPL); todo tras `STEEL_OPS_UIX_PREVIEW` | primer intake real: de PDF a candidatos sin digitar |
| **F6B** — Revisión humana + conversión a takeoff | Bandeja de candidatos, compare original↔interpretación, corrección (form F3 embebido), aprobar/descartar con razón, asignar elemento/ubicación, **conversión de aprobados a líneas F3** + registro de advertencias; motor de conversión puro + tests; primera versión operativa del modelo de confianza (`f6-cm-1`) | F6A | reglas F6-S1…S10 como tests de aceptación; sin totales en F6 (F6-S8) | ciclo completo PDF→candidato→revisión→takeoff→cálculo F1→CSV/Excel |
| **F6C** — Extracción de tablas | Heurística de tablas sobre texto posicionado (filas/columnas repetitivas), candidatos por fila, manejo de tablas partidas entre páginas (huecos marcados, nunca rellenados) | F6B; fixtures sanitizados de despieces reales | degradación elegante a F6A si la tabla no se reconoce; sin dependencia nueva salvo aprobación | menos clics en el caso más común (T1/T2) |
| **F6D** — OCR de escaneados | OCR opcional por página T4; TODO resultado nace con tope `baja` (F6-S9) y revisión campo a campo contra la imagen | F6B; **gate de licencia OCR aprobado** (evaluación costo/licencia/on-device vs servicio) | tope de confianza `baja` inquebrantable; confusiones típicas (1↔l, 0↔O, decimales) cubiertas por tests | los escaneos dejan de ser un muro |
| **F6E** — Zonas/BBox por página | Regiones detectadas con bbox navegable: resaltado de la zona exacta en el render de página, recortes de evidencia en el compare, vínculo llamado↔detalle (T6) como sugerencia confirmable | F6A (render de página); mejora F6B/F6C/F6D | bbox = evidencia, nunca fuente de medida | trazabilidad visual "de qué parte del plano salió esto" |
| **F6F** — Geometría/cotas con calibración de escala | Visor con calibración: usuario marca una cota conocida → factor de escala → **verificación obligatoria con segunda cota independiente** → medición de segmentos seleccionados por el usuario → candidato `media` con la calibración como evidencia | F6E | F6-S2 estricto: sin doble cota verificada no hay medición; calibración por página (no por archivo); registro de quién calibró | páginas T5 dejan de ser `no_interpretable` para longitudes |
| **F6G** — Asistencia multimodal avanzada | Modelo de visión como *sugeridor*: propone regiones, transcripciones y agrupaciones con evidencia bbox; jamás aprueba, jamás es fuente única de un número (tope `baja`, F6-S9); evaluación de costo por página y privacidad del plano antes de habilitar | F6E; decisión explícita de la usuaria (planos = datos sensibles del proyecto) | anti-alucinación R8: toda lectura de visión exige confirmación humana contra la imagen; opt-in por organización | ayuda en planos difíciles (T6/T7) sin ceder el control |

## Qué NO está en el roadmap F6 (para que nadie lo asuma)

- Persistencia DB/RLS de candidatos (contrato en blueprint §8; se
  materializa con el gate F2→DB, fuera de F6).
- Lectura CAD/DWG/BIM (explícitamente fuera de alcance, blueprint V1 §2).
- Cuantificación automática sin revisión, en cualquier forma.
- Integración con APU/BOQ/catálogo real (la salida de F6 es el takeoff
  manual F3; lo demás sigue el plan general de Steel Ops).

## Criterio de "sub-fase lista"

1. QA técnica del repo (typecheck/lint/suite/build/diff-check).
2. Reglas F6-S* aplicables cubiertas por tests.
3. Prueba de fricción por Fable QA/Workflow con un PDF real sanitizado del
   proyecto piloto (¿es más rápido que digitar? si no, no sale).
4. HANDOFF_LOG + DECISIONS actualizados.
5. Aprobación humana explícita para pasar a la siguiente.
