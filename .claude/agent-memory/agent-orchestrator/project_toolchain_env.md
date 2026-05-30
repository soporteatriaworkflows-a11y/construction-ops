---
name: project-toolchain-env
description: Quirks del entorno de desarrollo Windows para el toolchain pnpm/Corepack de Construction Ops
metadata:
  type: project
---

Entorno de desarrollo (Windows) y cómo operar el gestor de paquetes.

**Hechos clave:**
- Node v24.13.0, npm 11.6.2, corepack 0.34.5. pnpm fijado en **11.5.0**
  vía Corepack (`packageManager: pnpm@11.5.0` en package.json raíz).
- `corepack enable pnpm` **falla con EPERM** porque intenta escribir el
  shim en `C:\Program Files\nodejs` (requiere admin).

**Why:** el usuario no ejecuta como admin; no se debe cambiar Node global.

**How to apply:** para tener `pnpm` en PATH sin admin, usar:
`corepack prepare pnpm@latest-11 --activate` y luego
`corepack enable --install-directory "$(npm config get prefix)" pnpm`
(el dir global de npm del usuario sí está en PATH y es escribible).
Alternativamente invocar siempre `corepack pnpm ...`.

- pnpm 11 ignora build scripts por defecto. La clave de aprobación
  **vigente en pnpm 11 es `allowBuilds`** (mapa `pkg: true|false`), NO
  `onlyBuiltDependencies` (legacy). Verificado en el dist de pnpm 11.5.0
  (`allowBuilds` 91 ocurrencias vs `onlyBuiltDependencies` 2). En
  `pnpm-workspace.yaml`: `allowBuilds: { esbuild: true, sharp: true,
  unrs-resolver: true }`. Si tras `pnpm install` aparece
  `ERR_PNPM_IGNORED_BUILDS`, ejecutar `corepack pnpm rebuild <pkgs>`.
  (sharp lo añade Next 16 para optimización de imágenes.)

- Validaciones de merge: `pnpm run typecheck|lint|test|build` (raíz
  delega a `apps/web`). Validador de agentes:
  `powershell.exe -ExecutionPolicy Bypass -File "scripts/validate-claude-agents.ps1"`
  (usar comillas/forward-slashes; `.\` se rompe vía bash).
