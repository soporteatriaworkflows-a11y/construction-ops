# STEEL OPS — F7: Estrategia de visión y layout

**Fecha:** 2026-07-05 · **Owner:** Fable (Product Architect) · **Estado:** docs-only.
**Pregunta:** ¿necesitamos integración externa de visión para entender planos,
o basta pdfjs + tesseract + heurísticas?

## 0. Respuesta corta

**Primero layout local (F7A–F7D), visión externa después y opcional (F7E).**
La mayor parte del valor perdido hoy NO viene de falta de visión: viene de
descartar información que pdfjs/tesseract YA entregan (coordenadas, bbox,
vectores). Un modelo de visión sin capa de layout local sería caro, sensible
en privacidad y difícil de auditar; una capa de layout local sin visión ya
revierte los síntomas S2–S5 de los hallazgos. La visión multimodal queda como
**asistente opcional con gate de aprobación explícita** para lo que el layout
local no alcanza (escaneados difíciles, regiones ambiguas, tablas rotas).

## 1. Qué se puede lograr SOLO con pdfjs + tesseract (sin dependencias nuevas)

| Capacidad | Cómo | Confianza |
|---|---|---|
| Texto con posición, rotación y tamaño | pdfjs `getTextContent()` ya trae `transform` completo y `width/height`; hoy se tira | Alta |
| Regiones de página | Operator list (marcos, reglas, cajones) + clustering de texto posicionado + títulos por región | Media-alta en PDF vectorial de CAD |
| Ejes y grilla | Segmentos largos de borde a borde + burbujas con token corto en extremos | Media-alta en plantas vectoriales |
| Tablas con estructura | Reglas vectoriales + alineación de columnas del texto posicionado | Alta con bordes; media sin bordes |
| OCR por zona con recorte de evidencia | tesseract.js opción `rectangle` sobre el canvas ya renderizado + render a mayor escala SOLO de la zona | Alta mejora vs página completa a 144 dpi |
| Bbox de lo leído por OCR | tesseract ya devuelve bbox por línea/palabra; hoy se descartan | Alta |
| Vocabulario técnico OCR | `tessedit_char_whitelist`/patrones para zonas de despiece (dígitos, #, Ø, x, E, @) | Media (mejora #/Ø sin inventar) |

**Costo:** solo ingeniería propia. **Privacidad:** total (todo en navegador).
**API keys/storage/server:** ninguno. **Licencias:** pdfjs y tesseract.js ya
aprobadas (Apache-2.0, `docs/LICENSING.md`).

## 2. Qué NO se logra bien sin visión/modelo externo

- **Planos escaneados o fotografiados** (sin vectores ni capa de texto): el
  layout local pierde sus señales; tesseract solo, aunque sea por zonas,
  rinde regular en manuscritos/sellos/baja calidad.
- **Regiones ambiguas o dibujos no convencionales**: detalles sin marco,
  rotulados atípicos, plantas con simbología densa.
- **Lectura semántica de detalles gráficos** (un flejado dibujado sin texto,
  un gancho estándar implícito): eso es interpretación visual pura.
- **Tablas muy rotas** (celdas combinadas irregulares, texto girado dentro de
  celdas).
- **Emparejar llamado↔detalle cuando el vínculo es solo gráfico** (círculo de
  corte con flecha).

Estas son exactamente las zonas donde un modelo multimodal aporta, siempre
como *sugeridor* (regla F6-S9/F6G: tope de confianza `baja`, confirmación
humana contra la imagen, jamás fuente única de un número).

## 3. Comparación de opciones

### Opción 1 — Solo pdfjs + tesseract + heurísticas (statu quo mejorado)

| Criterio | Evaluación |
|---|---|
| Ventajas | Privacidad total; costo $0 por página; sin API key; sin storage; browser puro; auditable/testeable; base necesaria para TODO lo demás |
| Riesgos | Techo en escaneados y layouts atípicos; esfuerzo de ingeniería propio; heurísticas por afinar con planos reales |
| Precisión | Alta en PDF vectorial CAD (el caso dominante del piloto); regular en escaneados |
| Complejidad | Media (clustering/vectores), controlada por fases |
| Browser/servidor | 100 % navegador |
| PDF hoy / DWG-IFC mañana | PDF sí; DWG/IFC no (formato distinto, ver F7F) |

### Opción 2 — Modelo de visión multimodal (p. ej. Claude vision) por página/región

| Criterio | Evaluación |
|---|---|
| Ventajas | Comprensión semántica real (regiones, tablas rotas, relaciones gráficas, escaneados); poco código propio; mejora continua del modelo |
| Riesgos | **Alucinación** (mitigable solo con evidencia bbox + confirmación humana + tope `baja`); dependencia de proveedor; deriva de costos |
| Costo | Por página/región (imágenes grandes = tokens caros); pliegos densos pueden requerir teselado en varias llamadas |
| Privacidad | **Los planos salen del navegador** → requiere decisión explícita de la dueña (F6G ya lo condiciona a opt-in por organización) |
| Precisión | Alta en semántica; los NÚMEROS igual se verifican contra texto nativo/OCR local (F7-S1) |
| Complejidad | Baja en código, alta en gobierno (key, límites, auditoría) |
| Browser/servidor | Requiere **API key** ⇒ proxy server-side propio (una route interna); hoy el contrato dice "no subir a servidor" ⇒ **cambio de contrato que exige aprobación** |
| Storage | No necesario (imagen efímera en la llamada), pero el proveedor procesa el dato |
| PDF hoy / DWG mañana | Sirve para cualquier render (PDF, foto, captura de DWG) |

### Opción 3 — Servicios de layout documental (Google Document AI / Azure Document Intelligence)

| Criterio | Evaluación |
|---|---|
| Ventajas | Muy buenos en tablas/formularios/facturas; SDKs maduros |
| Riesgos | **Dominio equivocado**: están entrenados para documentos de oficina, no para planos CAD (ejes, grillas, despieces, simbología no significan nada para su modelo de layout); lock-in |
| Costo | Por página, comparable o mayor que Opción 2 para nuestro caso |
| Privacidad | Igual que Opción 2 (datos al proveedor) + configuración de residencia |
| Precisión | Alta en tablas "de documento"; baja/no probada en planos estructurales |
| Complejidad | Media; server obligatorio; API key |
| PDF/DWG | PDF sí; DWG no |

### Opción 4 — Pipeline híbrido (RECOMENDADA como dirección)

```text
pdfjs (vector + texto posicionado)      ← siempre, local
+ OCR tesseract por zona con bbox        ← siempre, local
+ layout/grid/table local (F7A–F7D)      ← siempre, local
+ modelo de visión SOLO para regiones    ← opcional, opt-in aprobado,
  difíciles o páginas escaneadas (F7E)     tope baja, evidencia bbox
+ revisión humana                        ← siempre
```

| Criterio | Evaluación |
|---|---|
| Ventajas | Lo local resuelve el caso dominante gratis y privado; la visión entra solo donde aporta y con gates; los números siempre se verifican local |
| Riesgos | Dos pipelines que mantener; hay que definir bien el "cuándo escalar a visión" |
| Costo | $0 base; costo por página solo en regiones escaladas |
| Privacidad | Controlada: por defecto nada sale; opt-in explícito por takeoff/región |
| Browser/servidor | Base browser; visión requiere proxy con key (decisión pendiente) |
| PDF/DWG | PDF hoy; el render-a-imagen prepara el camino para DWG vía export (F7F) |

## 4. Decisión propuesta y gates

1. **Ahora (sin aprobaciones nuevas):** Opción 1 como fundación = fases
   F7A–F7D. Sin dependencias nuevas, sin API, sin server.
2. **Después (requiere aprobación explícita de la dueña):** F7E = visión
   multimodal como sugeridor, con gate documentado:
   - decisión de privacidad (los planos salen del navegador hacia el
     proveedor aprobado);
   - presupuesto por página y límite mensual;
   - API key en entorno server (proxy interno mínimo), nunca en el cliente;
   - tope de confianza `baja` + confirmación humana contra la imagen
     (heredado de F6G/F6-S9);
   - registro en `docs/DECISIONS.md` antes de instalar/integrar nada.
3. **Opción 3 se descarta por ahora** (dominio equivocado para planos);
   se reevalúa solo si aparece un caso "tablas de documento" puro.

**Pregunta abierta registrada (OPEN_QUESTIONS):** ¿se aprueba en principio
que F7E use un modelo de visión externo bajo esos gates, o Steel Ops debe
permanecer 100 % local indefinidamente? La respuesta no bloquea F7A–F7D.

## 5. DWG/IFC mañana (resumen; detalle en F7F del roadmap)

- **DWG:** no leer nativo (formato cerrado/reverse-engineered, riesgo legal y
  técnico). Ruta realista: exigir/automatizar export a PDF vectorial (el CAD
  del proyectista lo hace) — todo el pipeline F7 aplica tal cual. Evaluar ODA
  u otros conversores solo con gate de licencia.
- **IFC:** es el único formato donde las cantidades vienen como DATOS
  (elementos con geometría y propiedades). Si el piloto BIM llega, IFC no
  pasa por OCR/visión: es un importador estructurado distinto (fase propia,
  fuera de F7).
