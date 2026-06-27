# DESIGN.md — Sistema visual / UIX de ICONIC OPS

> Fuente de verdad visual del producto. Las oleadas UIX (V3+) deben anclarse a este
> documento, no a intuición ni a cambios aislados. Complementa a `CLAUDE.md`,
> `docs/PROJECT_MASTER.md` y `AGENTS.md`; ante conflicto de gobierno prevalecen esos.
>
> **Estado:** fundación V1 (creado tras UIX V1 = InlineCallout y V2 = FilterPills).
> **Regla de oro:** premium ≠ menos información. Nunca sacrificar control técnico ni
> datos reales por estética.

---

## 0. Fuentes usadas

No se recibieron links de referencia externos (placeholder sin completar) y este
entorno no abre URLs. El documento se basa en hechos del repositorio:

- Tokens: `apps/web/tailwind.config.ts` + `apps/web/app/globals.css`.
- Componentes existentes: `components/ui/*` (badge, button, card, input, label, select,
  skeleton) y `components/shared/*` (page-header, empty-state, status-badge,
  inline-callout, filter-pills, app-topbar, sidebar-nav, contextual-nav, breadcrumbs,
  account-menu, command-palette, workspace-brand, boq-grid).
- Módulos reales de ICONIC OPS y necesidades reportadas por la usuaria (claridad,
  guía accionable, "no sé qué hacer / qué significa pendiente", ventana asistente).

Las referencias externas, si se agregan luego, se usan **solo** como inspiración de
calidad/jerarquía/spacing — nunca para copiar literalmente.

---

## 1. Principios visuales

1. **Premium operativo.** Limpio y elegante, pero al servicio de la operación diaria
   de presupuestación, no decorativo.
2. **Claro antes que bonito.** Si una mejora estética reduce la comprensión o el
   control, no se hace.
3. **Técnico sin verse pesado.** Tablas densas y datos completos, pero con jerarquía,
   spacing y agrupación que evitan la sensación de "muro de datos".
4. **Acompañamiento sin saturar.** El asistente y los callouts guían; nunca tapan el
   trabajo ni interrumpen el flujo.
5. **Datos reales primero.** Lo que el sistema no puede confirmar se rotula honesto
   ("No verificable", "en evolución") — nunca se inventa un número o estado.
6. **Consistencia > novedad.** Un patrón se define una vez (componente compartido) y se
   reutiliza; no se reinventa por módulo.

---

## 2. Identidad visual

### Paleta (tokens reales — usar SIEMPRE estos, no hex sueltos)

| Token | Hex | Uso |
|---|---|---|
| `iconic-primary` / `brand-500` | `#005DD6` | Acción primaria, links, activos, acentos. |
| `iconic-ink` / `brand-900` | `#020148` | Azul noche: sidebar, hero oscuro, texto fuerte. |
| `iconic-cyan` | `#00B8FF` | Acento/realce puntual (estado vivo, glow). Uso escaso. |
| `iconic-graphite` | `#1B1F3E` | Texto de cuerpo principal. |
| `iconic-soft-blue` / `brand-100` | `#C7DCED` | Bordes suaves, contornos de paneles premium. |
| `iconic-gray` | `#F2F4F7` | Fondo de app / superficies neutras. |
| `iconic-white` | `#FFFFFF` | Superficies de cards/tablas. |
| `brand-50` | `#E8F1FD` | Fondos suaves de realce (callouts tip, filas activas). |

- Tipografía: **Inter** (sans) + **JetBrains Mono** (códigos/IDs/cifras técnicas).
- Radio por defecto `0.375rem`; cards premium `rounded-xl`/`rounded-2xl`.
- Elevación: `shadow-iconic` (sutil) para superficies premium del shell.

### Colores de estado (semánticos, vía `Badge`/`InlineCallout`)

| Significado | Color base | Variante Badge |
|---|---|---|
| Listo / aprobado / éxito | verde | `success` |
| Revisar / advertencia / pendiente | ámbar | `warning` |
| Bloqueado / crítico / error | rojo | `destructive` |
| Neutro / borrador / archivado | gris | `secondary` / `outline` |
| Info / vínculo | azul ICONIC | `default` |

### Qué NO usar

- ❌ Morado/violeta (se eliminó del producto; no reintroducir).
- ❌ Paletas placeholder (Tailwind crudo `blue-600`, `indigo`, etc.) cuando exista token ICONIC.
- ❌ Gradientes/efectos de otras plataformas. El único hero oscuro es navy ICONIC.
- ❌ Verde/rojo "puros" arbitrarios para decorar; el color porta significado.

