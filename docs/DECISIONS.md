# Decisiones del proyecto

| Fecha | Decisión | Razón | Estado |
|---|---|---|---|
| 2026-05-29 | ORM: Drizzle ORM | Mejor DX con TypeScript, migraciones SQL directas, sin magia | ✅ Aprobado |
| 2026-05-29 | Stack: Next.js 14 + Supabase + Drizzle | Monolito modular, un solo lenguaje, menor complejidad inicial | ✅ Aprobado |
| 2026-05-29 | Licencia: construcción clean-room | No copiar código AGPL. OpenConstructionERP solo como referencia funcional | ✅ Aprobado |
| 2026-05-29 | Grid: AG Grid Community | Sin costo Enterprise, suficiente para grillas de presupuesto | ✅ Aprobado |
| 2026-05-29 | Gantt: Frappe Gantt (MIT) | Zero dependencias, embebible en React, licencia libre | ✅ Aprobado |

Decisiones abiertas:
- [ ] Nombre final del producto
- [ ] Política exacta de redondeo decimal
- [ ] Usuarios iniciales y roles asignados
- [ ] Qué información ve el cliente en APU
- [ ] Proveedores visibles para cliente
- [ ] Frecuencia de sincronización de precios
- [ ] Canal oficial Homecenter Empresas
- [ ] Gantt por capítulos o actividades
- [ ] Ubicación de despliegue (Vercel + Railway o solo Vercel)
