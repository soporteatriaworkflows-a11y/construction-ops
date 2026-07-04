# STEEL OPS — F6: PDF / Plan Intake — UX Contract

**Fecha:** 2026-07-04 · **Owner:** Fable (UIX) · **Estado:** CONTRATO UX
docs-only. Sin código. Las pantallas viven (cuando se implementen) detrás de
`STEEL_OPS_UIX_PREVIEW`, bajo `/steel/takeoffs/[id]/sources` (ruta ya
reservada en el blueprint V1 §8.3), **sin** entrada en navegación global,
sin `ACCESS_MODULES`, sin `NAV_ITEMS`.

**Documento padre:** `STEEL_OPS_F6_PDF_INTAKE_BLUEPRINT.md` (reglas
F6-S1…S10, taxonomía T1–T7). **Modelo de confianza:**
`STEEL_OPS_F6_EXTRACTION_CONFIDENCE_MODEL.md`.

Componentes compartidos a reutilizar: `OperationsHeader`, `FilterPills`,
`InlineCallout`, `EmptyState`, tablas del workspace, tokens DESIGN.md —
mismos de F3. Copy en español de obra, directo y honesto.

---

## 0. Principios UX de la fase

1. **La evidencia siempre visible.** Ninguna pantalla muestra una
   interpretación sin el original al alcance (lado a lado o a un clic).