---

## 3. Layout (shell)

- **Shell:** `app/(dashboard)/layout.tsx` = sidebar fija (w-60) + columna `flex-1`
  (topbar + contextual-nav + `<main>` con `max-w-screen-2xl px-6 py-6`). El companion
  se monta una vez aquí (persistente).
- **Sidebar:** navy ICONIC con profundidad; NavLink pill activo; footer con workspace +
  chip de modo de datos. No tapar su footer ("Datos reales").
- **Topbar:** sticky, `bg-white/80 backdrop-blur`, breadcrumbs + ⌘K + botón Asistente +
  cuenta. `z-20`.
- **Contenido central:** ancho `max-w-screen-2xl`, padding 6, secciones con `space-y`.
- **Companion:** ventana flotante (default) / esquina / lateral; `z-30` (debajo de
  modales `z-50`/`z-[100]`); reserva padding del body solo en modo lateral y en `lg`.
- **Desktop-first:** los módulos densos asumen `lg+`. El companion se oculta `< lg`.
- **Densidad recomendada:** contenido cómodo (px-6/py-6); tablas compactas pero legibles
  (filas ~`py-2`/`py-2.5`, texto `text-sm`, cifras `tabular-nums`).
- **z-index (canónico):** contenido < topbar `z-20` < companion `z-30`/launcher `z-40`
  < modales `z-50` < modal crítico (Vincular a BOQ) `z-[100]`.

---

## 4. Headers de página (`PageHeader`)

Patrón único `components/shared/page-header.tsx`:
- **Título** (`title`, obligatorio) + **descripción** (`description`, recomendada: contexto
  o subtítulo, p. ej. "Proyecto / Alcance").
- **Acción principal** y **secundaria** en `actions` (Button primario + outline).
- **Breadcrumb** (`breadcrumb`) para volver al nivel padre (flecha + texto).
- El **estado** del recurso (badge de versión/proyecto) va junto al header o en una fila
  de contexto debajo, no dentro del título.
- Regla: toda página principal tiene título **y** descripción; sin descripción solo
  estados de carga/empty intermedios.

---

## 5. Cards y paneles

- **MetricCard / SummaryCard:** cifra grande + label pequeño; acento por token
  (`primary`/`ink`) solo en la métrica clave (p. ej. Total general). Grid responsive
  (`grid-cols-2 sm:grid-cols-4 xl:grid-cols-7` según nº). No meter acciones complejas.
- **SectionPanel:** `rounded-xl border border-iconic-soft-blue/50 bg-white shadow-sm`
  con encabezado (icono + h2). Para agrupar formularios/bloques (p. ej. "Invitar usuario").
- **Cards de resumen** (dashboard, semáforo): lectura rápida; no reemplazan la tabla.
- **Cards operativas** (tarjetas APU): acción + estado por tarjeta; conviven con el
  workspace técnico (tabla).
- **Card vs Tabla:** **card** para resumen/lectura/selección de pocas dimensiones;
  **tabla** cuando hay muchas filas comparables y columnas técnicas. **Nunca** convertir
  una tabla técnica (BOQ/catálogo) en cards si reduce comparabilidad o control.

---

## 6. Tablas operativas (BOQ, catálogo, cantidades, cronograma)

Reglas (no negociables):
- **No eliminar información técnica.** Mantener el **modo completo**; los filtros/colapsos
  son visibilidad, no borrado.
- **Jerarquía de columnas:** identificador (`font-mono`) y descripción a la izquierda;
  cifras a la derecha (`tabular-nums`); estado/acción al final. Encabezados
  `text-xs uppercase tracking-wide text-gray-500`.
- **Sticky header / toolbar** cuando la tabla es larga (`sticky top-14`).
- **Filas expandibles** para detalle secundario (trazabilidad, desglose) en vez de saturar
  columnas.
- **Acciones por fila** consistentes (link/acción contextual al final).
- **Estados visibles** por fila vía badge textual (no solo color).
- **Densidad cómoda pero completa:** `py-1.5`/`py-2.5`, `text-sm`, hover sutil
  (`hover:bg-brand-50/40`), filas archivadas atenuadas.
- Agrupación por capítulo/tipo con encabezado de grupo colapsable.

---

## 7. Filtros y toolbars

