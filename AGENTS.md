# AGENTS.md — Reglas de documentación versionada (Next.js 16)

Este proyecto usa **Next.js 16** (App Router, React 19, Turbopack). La
documentación oficial correspondiente a la versión instalada viaja dentro
del propio paquete, en:

```
apps/web/node_modules/next/dist/docs/
```

## Regla principal

Antes de implementar o modificar cualquier cosa relacionada con Next.js,
**consulta primero esa documentación versionada local**, no tu conocimiento
previo ni ejemplos de versiones antiguas. La API de Next cambia entre
mayores; la fuente de verdad es la doc que acompaña a la versión instalada.

Estructura relevante:

```
node_modules/next/dist/docs/
├── 01-app/                 # App Router (lo que usa este proyecto)
│   ├── 01-getting-started/
│   ├── 02-guides/
│   └── 03-api-reference/
│       ├── 03-file-conventions/   # layout, page, proxy, route, ...
│       ├── 04-functions/
│       └── 05-config/
├── 02-pages/               # Pages Router (no se usa por defecto)
├── 03-architecture/
└── 04-community/
```

## Cambios de Next 16 a tener presentes

- **`middleware.ts` → `proxy.ts`**: la convención `middleware` está
  deprecada y renombrada a `proxy`. El archivo vive al mismo nivel que
  `app/` y exporta una función `proxy` (o default) más un `config` con
  `matcher`. Ver `01-app/03-api-reference/03-file-conventions/proxy.md`.
  No mantener `middleware.ts` y `proxy.ts` simultáneamente.
- **ESLint**: `next lint` fue eliminado. Se usa el CLI de ESLint con flat
  config (`eslint.config.mjs`) consumiendo el array que exporta
  `eslint-config-next`. Ver `01-app/03-api-reference/03-config/eslint`.
- **React 19** y **Turbopack** son el estándar de build.

## Cómo aplicar esta regla

1. Identifica la versión exacta:
   `node -e "console.log(require('next/package.json').version)"` (en `apps/web`).
2. Abre el `.md` pertinente bajo `node_modules/next/dist/docs/01-app/...`.
3. Sigue la API exacta de esa versión.
4. Si la doc local difiere de tu conocimiento previo, **gana la doc local**.

## Convivencia con las reglas de Construction Ops

Estas reglas son complementarias, no sustituyen, a `CLAUDE.md`,
`docs/PROJECT_MASTER.md` ni `docs/AGENT_REGISTRY.md`. Ante conflicto sobre
gobierno del proyecto (ownership, oleadas, privacidad, finanzas), prevalecen
los documentos de Construction Ops. Sobre la API técnica de Next.js,
prevalece la doc versionada local.
