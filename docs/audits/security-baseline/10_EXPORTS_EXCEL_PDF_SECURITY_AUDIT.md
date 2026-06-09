# 10 — Seguridad de Exportaciones Excel / CSV / PDF

## Camino actual (4E.1/4E.1C) — `GET /api/estimates/export`

| Control | Estado |
|---|---|
| Autorización para generar/descargar | ✅ `resolveViewer()` (401 sin sesión) |
| Aislamiento de tenant | ✅ valida `estimateId↔scopeId↔projectId`; cross-org → 404 (RLS en el payload) |
| URLs públicas/predecibles | ✅ no; requiere sesión; no se persiste archivo |
| Persistencia accidental | ✅ generación **en memoria** (`Uint8Array`), sin temporales |
| Nombre de archivo seguro | ✅ `sanitizeSegment` (solo `[A-Z0-9_]`, anti `..`/`/`/`\`) |
| Datos sensibles embebidos (PDF) | ✅ sin UUID/`source_row`/secretos (test estructural) |
| Trazabilidad | ✅ solo en hoja secundaria `TRAZABILIDAD` del Excel; nunca en PDF |
| Límite de tamaño | ✅ `EXPORT_MAX_BYTES` (~15 MB) |
| Integridad de cálculos | ✅ `FinancialSummary` server-side (decimal.js), no recalcula en cliente |
| Precisión monetaria/redondeo | ✅ ROUND_HALF_UP en presentación; valores decimales en origen |

## `RIESGOS ESPECÍFICOS DE EXPORTACIÓN DE PRESUPUESTOS`

1. **M-06 — Inyección de fórmulas (CSV/Excel injection).** Los generadores escriben
   valores de texto (descripción de ítem, nombre de capítulo, nombre de proyecto)
   directamente en celdas. Si una descripción comenzara por `=`, `+`, `-`, `@`,
   `\t` o `\r`, un cliente de hoja de cálculo podría interpretarla como fórmula al
   abrir el archivo. **No se observó neutralización** (prefijo `'` o saneo) de esos
   prefijos. Riesgo: ejecución de fórmula/exfiltración al abrir el archivo en Excel.
   Severidad **MEDIUM** (los datos son del propio tenant, pero el texto proviene de
   importaciones de Excel del usuario). **Recomendación:** anteponer comilla simple
   o sanear celdas de texto que empiecen por caracteres peligrosos.
2. **Macros** — No se generan macros; ExcelJS produce `.xlsx` sin VBA. ✅
3. **HTML/scripts en plantillas** — PDF con `@react-pdf` (sin HTML arbitrario);
   Excel sin HTML. ✅
4. **Metadata** — `creator`/`title` = marca; sin PII embebida. ✅
5. **DoS / generación masiva** — Export completo sin paginación (un presupuesto ~
   132 ítems → archivo pequeño). Sin rate limit por usuario/export (**M-04**) ni
   cola; a gran escala podría consumir CPU/memoria de función. Mitigar con límite
   por usuario + tamaño.
6. **Path traversal en filename** — mitigado por `sanitizeSegment`. ✅
7. **Logo embebido** — base64 en bundle; sin lectura `fs` en runtime. ✅

## Camino legacy (3C) — `GET /api/exports`
- **M-02** — Usa `DEMO_ORGANIZATION_ID` para el visor del read-model; puede servir
  datos del tenant equivocado (mitigado: org demo no sembrada en prod). Recomendado
  **gatear/retirar**. Aplica perfiles de privacidad por rol (client/site/management/
  internal) — su lógica de proyección es buena, pero el origen de datos es incorrecto.

## Hallazgos
- **M-06** inyección de fórmulas en Excel/CSV (sanear celdas de texto).
- **M-02** export legacy con org demo.
- **M-04** sin rate limit por export/usuario.
- **INFO** export 4E.1 robusto: auth, cadena, memoria, filename, privacidad PDF.