2. **La confianza se ve, no se explica en tooltip.** Badge de color +
   etiqueta textual (`alta`/`media`/`baja`/`requiere revisión`/`no
   interpretable`) + frase de explicación del parser ("leí: 74 estribos №3,
   largo 2.00 m").
3. **El estado honesto es una pantalla de primera clase.** "No puedo leer
   esto automáticamente" tiene diseño propio con caminos de salida, no es
   un error genérico.
4. **Nada destructivo sin confirmación ni sin razón.** Descartar pide
   razón; convertir muestra resumen previo.
5. **El usuario nunca queda bloqueado.** Toda página, por ilegible que sea,
   ofrece "digitar manualmente con esta página como referencia".

---

## 1. Mapa de flujo y pantallas

```text
Workspace del takeoff (F3)
└── pestaña/tab "Fuentes (PDF)"                        [P1]
    ├── Subir PDF ─────────▶ clasificación por página  [P2]
    ├── Visor de páginas ──▶ texto detectado           [P3]
    │                       └─ selección manual ───────▶ nuevo candidato
    ├── Bandeja de candidatos                          [P4]
    │   ├── Comparar original vs interpretación        [P5]
    │   ├── Corregir línea                             [P6]
    │   ├── Aprobar / descartar (con razón)            [P7]
    │   └── Asignar elemento / ubicación               [P8]
    ├── Convertir aprobados a takeoff                  [P9]
    └── Registro de advertencias de la fuente          [P10]
```

---

## P1 — Subir PDF (intake de fuente)

- **Dónde:** sección "Fuentes" del workspace del takeoff manual (F3).
- **Contenido:** dropzone (PDF, límite de tamaño visible), lista de fuentes
  ya subidas (nombre, páginas, fecha, estado de intake, hash corto).
- **Copy obligatorio (InlineCallout, permanente):**
  > "Asistente de lectura: detecta candidatos de acero para tu revisión.
  > No genera cantidades definitivas ni aprueba nada por ti."
- **Estados:** vacío (guía: "sube el plano o despiece en PDF"), subiendo,
  clasificando, listo, fallo de lectura (mensaje claro + opción reintentar).
- **Preview F6A:** el binario vive en memoria del navegador; al recargar,
  la fuente muestra "archivo no retenido — vuelve a subirlo para ver
  páginas" pero los candidatos ya creados (texto + página) sobreviven en
  localStorage.

## P2 — Clasificación por página

- Tras subir: grilla de páginas (miniatura si es viable; si no, tarjeta
  numerada) con badge de clase por página:
  `Tabla detectada (T1)` · `Cuadro parcial (T2)` · `Solo texto (T3)` ·
  `Escaneado (T4)` · `Geometría/cotas (T5)` · `Detalles/llamados (T6)` ·
  `Ambiguo (T7)`.
- Cada badge es **corregible** (select) — la corrección queda registrada.
- Páginas T4/T5 muestran de una vez su estado honesto:
  > "Escaneado: hoy no puedo leerlo automáticamente. Puedes digitarlo
  > manualmente usando la página como referencia." (T4)
  > "Plano con cotas: no hay tabla que leer. Requiere selección manual o
  > calibración de escala (próximamente)." (T5)

## P3 — Ver página + texto detectado

- **Layout:** dos paneles. Izquierda: render de la página (o placeholder
  con número de página si no hay render). Derecha: texto extraído de esa
  página, con los **matches del parser F1 resaltados** (chips sobre el
  texto: `5#5600`, `74E#3200`…).
- **Selección manual asistida (siempre disponible):** el usuario selecciona
  texto del panel derecho (o pega texto en un campo "Interpretar
  selección") → preview en vivo del parser F1 (mismo componente de F3:
  interpretación + confianza + explicación) → botón "Crear candidato desde
  selección".
- Cada match resaltado tiene acción "Crear candidato" individual y
  "Crear todos los de esta página" (crea candidatos, NO los aprueba).
- Si la página no tiene texto: panel derecho = estado honesto de P2 con los
  caminos de salida (digitar manual / esperar OCR-fase futura).

## P4 — Bandeja de candidatos

- **Tabla virtualizable** (patrón F3) con columnas: evidencia (texto
  original truncado), interpretación corta ("74 estribos №3 × 2.00 m"),
  confianza (badge), página, elemento sugerido, estado
  (`detectado`/`en revisión`/`corregido`/`aprobado`/`descartado`/
  `convertido`), acciones.
- **FilterPills:** por confianza, estado, página, tipo de candidato
  (línea / elemento / nota de especificación / vínculo sugerido).
- **Acciones en lote:** SOLO para candidatos `alta` sin alertas F1:
  "aprobar seleccionados" (con modal resumen). `media` o inferior: el botón
  de lote aparece deshabilitado con el motivo ("requiere revisión
  individual") — regla F6-S6.
- **Contadores de cabecera:** detectados / aprobados / descartados /
  pendientes; NUNCA totales de kg/ml (regla F6-S8).

## P5 — Comparar original vs interpretación

- **Vista por candidato (drawer o página):** tres franjas:
  1. **Original:** texto literal + referencia "archivo · página N · zona"
     (cuando exista bbox, recorte/resaltado de la zona).
  2. **Interpretación:** campos estructurados propuestos (cantidad, №,
     longitud, separación, dobleces) + explicación del parser + asunciones
     explícitas ("asumí 600 cm y no 60 cm por notación compacta").
  3. **Veredicto:** confianza + alertas F1 aplicables + botones Corregir /
     Aprobar / Descartar / Asignar.
- Navegación anterior/siguiente para revisar en secuencia sin volver a la
  bandeja.

## P6 — Corregir línea

- Formulario = **el mismo form de línea de F3** (`manual-line-form`)
  precargado con la interpretación, con preview en vivo del parser al
  editar. El usuario corrige el TEXTO canónico (y opcionalmente
  % desperdicio / varilla manual), no campos derivados.
- Al guardar: candidato pasa a `corregido`; se conserva el par
  detectado→corregido (F6-S5) y se muestra un diff compacto ("longitud:
  6.00 m → 0.60 m").
- La corrección NUNCA edita `original_text`: la evidencia es inmutable.

## P7 — Aprobar / descartar

- **Aprobar:** confirma la interpretación vigente (detectada o corregida).
  Registra actor+fecha. Si el parser F1 aún marca `needs_review` sobre el
  texto aprobado, la aprobación exige un check adicional "revisé la
  advertencia" (las alertas F1 no se silencian, viajan al takeoff).
- **Descartar:** modal con razón obligatoria (select + texto libre):
  `falso positivo` · `duplicado` · `plano desactualizado` · `ilegible` ·
  `otro`. El candidato queda `descartado`, visible bajo filtro, nunca
  borrado (F6-S7).
- Deshacer: aprobar/descartar son reversibles mientras el candidato no esté
  `convertido`.

## P8 — Asignar elemento / ubicación

- Por candidato o en lote: asignar **elemento** (texto libre con
  sugerencias de los encabezados detectados: "VIGA VC-01", "COLUMNA C-3") y
  **ubicación** (piso/zona — texto libre en preview; scopes reales cuando
  haya DB).
- Las sugerencias de agrupación automática (§4.7 del blueprint) aparecen
  como chips "sugerido" claramente distintos de lo confirmado.

## P9 — Convertir a takeoff

- Botón "Convertir aprobados al takeoff" con **modal resumen previo**:
  N candidatos, desglose por confianza, advertencias F1 pendientes, y el
  texto: "las cantidades se calcularán con el motor de takeoff (F1) y
  quedarán como líneas editables del takeoff manual — son estimación de
  takeoff, no cantidad contractual".
- Al convertir: cada candidato aprobado crea una línea F3 (INPUT:
  descripción canónica + % desperdicio + varilla manual opcional +
  metadatos de origen archivo/página/candidato). Candidato pasa a
  `convertido` (terminal) con link a la línea creada.
- Las líneas convertidas se distinguen en la tabla F3 con un indicador de
  origen ("PDF · pág. 3") clicable de vuelta a la evidencia.
- Solo `aprobado` es convertible. `requiere_revision`/`baja` sin corregir y
  `no_interpretable` nunca aparecen en el resumen de conversión.

## P10 — Registro de advertencias

- Panel por fuente: todo lo que el sistema quiere que quede dicho:
  - páginas no interpretables y por qué;
  - asunciones tomadas en candidatos `media` aún no revisados;
  - candidatos descartados con su razón;
  - avisos de fuente ("nombre de archivo sugiere revisión antigua: 'REV A'");
  - conversiones realizadas (cuándo, cuántas líneas, por quién).
- Este registro acompaña al takeoff: si F4A exporta advertencias, estas
  entran en la hoja de alertas como sección "Origen PDF".

---

## Estados vacíos y de error (deliberados)

| Situación | Copy base |
|---|---|
| Takeoff sin fuentes | "Aún no has subido planos ni despieces. Sube un PDF o crea líneas manualmente." |
| Fuente sin candidatos detectables | "No encontré despieces reconocibles en el texto de este PDF. Puedes seleccionar texto manualmente o digitar las líneas con las páginas como referencia." |
| Página escaneada (T4) | "Esta página es una imagen escaneada. La lectura automática de escaneados llegará en una fase futura; mientras tanto puedes digitarla manualmente." |
| Página de geometría (T5) | "No hay información suficiente para cantidad automática: esta página trae cotas y geometría, no tablas. Se requiere selección/calibración/revisión manual." |
| PDF corrupto/protegido | "No pude abrir este PDF (dañado o protegido). No se creó ninguna fuente." |
| Todo descartado | "Descartaste todos los candidatos de esta fuente. El registro queda guardado como evidencia." |

## Accesibilidad y detalle visual

- Badges de confianza con color + texto (nunca solo color).
- Toda acción de lote anuncia el resultado ("12 candidatos aprobados").
- Tablas con soporte teclado (patrón workspace existente).
- Modo claro/oscuro por tokens DESIGN.md, como el resto de `/steel`.

## Fuera de contrato (explícito)

Sin OCR real, sin render con librerías nuevas no aprobadas, sin
persistencia servidor, sin roles nuevos, sin navegación global, sin tocar
las pantallas F3 existentes más allá de añadir la sección "Fuentes" a su
workspace y el indicador de origen en la tabla de líneas.
