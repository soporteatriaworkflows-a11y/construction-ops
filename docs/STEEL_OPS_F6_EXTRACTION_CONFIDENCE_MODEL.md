# STEEL OPS — F6: Modelo de confianza de extracción

**Fecha:** 2026-07-04 · **Owner:** Fable (Product Architect) · **Estado:**
CONTRATO docs-only, versionable (`confidence_model_version: f6-cm-1`).
**Documento padre:** `STEEL_OPS_F6_PDF_INTAKE_BLUEPRINT.md`.

Este modelo gobierna cómo un candidato de extracción recibe su nivel de
confianza, qué puede y no puede hacerse en cada nivel, y cómo convive con
el `confidence` numérico del parser F1 y con las alertas F1.

---

## 1. Los cinco niveles

| Nivel | Etiqueta UI | Semántica | Aprobación en lote | Conversión a takeoff |
|---|---|---|---|---|
| `alta` | Alta confianza | texto nativo, patrón inequívoco, magnitudes plausibles, sin asunciones | ✅ permitida (con modal resumen) | tras aprobar |
| `media` | Media confianza | interpretable con ≥1 asunción explícita (unidad, notación compacta, contexto de columna) | ❌ individual, con la asunción mostrada | tras aprobar |
| `baja` | Baja confianza | patrón parcial, texto degradado, o cualquier dato originado en OCR/visión | ❌ campo a campo | solo tras corregir/confirmar cada campo |
| `requiere_revision` | Requiere revisión | contradicción interna o dato crítico faltante (cantidad sin longitud, `@` sin luz, kg/ml implausible para el №) | ❌ | bloqueada hasta completar/corregir |
| `no_interpretable` | No interpretable | sin base textual ni calibración suficiente (geometría sin escala, escaneo sin OCR, símbolos sin diccionario) | ❌ | **nunca**; salida: descartar o digitar manualmente con vínculo a la evidencia |

Reglas transversales:

- **Ningún nivel exime la aprobación humana** (F6-S3). El nivel gradúa la
  fricción, no la necesidad.
- El nivel puede **bajar** por revisión humana o nueva evidencia; solo
  puede **subir** mediante corrección/confirmación humana (nunca por
  re-cálculo automático).
- Un candidato `no_interpretable` existe a propósito: documenta que el
  sistema VIO algo que no puede leer (evidencia + estado honesto), en vez
  de callar.

## 2. Cómo se calcula (factores, no caja negra)

El nivel se deriva de factores explícitos, guardados por candidato
(`confidence_factors`) para poder re-explicar cualquier decisión:

| Factor | Valores | Efecto |
|---|---|---|
| **Origen del texto** | capa nativa · selección/pegado humano · OCR · visión | nativa/humano: sin tope · OCR/visión: tope `baja` (F6-S9) |
| **Confianza del parser F1** | 0–1 + `needs_review` | es la base numérica; `needs_review` ⇒ máx `media` |
| **Asunciones del parser** | ninguna · notación compacta (¿600 o 60 cm?) · unidad asumida · contexto de columna | ≥1 asunción ⇒ máx `media` |
| **Completitud** | campos críticos presentes (cantidad, №/referencia, longitud) | falta un crítico ⇒ `requiere_revision` |
| **Plausibilidad física** | longitud vs longitudes comerciales; № válido (2–18); separación razonable | implausible ⇒ `requiere_revision` (nunca "corrección automática") |
| **Consistencia interna** | ¿la fila suma? ¿repeticiones × grupos coincide? (espejo alertas A1/A2) | contradicción ⇒ `requiere_revision` |
| **Estructura de la región** | fila de tabla detectada · texto suelto · fragmento | tabla ⇒ +; fragmento ⇒ máx `media` |
| **Clase de página (T1–T7)** | ver taxonomía | T4/T5 sin texto/calibración ⇒ `no_interpretable` |

Mapeo por regla (evaluación en orden, primera que aplique):

```text
1. sin base textual ni calibración          → no_interpretable
2. falta campo crítico / implausible /
   contradicción interna                    → requiere_revision
3. origen OCR o visión                      → baja (tope duro)
4. parser needs_review o ≥1 asunción
   o región fragmentaria                    → media (tope)
5. resto (nativo + completo + plausible +
   sin asunciones + score F1 ≥ umbral alto) → alta
```

Los umbrales numéricos concretos (p. ej. "score F1 ≥ 0.9 para `alta`") se
fijan en la implementación F6B con la tabla de casos reales de F1 como
fixture, y quedan versionados junto al modelo.

## 3. Convivencia con F1 (quién manda)

- El parser F1 ya emite `confidence`, explicación y `needs_review` por
  descripción. **F6 no lo reemplaza: lo envuelve.** El nivel F6 agrega los
  factores que F1 no puede ver (origen del texto, estructura de página,
  completitud de la región).
- Tras la conversión, en el takeoff mandan **las alertas F1** (A4, A17,
  etc.). La confianza F6 viaja como metadato de procedencia, pero jamás
  silencia ni rebaja una alerta F1 (se suman, nunca se restan).
- Si el humano corrige el texto, F1 re-parsea el texto corregido y sus
  alertas se recalculan — el nivel F6 histórico queda en la evidencia, no
  contamina el cálculo.

## 4. Reglas de presentación (contrato con el UX)

- Badge = color + etiqueta textual (nunca solo color).
- `media` muestra SIEMPRE la asunción en una frase ("asumí 600 cm por
  notación compacta; verifica contra el plano").
- `baja` y `requiere_revision` muestran el factor bloqueante concreto.
- `no_interpretable` muestra el mensaje canónico del blueprint §6 y los
  caminos de salida (selección manual / calibración futura / digitación).
- Los contadores por nivel aparecen en la bandeja de candidatos; jamás se
  agregan a totales de kg/ml (F6-S8).

## 5. Anti-patrones prohibidos

- Promediar niveles de varios candidatos para dar una "confianza del
  documento" que invite a aprobar en bloque.
- Subir el nivel porque "el usuario ya aprobó 50 similares" (el
  aprendizaje por organización ajusta el PARSER con ejemplos aprobados,
  nunca infla la confianza de lo no revisado).
- Ocultar candidatos `no_interpretable` para que el resumen "se vea mejor".
- Redondear/corregir silenciosamente un valor implausible: la
  implausibilidad se reporta, no se arregla.

## 6. Evolución del modelo

- Toda modificación de factores/umbrales incrementa
  `confidence_model_version` y se registra en `DECISIONS.md`.
- Los candidatos guardan la versión con la que fueron evaluados; no se
  re-etiquetan retroactivamente candidatos ya revisados (espejo de la regla
  de snapshots).
- Métricas a observar desde F6B (telemetría local/preview): % de `alta`
  aprobadas sin edición (precisión percibida), % de `media` cuya asunción
  resultó correcta, % de descartes por falso positivo — insumo para ajustar
  umbrales con evidencia y no por sensación.
