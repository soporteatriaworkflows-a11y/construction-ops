# ICONIC OPS — Checklist para cargar un nuevo proyecto (v1)

> Producción: **https://construction-ops-psi.vercel.app**. Marca cada paso y guarda evidencia (captura/export).

## 0. Pre-requisitos
- [ ] Login con cuenta real (rol **gerencia/admin/presupuestos** para editar).
- [ ] Confirmar indicador **"Datos reales"** (no "Modo demostración").

## 1. Proyecto y alcance
- [ ] Crear **Proyecto** (`/projects/new`).
- [ ] Crear **Alcance** del proyecto.
- [ ] Evidencia: captura del proyecto creado.

## 2. Catálogo y precios
- [ ] Verificar/crear **recursos** (materiales, equipos) y **roles de mano de obra** con sus factores salariales.
- [ ] Verificar/cargar **precios** (vigentes) y **proveedores** si aplica.
- [ ] Crear el recurso de **Transporte/Flete** si el proyecto lo requiere (ver convención).
- [ ] Evidencia: lista de recursos/precios.

## 3. APU (2–3 de prueba primero)
- [ ] Importar APU desde Excel **o** crear manualmente.
- [ ] Abrir un **APU de QA / no crítico**.

## 4. Probar overrides (en el APU de QA)
- [ ] **Ajustar consumo** de un material → Guardar → ver chip Manual + delta.
- [ ] **Ajustar desperdicio** de un material → Guardar.
- [ ] **Ajustar rendimiento/cuadrilla** de una mano de obra → Guardar.
- [ ] **Volver al recomendado/heredado** en cada uno → confirmar que regresa al valor original.
- [ ] Confirmar que el **subtotal** cambia, pero **NO** cambian precio unitario ni desperdicio cuando ajustas consumo.
- [ ] Evidencia: capturas antes/después.

## 5. Cantidades
- [ ] Cargar/importar **cantidades**.
- [ ] **Sincronizar** al BOQ (`/quantities/workspace`).

## 6. BOQ / Presupuesto
- [ ] Crear **capítulos** e **ítems** vinculando APU.
- [ ] Revisar subtotales por capítulo.

## 7. AIU
- [ ] Configurar **Administración / Imprevistos / Utilidad** (+ IVA sobre utilidad).
- [ ] Confirmar el **total general**.

## 8. Export y revisión de privacidad
- [ ] Exportar **Excel interno** (perfil internal) — incluye trazabilidad.
- [ ] Exportar **PDF gerencial** (perfil management).
- [ ] Exportar **PDF/Excel cliente** (perfil client) y **verificar que NO muestra**: descuentos, ahorros, costos internos de M.O., notas internas, ni códigos/UUID de origen.
- [ ] Confirmar que los **ajustes** (consumo/desperdicio/rendimiento) se reflejan en el **total** exportado.
- [ ] Evidencia: guardar los 3 archivos.

## 9. Accesos (cuando se autorice sumar a Andrés)
- [ ] En **Settings → Acceso**, crear invitación para Andrés (rol según corresponda).
- [ ] Si el correo no llega, usar el **enlace manual** que muestra la pantalla y enviárselo.
- [ ] Confirmar que Andrés puede aceptar e ingresar.

## 10. Cierre
- [ ] Archivar evidencias (capturas + exports) del proyecto piloto.
- [ ] Anotar incidencias para el equipo técnico.

> **No** trabajar en preview/demo. **No** tocar `construction-ops-1rqh`. **No** editar versiones emitidas/aprobadas.
