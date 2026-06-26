# UIX_REFERENCE_AUDIT — Auditoría de referencias visuales

> Complemento de `docs/DESIGN.md`. Aquí se documenta, por cada imagen de
> referencia subida a `docs/design-references/uix/`, qué inspira para ICONIC OPS
> (sin copiar branding/estilos literales).

## ⚠️ Estado: referencias NO encontradas en el repo (2026-06-25)

Al ejecutar `ICONIC_OPS_UIX_VISUAL_REFERENCE_AUDIT_AND_WORKSPACE_V3B` se buscó la
carpeta **`docs/design-references/uix/`** y **no existe**; tampoco hay imágenes de
referencia (`.png/.jpg/.jpeg/.webp`) en `docs/` ni en el árbol del repo (solo los
logos de marca en `apps/web/public/branding/iconic/`). El working tree estaba
limpio y `origin/main` no contenía esos archivos.

**Implicación honesta:** no se puede auditar el contenido de referencias que no están
presentes, y **no se inventa** qué muestran. Por eso este documento queda como
**plantilla** y el "Visual Reference Language" añadido a `DESIGN.md` se derivó de los
**principios listados por la usuaria** (jerarquía, profundidad, cards, sombras,
acentos) adaptados a los tokens ICONIC — no de imágenes concretas.

### Cómo completar esta auditoría cuando subas las imágenes

1. Sube los archivos a `docs/design-references/uix/` (commitea las imágenes).
2. Vuelve a ejecutar el prompt de auditoría (o pídeme que lo relea).
3. Por cada imagen se llenará una ficha con el formato de abajo.

### Plantilla por referencia (a llenar)

```
### ref-XX — <nombre/archivo>
- Qué sirve para ICONIC OPS: <elemento visual concreto>
- Qué NO copiar: <branding/colores/estilo literal>
- Adaptación a paleta/módulos ICONIC: <cómo, con qué tokens>
- Patrón concreto aplicable: <componente/regla en DESIGN.md>
```

### Lecturas candidatas (a confirmar contra imágenes reales)

Estas son **hipótesis de patrones** habituales en dashboards premium, NO lecturas de
imágenes reales (que no existen aún). Validar/descartar al subir las referencias:

- Sidebar premium / rail colapsable con jerarquía clara.
- Cards con profundidad (sombra suave + borde sutil), no planas.
- Fondos suaves con gradientes controlados (de token a blanco).
- Paneles de métricas con un número "héroe" dominante + desglose secundario.
- Tablas con "zonas de lectura" (id/desc a la izq, cifras a la der, estado/acción al final).
- Acciones principales evidentes (1 primaria) y secundarias agrupadas.
- Chips/filtros como segmented controls visuales (FilterPills).
- Recursos gráficos de apoyo sutiles (líneas/acentos), sin imágenes decorativas pesadas.

> Regla permanente: inspiración de **calidad/jerarquía/spacing**, nunca copia de
> branding/colores externos. Si una referencia contradice la paleta ICONIC, gana ICONIC.