- **`FilterPills`** (segmented control compartido): para dimensiones de **pocas opciones
  fijas y mutuamente excluyentes** (Estado, Con/Sin APU, Estado de precio). Con etiqueta
  corta en mayúsculas; tono `ink` (estado) o `primary` (acento). `role="group"` + `aria-pressed`.
- **`<select>`:** para dimensiones de **muchas opciones** (Tipo, Proveedor) o listas largas.
- **Búsqueda:** input con icono `Search` a la izquierda; busca código/descripción.
- **Filtros avanzados:** agrupar en una toolbar (`rounded-lg border bg-white p-3`), con
  un contador de resultados (`X de Y`) y "Limpiar filtros".
- **Orden recomendado de la toolbar:** Búsqueda → segmented (Estado/APU) → selects
  (Tipo/Proveedor) → utilidades (expandir/colapsar) → resumen/total a la derecha.
- Cuándo segmented: ≤ ~5 opciones; si crece, pasar a select.

---

## 8. Badges y estados (texto + color, nunca solo color)

| Estado | Label | Color |
|---|---|---|
| Listo | "Listo" | verde |
| Revisar | "Revisar" / "Requiere revisión" | ámbar |
| Pendiente | "Pendiente" (+ razón corta: "faltan cantidades") | gris/ámbar |
| Bloqueado | "Bloqueado" / "Incompleto" | rojo |
| Sin APU | "Sin APU" | ámbar |
| APU vinculado | "APU vinculado" | verde |
| No verificable | "No verificable" | gris (honesto: sin dato) |
| Aprobado | "Aprobado" | verde |
| Pendiente (precio) | "Pendiente" | ámbar |
| Manual | "Manual" | azul/gris |
| Sin proveedor | "—" / "Sin proveedor" | gris |

- Implementar vía `Badge` (variantes) o chips inline con clases de token.
- Acompañar el badge con razón corta cuando exista dato (ver companion/quote-progress).

---

## 9. Empty states y callouts

- **`EmptyState`** (`components/shared/empty-state.tsx`): icono + título + descripción +
  CTA opcional. Para "sin datos todavía".
- **`InlineCallout`** (`components/shared/inline-callout.tsx`): ayuda/aviso contextual.
  Tonos: `tip` (brand-50, guía), `info` (gris, contexto), `warning` (ámbar, atención),
  `success` (verde). `role="note"`.
- **Advertencias honestas:** cuando el sistema no puede validar algo, decirlo
  ("en evolución", "No verificable", "abre la pantalla para confirmar"). Nunca prometer
  capacidades que no existen (p. ej. cronograma production-grade).
- No duplicar: un callout por contexto; no apilar ayudas redundantes.

---

## 10. Acciones

- **Primaria:** `Button` (default, azul ICONIC). Una por vista/sección.
- **Secundaria:** `Button variant="outline"`.
- **Terciaria/navegación:** `variant="ghost"` o link.
- **Destructiva:** `variant="destructive"`; siempre con confirmación; nunca por defecto.
- **Técnicas** (editar componentes, asociar APU, sincronizar): outline/contextual,
  cerca del dato que afectan.
- **Export:** agrupadas en su bloque por rol; no mezclar con acciones de edición.
- CTA del asistente: explícito y orientado a resultado ("Ver ítems sin APU"), con
  subtítulo "Te llevamos a la pantalla donde puedes resolver este paso".

---

## 11. Módulo por módulo

Para cada uno: **objetivo visual · problema actual · patrón recomendado · qué NO cambiar · futuro.**

### Dashboard
- Objetivo: centro de control claro (estado del proyecto, KPIs, accesos).
- Problema: ya rediseñado (command-center); riesgo de saturación de tiles.
- Patrón: hero navy + MetricCards + zonas + QuickLinks; gráficos paleta ICONIC.
- NO cambiar: cálculos/KPIs (read-model), privacidad por rol (campos 🔒).
- Futuro: micrográficos por módulo, alertas accionables.

### Presupuestos / BOQ / Workspace  *(V3 — prioridad)*
- Objetivo: entender qué presupuesto veo, qué falta y qué sigue, sin perder control técnico.
- Problema: tabla densa; jerarquía capítulo/ítem/acción mejorable; resumen superior poco escaneable.
- Patrón: header con contexto + MetricCards de resumen + toolbar (búsqueda + FilterPills
  Estado/APU + utilidades) + tabla agrupada por capítulo con badges por fila + callout "Sin APU".
- NO cambiar: columnas técnicas, subtotales server-derived, `unit_price_snapshot`, AddApuPanel,
  filtro Sin APU, edición rápida.
