# STEEL OPS — Evaluación de extracción estructurada externa (F7.1)

**Fecha:** 2026-07-05 · **Owner:** Fable · **Estado:** evaluación + puente BYO-JSON implementado, SIN integración de APIs.
**Contexto:** F7 mejoró la comprensión local, pero la usuaria investigó herramientas
externas (Lift/Datalab y similares) que extraen JSON estructurado desde PDF/imagen
con un schema. Este documento evalúa opciones con fuentes públicas y define el
camino de prueba SIN casarse con ninguna herramienta ni meter costos a ciegas.

**Qué ya existe en código (esta fase):**
- `apps/web/lib/steel/structured-extraction-schema.ts` — schema propio
  `steel-ext-1` (JSON Schema draft-07) + bloque copiable con instrucciones.
- `apps/web/lib/steel/external-structured-extraction.ts` — validador/normalizador
  del JSON pegado + comparación contra la detección interna F7
  (coincide / solo externo / solo F7 / conflicto), método `external_json`,
  jamás auto-aprueba.
- UI: sección "Importar extracción estructurada JSON (experimental)" dentro de
  "Revisión técnica del plano", con botón "Copiar schema para herramienta externa".

---

## 1. Lift (Datalab)

- **Qué es:** modelo de visión de ~9B parámetros, open-weights, especializado en
  extraer JSON estructurado desde PDF/imagen pasándole un JSON Schema
  (decodificación restringida por schema ⇒ JSON siempre válido). Reporta 90.2 %
  de field accuracy en su benchmark, el más alto entre modelos self-hosteables
  probados. `pip install lift-pdf`.
- **Licencia:** código **Apache 2.0**; pesos bajo **OpenRAIL-M modificado**
  (gratis para investigación, uso personal y startups < USD 5M de
  funding/revenue; uso comercial mayor requiere licencia de Datalab).
  ⚠ Verificar en qué categoría cae la constructora antes de self-hostear en
  producción.
- **Local vs managed:** self-host con HuggingFace/PyTorch o vLLM+Docker
  (requiere GPU: T4/L4/RTX4090 hasta H100). API gestionada de Datalab con
  verificación por campo, citas y confianza; **USD 20/mes de créditos gratis**;
  playground público para probar sin instalar nada.
- **Costos reportados (API, doc oficial):** modo *fast* **USD 6 / 1.000 páginas**
  (con citas por campo); modo *balanced* **USD 25 / 1.000 páginas** (verificación
  independiente + razonamiento). Para 3 planos de prueba el costo es
  centavos — cubierto de sobra por los créditos gratis.
- **Riesgos:** (a) los planos salen del navegador hacia Datalab en modo API
  (privacidad: son datos sensibles del proyecto — existe `processing_location`
  para residencia de datos, y opciones de retención); (b) licencia de pesos si
  se self-hostea comercialmente; (c) dominio: sus benchmarks son documentos
  (facturas, papers), no planos CAD — la precisión en despieces/estribos está
  POR MEDIR; (d) dependencia de un proveedor pequeño.
- **¿Sirve para schema JSON?** Sí — es exactamente su diseño, y nuestro
  `steel-ext-1` es JSON Schema estándar compatible.
- **¿Conviene como piloto?** **Sí, como primer candidato del flujo BYO-JSON**:
  playground/créditos gratis + schema copiable + comparación en Steel Ops, sin
  integrar nada. Si la precisión con los 3 PDFs reales supera a F7 en elementos
  correctos, se evalúa la integración con gate propio.

## 2. Marker (Datalab)

- **Qué es:** conversor PDF → markdown/JSON/HTML por etapas (layout, OCR Surya,
  tablas), rápido y preciso para documentos.
- **Licencia:** código **GPL**; pesos bajo AI Pubs OpenRAIL-M modificado (gratis
  bajo umbral de revenue; hay rama/licencia comercial de pago).
  ⚠ **GPL es incompatible con nuestro producto propietario si se integra como
  librería** (regla LICENSING del proyecto). Solo sería viable como servicio
  separado o con licencia comercial.
- **Utilidad para Steel Ops:** layout/markdown/tablas de DOCUMENTOS. Para planos
  CAD el markdown lineal pierde justo lo que F7 recuperó (posición 2D, grillas).
  Podría servir para extraer CUADROS (tablas) de planos escaneados.
