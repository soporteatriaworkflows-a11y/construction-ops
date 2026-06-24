# APU Smart Defaults & Expert Overrides — V1 (Producto)

> Frase guía: **La plataforma no reemplaza el criterio técnico; lo organiza.**
>
> Estado: **DISCOVERY** (solo diseño). No implementado. Rama
> `feat/apu-smart-defaults-expert-overrides-discovery-v1` desde `main=b1492d7`.

## 1. Problema de producto
Los factores de un APU (desperdicio, rendimiento, productividad de cuadrilla,
herramienta menor, coeficientes) hoy son **valores efectivos** sin distinguir si
vienen del sistema/Excel o si los editó una persona. Queremos que la app sirva
tanto al usuario con **poca experiencia** (que necesita defaults seguros y guía)
como al **experto** (que necesita ajustar con libertad y trazabilidad), sin que
ninguno rompa un APU por accidente y sin alterar presupuestos ya aprobados.

## 2. Principios
1. **Default seguro siempre presente**: ningún campo técnico queda vacío.
2. **El experto manda**: puede ajustar todo, con justificación opcional.
3. **Trazabilidad**: se distingue *recomendado* vs *editado manualmente*.
4. **Reversible**: siempre se puede "volver al recomendado".
5. **Advertencias, no bloqueos**: fuera de rango = avisa, no impide.
6. **Histórico intocable**: lo aprobado/emitido no cambia retroactivamente.

## 3. Estado actual (resumen para producto)
- **Desperdicio**: ya existe como default de catálogo (`resources.default_waste_pct`)
  y como valor por línea del APU (`apu_components.waste_pct`). El export (Excel/PDF)
  ya muestra la columna **"Desperdicio"** y el **"Origen"** del APU (Importado/Manual).
- **Herramienta menor**: ya existe por APU (`apu_templates.default_tool_pct`, 0–1).
- **Rendimiento / productividad / cuadrilla**: hoy **NO** son campos editables
  independientes en el APU; quedan "fundidos" dentro de la `cantidad` del componente
  de mano de obra. Editarlos como factores propios es trabajo nuevo (ver doc de ingeniería).
- **Trazabilidad recomendado-vs-editado**: **no existe** todavía (es el corazón de esta oleada).
- **Factores por ciudad / proyecto / complejidad / altura / experiencia de cuadrilla**:
  **no existen**.

## 4. UX — Dos niveles

### A. Modo básico / seguro (default de la interfaz)
Pensado para usuarios con poca experiencia.
- Cada factor se muestra **ya relleno** con el valor recomendado y una **etiqueta de origen**:
  chip *"Recomendado"*.
- Una **explicación corta** en lenguaje natural (tooltip o línea debajo).
- **Rangos sugeridos** visibles ("entre 5% y 10%").
- Edición posible pero con **fricción suave**: al cambiar, aparece confirmación visual
  y, si sale del rango, una **advertencia ámbar** (no bloqueante).
- Botón **"Usar recomendado"** siempre visible cuando el valor difiere del default.
- Nunca presenta un campo técnico **vacío** ni jerga sin explicación.

### B. Modo experto / avanzado (toggle "Modo avanzado")
- Edición directa de **desperdicio, rendimiento/productividad, cuadrilla, coeficientes,
  herramienta menor**.
- Campo opcional **"Justificación del ajuste"** (nota libre, queda en trazabilidad).
- **Impacto en vivo** del precio unitario: "Unitario recomendado: $X → Ajustado: $Y (+Z%)".
- Indicador **"Editado"** (chip) en cada factor que difiere del recomendado.
- **"Volver al recomendado"** por factor y a nivel APU completo.
- Toda edición guarda **quién, cuándo, valor anterior, valor nuevo** (trazabilidad).

## 5. Microcopy (es-CO, listo para UI)

**Origen / estado del valor**
- `Recomendado por la plataforma`
- `Editado manualmente`
- `Valor del Excel original`