- Futuro: filas expandibles (trazabilidad), densidad afinada, sticky toolbar pulido.

### Biblioteca APU
- Objetivo: encontrar y reutilizar actividades; ver completitud.
- Problema: tarjetas vs workspace técnico deben coexistir con jerarquía clara.
- Patrón: tarjetas (completitud + acciones) y workspace tabla; chips de capacidades.
- NO cambiar: completitud (helpers puros), Vincular a BOQ (modal/RPC), export anexo.
- Futuro: agrupación por categoría, badges de origen.

### Catálogo / Precios  *(V4)*
- Objetivo: ver qué recursos tienen precio, cuáles pendientes/manuales/sin proveedor.
- Problema: ya estructurado (tabla por tipo + badges); toolbar puede pulirse.
- Patrón: toolbar (búsqueda + FilterPills estado de precio + selects tipo/proveedor) +
  tabla por tipo con badge de estado + acción contextual; revisión de precios con resumen.
- NO cambiar: estados de precio (read-model), privacidad de descuentos, baseline de aprobación.
- Futuro: resumen de cobertura de precios, Price Intelligence más visual.

### Cantidades  *(V5)*
- Objetivo: entender qué se importó, qué falta revisar, qué se sincronizó al BOQ.
- Problema: estados de import/sync poco evidentes.
- Patrón: callout de flujo (importa→revisa→sincroniza) + grupos con total + estados claros.
- NO cambiar: cálculo de cantidades, sync a BOQ, idempotencia del importador.
- Futuro: badges de estado por grupo (importado/sincronizado/conflicto), progreso.

### Cronograma  *(V6)*
- Objetivo: planeación de obra usable, con expectativas honestas.
- Problema: madurez parcial; no prometer production-grade.
- Patrón: header + resumen duración/avance + tabla de tareas + hitos + nota "en evolución"
  + links a presupuesto/BOQ.
- NO cambiar: motor de cronograma, ruta crítica/holguras (🔒), generación desde BOQ.
- Futuro: Gantt pulido, filtros, edición inline cauta.

### Settings / Accesos  *(V7)*
- Objetivo: gestionar usuarios/roles/invitaciones con claridad cuando SMTP no entrega.
- Problema: dependencia de correo; el enlace manual debe ser obvio.
- Patrón: SectionPanel "Invitar" + callout "copia el enlace si no llega el correo" + tablas
  de miembros/invitaciones con estado.
- NO cambiar: RLS, roles, flujo de invitación/aceptación, SMTP.
- Futuro: estados de entrega del correo, reenvío.

### Cotización asistida / Companion
- Objetivo: acompañar in-place sin tapar; guía accionable, no solo progreso.
- Problema: ya resuelto en gran parte (flotante, guía "Qué sigue", Estás aquí).
- Patrón: ventana flotante/esquina/lateral; "Estás aquí" + paso actual + "Qué sigue"
  (qué significa/por qué/qué hacer/CTA/resultado) + mini-stepper + accesos rápidos.
- NO cambiar: read-only (sin mutación), no recalcular finanzas, deep-links existentes,
  no romper el filtro Sin APU del workspace.
- Futuro: ⌘K toggle, panel rico en APU/cantidades/precios.

---

## 12. Reglas anti-regresión (bloqueantes para toda oleada visual)

1. **No quitar columnas críticas** de tablas técnicas (código, cantidad, precio, subtotal,
   estado).
2. **No ocultar datos financieros** a roles autorizados; respetar proyección 🔒 por rol.
3. **No reemplazar tablas técnicas por cards** si reduce comparabilidad/control.
4. **No cambiar cálculos** (BOQ/APU/AIU/export/cantidades/cronograma) ni `unit_price_snapshot`.
5. **No romper export** (Excel/PDF por rol) ni los anexos.
6. **No romper APU** (editable, completitud, Vincular a BOQ, reconciliación).
7. **No romper el companion** (flotante, placement, guía, persistencia local).
8. **No tocar `construction-ops-1rqh`** ni introducir librerías/paletas externas.
9. Cambios visuales = aditivos/presentacionales; validar typecheck/lint/build/gm si tocan código.

---

## 12.b Visual Reference Language (calidad premium, sin look genérico)

Reglas concretas para que ICONIC OPS se sienta **diseñado**, no "generado". Inspiración de
calidad/jerarquía; **nunca** copia de branding/colores externos (ver `design-references/UIX_REFERENCE_AUDIT.md`).

