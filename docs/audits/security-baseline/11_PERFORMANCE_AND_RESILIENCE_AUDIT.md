# 11 — Rendimiento y Resiliencia

> Hallazgos **inferidos por lectura de código**; no se ejecutaron pruebas de carga
> ni perfilado (no medido). Diferenciar: medido | inferido | pendiente.

| ID | Operación | Evidencia | Riesgo | Impacto seguridad | Impacto rendimiento | Recomendación | Prioridad |
|---|---|---|---|---|---|---|---|
| P-1 | Listas read-model (projects/resources/apu/schedule/BOQ) | 0 `.limit()`/`.offset()` en `drizzle-repository.ts` y `lib/db` (inferido) | Carga de tablas completas por organización | DoS/abuso (con M-04) | Crece O(n) con datos | Paginación + límites por consulta | P3 (M-03) |
| P-2 | Selección de columnas | Drizzle `.select()` sin proyección en algunas lecturas (inferido) | Over-fetch de columnas | Posible exposición de columnas no usadas | Payload mayor | Proyección explícita de columnas | P3 |
| P-3 | Export Excel/PDF | Generación en memoria, completa, sin cola (código) | Pico de CPU/memoria en función | — | Latencia/coste en exports grandes | Límite por usuario/tamaño + métrica | P3 |
| P-4 | N+1 en payload export | `getEstimateExportPayload` itera capítulos y consulta ítems por capítulo (lectura) | N+1 (14 consultas para 14 capítulos) | — | Aceptable a escala actual; degrada con muchos capítulos | Batch/join único de ítems | P3 |
| P-5 | Bundle export (logo base64) | `logo-asset.ts` ~180 KB en bundle de la función | — | — | Tamaño de función | Aceptable; revisar si crecen assets | P3 (L-05) |
| P-6 | Observabilidad | Sin APM/trazas; logs `console.*` | Detección tardía de incidentes | Respuesta lenta a abuso | — | Definir logging estructurado + alertas | P3 |
| P-7 | Caché | Rutas `force-dynamic` sin caché donde podría aplicar (catálogo) | — | — | Recalcula por request | Evaluar caché selectiva read-only | P3 |

## Resiliencia
- **Idempotencia:** import BOQ anti doble-submit + digest. ✅
- **Límites:** Server Actions 4 MB (import). Export con `EXPORT_MAX_BYTES`. Resto
  sin límite explícito.
- **Colas:** ninguna (no requeridas a escala actual).
- **Riesgo de facturación por abuso:** posible si exports/lecturas no se limitan
  (combinar M-03 + M-04).

## No medido / pendiente
- Tiempos reales de respuesta, memoria de función, conteo de queries por request,
  índices efectivamente usados (requiere `EXPLAIN`/APM en entorno controlado).