**Explicaciones suaves**
- `Valor recomendado por la plataforma: 7%`
- `Puedes ajustarlo si las condiciones del proyecto cambian.`
- `Este porcentaje cubre el material que se pierde durante la instalación.`

**Advertencias (no bloqueantes)**
- `Este valor está por fuera del rango sugerido (5%–10%). Verifica si corresponde a una condición especial.`
- `Un desperdicio muy alto puede inflar el presupuesto. ¿Es intencional?`
- `Rendimiento inusualmente alto: revisa que la cuadrilla y la unidad sean correctas.`

**Acciones**
- `Usar recomendado`
- `Volver al valor recomendado`
- `Ver impacto en el precio unitario`
- `Agregar justificación (opcional)`

**Impacto**
- `Unitario recomendado: $128.400`
- `Unitario ajustado: $134.900 (+5,1%)`
- `Cambio por tus ajustes: +$6.500 por unidad`

## 6. Trazabilidad visible (para el cliente/auditoría)
- En la UI del APU: chip por factor (*Recomendado* / *Editado*).
- En el export **técnico** (presupuestador/obra): columna de origen y, opcional,
  el valor recomendado vs el aplicado.
- En el export **cliente**: NO se exponen rangos internos ni notas de ajuste; solo
  el valor final (respeta perfiles de privacidad existentes).

## 7. Jerarquía de defaults (visión de producto)
De lo más general a lo más específico (gana el más específico):
1. **Sistema** (criterio base de la plataforma / Excel original).
2. **Empresa / workspace** (política de la constructora).
3. **Proyecto** (condiciones de la obra: ciudad, tipo).
4. **Capítulo / tipo de actividad**.
5. **APU**.
6. **Línea / recurso del APU** (override puntual del experto).

Hoy existen, de hecho, solo **(1) a nivel recurso** y **(6) a nivel línea**. El resto
es futuro (ver fases).

## 8. Compatibilidad con presupuestos aprobados (no negociable)
- Las versiones **emitidas/aprobadas/archivadas** NO se recalculan: su APU está
  congelado en snapshots inmutables. Para cambiar factores se **clona** a una nueva
  versión editable (mecánica ya existente).
- Introducir "recomendados" **no cambia** ningún valor histórico: solo agrega una
  capa informativa ("este era el recomendado") sin tocar el efectivo aprobado.
- Los presupuestos en **borrador** muestran recomendados y permiten override; nada
  se recalcula sin acción explícita del usuario.

## 9. Plan por fases (producto)
- **V1 Discovery** (esta oleada): auditoría + diseño. Sin runtime.
- **V1A UI read-only**: mostrar valor + origen + rango recomendado, **sin** permitir
  edición. Cero riesgo. Construye confianza.
- **V1B Overrides internos**: edición de desperdicio (y herramienta) en APU **borrador**,
  con trazabilidad recomendado-vs-editado y "volver al recomendado".
- **V1C Export**: reflejar override + origen en el anexo APU (perfil técnico).
- **V1D Defaults por proyecto**: plantillas de factores por proyecto/ciudad/tipo.
- **V1E Inteligencia**: sugerir rangos según histórico/ciudad/proyecto.
- **Fase aparte (mayor)**: hacer **rendimiento/productividad/cuadrilla** editables como
  factores propios (requiere modelo de datos nuevo; ver doc de ingeniería).

## 10. Criterios de aceptación (V1A/V1B)
- Ningún campo técnico aparece vacío en modo básico.
- Cada factor muestra origen (Recomendado/Editado) y rango sugerido.
- Editar fuera de rango muestra advertencia ámbar, no bloquea.
- "Volver al recomendado" restaura el valor del default vigente.
- Editar un APU borrador NO altera ninguna versión emitida.
- El golden master (regresión financiera) permanece verde: los valores efectivos
  por defecto **no cambian** respecto de hoy.