- **Profundidad:** superficies premium con `shadow-iconic` (o `shadow-sm`) + borde sutil
  `border-iconic-soft-blue/60-70`. Las cards no son planas; tienen elevación leve. No abusar de
  sombras fuertes ni múltiples niveles.
- **Gradientes suaves:** solo de token a blanco y muy sutiles, p. ej.
  `bg-gradient-to-br from-brand-50/70 via-white to-white`, para zonas de resumen/hero. Nunca gradientes
  saturados ni multicolor.
- **Glass / soft panels:** permitido en barras sticky (`bg-white/95 backdrop-blur`) y overlays; el cuerpo
  de tablas permanece sólido (legibilidad). Sin glass sobre datos densos.
- **Cards / paneles:** un **número "héroe"** dominante (grande, `text-2xl`, acento `iconic-primary`) +
  desglose secundario en grid compacto. Etiquetas `text-[11px] uppercase tracking-wide text-gray-500`,
  cifras `tabular-nums`. `rounded-xl`/`rounded-2xl`.
- **Tablas:** "zonas de lectura" — id (`font-mono`) + descripción a la izquierda; cifras a la derecha;
  estado/acción al final. Encabezado sticky tenue; **bloques de capítulo** con tinte `brand-50/60` y
  **borde de acento izquierdo** (`border-l-2 border-iconic-primary/60`) + subtotal en chip
  (`ring-1 ring-iconic-soft-blue/60`). Hover de fila `hover:bg-brand-50/40`. Nunca quitar columnas.
- **Acentos:** uso **controlado** de `iconic-primary` (acción/activo) e `iconic-cyan` (realce puntual,
  escaso). El color porta significado; no decorar con color.
- **Toolbars:** agrupar por zonas (búsqueda · filtros · utilidades · resultado) con **divisores**
  (`h-5 w-px bg-iconic-soft-blue/60`) en vez de controles pegados; segmented controls (`FilterPills`)
  para dimensiones cortas.
- **Recursos gráficos:** acentos sutiles (líneas, anillos, puntos de estado, blueprint inline tenue).
  Prohibido: imágenes decorativas pesadas, ilustraciones genéricas, stock.
- **Evitar look de IA:** nada de cards uniformes sin jerarquía, ni párrafos de relleno, ni gradientes
  morados/neón, ni emojis decorativos. Jerarquía tipográfica real, spacing intencional, un acento por zona.
- **Serio y operativo:** ante la duda, prioriza densidad de datos y control técnico sobre el adorno.
  Sin dark mode salvo que se prepare el sistema completo.

### Patrones extraídos de las referencias reales (ver `design-references/UIX_REFERENCE_AUDIT.md`)

Las 5 referencias (todas **dark** — se adapta a ICONIC **claro**, sin neón/morados):

- **Número héroe + breakdown** (ref-02, ref-05): un dato dominante grande + desglose y micro-data-viz.
- **Operation-list + detail** (ref-04, la más relevante para obra): lista con estado/progreso por ítem +
  ítem seleccionado resaltado + panel de detalle con fila de KPIs (Planned/Done…) → modelo de jerarquía
  para Workspace/BOQ y para la cotización asistida.
- **Acciones semánticas por color** (ref-04): verde/azul/ámbar/rojo por tipo de acción → en ICONIC con
  estados (success/info/warning/destructive), no decorativo.
- **Sidebar agrupado + colapsable** (ref-01, ref-03): secciones con badges de conteo, rail icono-only con
  tooltips, pill activo.
- **Right-rail de cards de estado** (ref-03): clave/valor + dot + barra de progreso %.
- **Micro-data-viz**: anillos de progreso, sparkbars/sparklines, barras de participación — en
  `iconic-primary`/`iconic-cyan`.

## 12.c Shell operativo compartido (V4)

Componentes canónicos para la identidad común (usar en toda pantalla principal):

- **`OperationsHeader`** (`components/shared/operations-header.tsx`): command bar navy de módulo
  (gradiente `iconic-ink` + eyebrow cian + título + microcopy + `stat` héroe + acciones). Reemplaza
  al `PageHeader` plano en los módulos operativos. NO dark mode global.
- **`KpiCard` + `KpiBand`** (`components/shared/kpi-card.tsx`): KPIs compactos (no inflados), tono por
  significado (default/ok/warn/danger), opcional link/click. Banda responsive.
