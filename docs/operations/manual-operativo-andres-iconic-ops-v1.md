# ICONIC OPS — Manual operativo (v1)

> Para Andrés / equipo de presupuestos. 1 página. Practica primero en un **APU de QA / no crítico**.

## 1. Cómo entrar
- Abre **https://construction-ops-psi.vercel.app** e inicia sesión con tu correo y contraseña.
- Si no tienes acceso, pide una invitación (llega por correo o por **enlace manual**).

## 2. Qué significa "Datos reales"
- Abajo en la barra lateral hay un indicador de modo.
- **"Datos reales"** (cian) = estás en producción con la base real. **Trabaja aquí.**
- **"Modo demostración"** (ámbar) = datos de prueba (preview). **No es producción**; no cargues proyectos reales ahí.

## 3. Flujo básico
**Proyecto → Presupuesto → APU → Cantidades → Export**
1. **Proyecto**: crea el proyecto y su **alcance**.
2. **Catálogo**: verifica que existan los recursos (materiales, roles de mano de obra) y sus **precios**.
3. **APU**: importa desde Excel o créalos manualmente.
4. **Cantidades**: cárgalas y sincronízalas al BOQ.
5. **Presupuesto/BOQ**: arma capítulos e ítems, configura **AIU**.
6. **Export**: genera Excel/PDF para revisión.

## 4. Cómo ajustar un componente del APU
En **APU → (abrir un APU) → pestaña Componentes**, sobre la columna de cantidad:
- **Material → "Ajustar consumo"**: cambia el consumo/coeficiente del material por unidad de obra.
- **Material → "Ajustar desperdicio"**: cambia el % de desperdicio del material.
- **Mano de obra → "Ajustar rendimiento"**: cambia el rendimiento o el tamaño de cuadrilla.
- Verás un **preview** del nuevo valor/subtotal y un **delta**; si el cambio supera ±20% aparece una advertencia. Pulsa **Guardar**.
- Aparecerá un chip **"Manual"** indicando que el valor fue ajustado.

## 5. Cómo volver al recomendado
- En el mismo panel usa **"Volver al recomendado / heredado"** y **Guardar**.
- El componente regresa a su **valor original** (el congelado en el primer ajuste).

## 6. Qué NO debes tocar
- **No** edites presupuestos/versiones **emitidos, aprobados o archivados** (son definitivos; el sistema los bloquea).
- **No** esperes cambiar el **precio unitario** desde el APU: los precios se gestionan en **Catálogo/Proveedores** (el APU congela el precio).
- **No** uses el **cronograma** como entregable formal todavía (está en verificación).
- **No** trabajes en "Modo demostración".

## 7. Cómo reportar errores
- Anota: APU/proyecto, qué hiciste, qué esperabas y qué pasó (captura de pantalla).
- Si un botón esperado no aparece (p.ej. "Ajustar consumo" en un material), repórtalo.
- Envía el reporte al canal acordado con el equipo técnico.

## 8. Convención de transporte (estándar inicial)
El transporte **no es un campo aparte**. Modélalo así:
- **Por defecto (recomendado):** crea un **recurso de catálogo** "Transporte/Flete" (unidad `viaje`/`m³`/`global`) y agrégalo como **componente del APU** que lo requiere. Así queda trazable y editable como cualquier material.
- **Transporte a nivel obra (global):** créalo como **ítem/capítulo BOQ** separado "Transportes".
- **Transporte contratado a un tercero:** créalo como componente **subcontrato**.
- **No** lo metas en el AIU/indirectos (distorsiona el AIU).

## 9. Advertencia
**Practica primero en un APU de QA / no crítico.** Los ajustes aplican al APU de biblioteca en borrador y **no** recalculan presupuestos ya emitidos, pero conviene familiarizarse antes de tocar APUs reales.