- **Veredicto:** **no priorizar**. La restricción GPL + dominio equivocado lo
  dejan detrás de Lift; si algún día se usa, sería vía API de Datalab (no
  embebido).

## 3. API multimodal directa (Claude / GPT / Gemini)

- **Ventajas:** sin infra propia; entienden contexto visual complejo (detalles,
  llamados, notas mezcladas); salida estructurada con nuestro schema (todos
  soportan JSON schema / tool use); iteración rápida de prompts.
- **Riesgos:** alucinación de cantidades (el riesgo #1 de este dominio — por eso
  el schema exige `evidenceText` literal y `unresolvedFields`); costo variable
  por tokens de imagen (planos grandes en alta resolución no son baratos a
  escala, aunque 3 planos de prueba cuestan centavos); privacidad (los planos
  salen al proveedor; revisar retención/opt-out de entrenamiento); requiere
  API key y proxy server-side (gate explícito ya registrado como Q-F7-VISION-1).
- **Veredicto:** candidato válido para el MISMO flujo BYO-JSON (pegar el schema
  en la UI de chat del proveedor y traer el JSON), sin API todavía.

## 4. Document AI (Google) / Azure Form Recognizer y similares

- **Qué son:** servicios de document understanding orientados a formularios,
  facturas, recibos y tablas de documentos de oficina.
- **Ventajas:** maduros, SLA, buena extracción de tablas de documentos.
- **Riesgos/limitaciones:** dominio equivocado — los procesadores preentrenados
  no entienden planos estructurales (ejes, despieces, llamados de acero);
  entrenar un procesador custom exige datasets etiquetados que no tenemos;
  costo por página + lock-in de nube.
- **Veredicto:** **descartados para planos CAD** (misma conclusión del análisis
  F7); solo reconsiderar si el problema fuera facturas/actas escaneadas.

## 5. Recomendación

1. **NO integrar ninguna API todavía.** Sin keys, sin costos recurrentes, sin
   subir planos automáticamente.
2. **Probar primero el puente BYO-JSON ya implementado** con los 3 PDFs reales:
   copiar el schema desde Steel Ops → correrlo en el playground de Lift y/o en
   un chat multimodal → pegar el JSON → comparar contra F7 en la misma pantalla.
3. **Medir con la checklist de la sección 6.** Si el externo gana con claridad
   (más elementos correctos, menos ruido, sin inventos), abrir la fase de
   integración con gate de privacidad/costo/key (Q-F7-VISION-1); si no, seguir
   invirtiendo en F7 local.
4. Candidato #1: **Lift API (modo fast)** por diseño schema-first, citas por
   campo, créditos gratis y costo bajo. Candidato #2: multimodal directo.
   Marker: no. Document AI/Azure: no.

## 6. Checklist de evaluación con criterios reales (H)

> Un resultado SIRVE solo si reduce trabajo humano frente a sacar cantidades a
> mano. Marcar cada criterio al probar (F7 solo, y F7 + JSON externo):

- [ ] Detecta los elementos correctos (VC/Z/P/C reales del plano, con alias).
- [ ] Separa rótulo/dirección/ingeniero de la información técnica.
- [ ] Muestra fuente y página de CADA dato (o dice "fuente no disponible").
- [ ] Identifica tablas/cuadros y sus filas con CANT.
- [ ] Identifica ejes/ubicación o explica por qué no puede.
- [ ] No inventa: campos faltantes quedan como faltantes/hallazgos.
- [ ] Permite corregir rápido (editar texto, aprobar/descartar, vincular).
- [ ] Exporta un Excel útil y presentable (identidad ICONIC).
- [ ] **Métrica de cierre:** tiempo hasta takeoff aprobado < tiempo de digitar
      a mano los mismos elementos.

## Fuentes

- https://github.com/datalab-to/lift (código Apache-2.0; pesos OpenRAIL-M mod.; self-host HF/vLLM; API con USD 20/mes de créditos)
- https://documentation.datalab.to/docs/recipes/structured-extraction/api-overview (fast USD 6/1K págs · balanced USD 25/1K págs; citas por campo; `processing_location`)
- https://github.com/datalab-to/marker (código GPL; pesos OpenRAIL-M mod.; rama commercial)
- https://huggingface.co/datalab-to/lift (pesos y ficha del modelo)