- **`OperationsHeaderAction`** (en `operations-header.tsx`): acción **legible sobre navy** —
  `primary` = superficie blanca + texto ink; `secondary` = borde/texto claros. Usar SIEMPRE para acciones
  dentro de la barra navy (no botones azules llenos: azul sobre navy tiene bajo contraste).
- **`FilterPills`**, **`InlineCallout`**, **`Badge`/`StatusBadge`**, **`EmptyState`**: ya canónicos.

Regla: cada módulo principal = `OperationsHeader` arriba + (si hay datos) `KpiBand` + contenido
(tabla/lista/cards) + ayuda (`InlineCallout`). Estados con texto+color (sección 8).

## 12.d Tema claro/oscuro (V4.2)

ICONIC OPS soporta **claro (default) y oscuro** vía `darkMode: 'class'` + **tokens semánticos**
(CSS variables en `app/globals.css`, expuestos en Tailwind):

- `bg-app` (fondo página), `bg-surface` / `bg-surface-soft` / `bg-surface-muted` (superficies),
  `border-line`, `text-content`, `text-content-muted`.
- En **claro** replican la estética actual (sin cambio visual); en **oscuro** usan la paleta ICONIC dark
  (navy casi negro `#060b1f`, superficies `#0b1230+`, texto `#f8fafc`/blue-gray). **Sin negro puro, sin morado/neón.**
- La marca (navy/azul/cian, barras `OperationsHeader`, sidebar) **no cambia**: sirve en ambos modos.

Reglas:
- Para superficies/textos nuevos usar **tokens** (`bg-surface`, `text-content`, `border-line`) en vez de
  `bg-white`/`text-gray-*`, para que sean theme-aware automáticamente.
- Tema vía `ThemeProvider` (propio) + `ThemeToggle` (Claro/Oscuro/Sistema) en el menú de cuenta. Persiste
  en `localStorage`; script inline anti-FOUC. Ver `docs/design-references/UIX_THEME_MODES_V4_2.md`.
- **Cobertura dark (V4.2.1)**: `globals.css` tiene una capa central que remapea utilidades claras planas
  (`bg-white`, `bg-gray-50`, `text-gray-*`, `border-gray-*`, estados `bg-amber-50`…) a tokens **solo bajo
  `.dark`**. Por eso superficies densas se ven dark sin editar clase por clase. **No** cubre variantes con
  opacidad (`bg-white/80`, `bg-brand-50/60`): esas se tratan con `dark:` puntual. Para blanco intencional
  sobre navy usar `bg-iconic-white` (no `bg-white`, que el remapeo volvería oscuro).

## 12.e Rail de navegación flotante (V4.2.2)

El shell usa un **rail flotante** (`components/shared/app-rail.tsx`): `fixed inset-y-3 left-3`, rounded-2xl,
navy ICONIC. **Compacto** (solo íconos) → **expande al hover**; **pin** para dejarlo abierto (persiste en
`localStorage`). Pin empuja contenido (spacer en flujo); hover overlayea sin mover layout. `SidebarNav`
recibe `expanded` (íconos vs íconos+etiqueta, con tooltip al colapsar). Pie del rail = **CTA Asistente**
(evento `quote-companion:open`); el modo de datos es un indicador **sutil** (no un bloque dominante). Mismas
rutas/íconos. Dark mode V4.2.2: base neutra-profunda menos saturada (ver `UIX_THEME_MODES_V4_2.md`).

## 13. Roadmap visual

| Fase | Módulo | Foco |
|---|---|---|
| **V1** ✅ | Transversal | `InlineCallout` + ayudas contextuales. |
| **V2** ✅ | Workspace + Catálogo | `FilterPills` / segmented controls. |
| **V3** | Presupuestos / BOQ / Workspace | Restyle profundo: header+contexto, MetricCards, jerarquía capítulo/ítem, toolbar, filas expandibles. |
| **V4** | Catálogo / Precios | Toolbar premium, resumen de cobertura, lectura estado/proveedor, revisión de precios. |
| **V5** | Cantidades | Estados import/revisión/sync, progreso, jerarquía de grupos. |
| **V6** | Cronograma | Header+resumen, tabla de tareas, hitos, expectativas honestas. |
| **V7** | Settings / Accesos | Invitaciones, estados de usuario, claridad SMTP/enlace. |

Cada fase: trabajar **con revisión visual** (capturas) cuando sea posible; nunca restyle
profundo "a ciegas". Anclar cada PR a las secciones 5–10 y a las reglas de la sección 12.
