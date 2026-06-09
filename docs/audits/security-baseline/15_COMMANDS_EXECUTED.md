# 15 — Comandos Ejecutados (read-only)

> Todos los comandos fueron de **solo lectura** o validaciones locales que no
> modifican datos ni dependen de producción. No se ejecutaron resets, migraciones,
> deploys ni escaneos contra servicios públicos.

## Baseline Git
```
pwd
git rev-parse --show-toplevel
git status --short --branch
git rev-parse HEAD
git remote -v
git worktree list
git branch --all --verbose --no-abbrev
git log --oneline --decorate -n 12
git checkout -b audit/security-baseline-construction-ops   # rama aislada (árbol limpio)
```

## Descubrimiento de arquitectura
```
ls -la
node -e "<lectura de package.json: scripts/deps/packageManager>"
cat .gitignore .env.example
ls -la private/ ; git check-ignore private/
git ls-files | grep -iE "\.env|dockerfile|compose|workflows|vercel.json|\.tf"
git ls-files supabase
cat drizzle.config.ts
cat apps/web/lib/supabase/client.ts apps/web/lib/supabase/server.ts
cat apps/web/proxy.ts apps/web/next.config.mjs
```

## AWS / proveedores
```
git grep -nE "AWS_[A-Z_]+|from '@?aws|aws-sdk|\.amazonaws\.com|AKIA[0-9A-Z]{16}" -- apps scripts supabase
grep -cE "aws-sdk|@aws-sdk|@smithy" pnpm-lock.yaml
ls node_modules/@aws-sdk    # NOT installed
```

## Supabase / RLS
```
grep -rhE "ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql | wc -l    # 24
grep -rhE "FORCE ROW LEVEL SECURITY"  supabase/migrations/*.sql | wc -l    # 24 únicas
grep -rhoE "ALTER TABLE .* FORCE ROW LEVEL SECURITY" supabase/migrations/*.sql
grep -rEn -A3 "SECURITY DEFINER" supabase/migrations/*.sql | grep search_path
grep -rniE "GRANT[^;]*anon|TO anon" supabase/migrations/*.sql
grep -cE "^\s*check\(" scripts/rls-runtime/run.ts          # 93
grep -nE "^\[|port |enabled" supabase/config.toml
```

## Backend / Frontend / secretos
```
git grep -nE "SERVICE_ROLE|service_role" -- apps scripts
git grep -nE "(eyJ...)|sk_live|AKIA[0-9A-Z]{16}|BEGIN .* PRIVATE KEY|ghp_|xox[baprs]-" -- apps scripts supabase
git grep -nE "dangerouslySetInnerHTML|eval\(|new Function\(" -- apps/web
grep -ncE "\.limit\(|\.offset\(" apps/web/server/read-model/drizzle-repository.ts   # 0
git grep -niE "\.storage\b|\.upload\(|storage\.objects" -- apps/web/**/*.ts*        # 0 (source)
```

## Validaciones locales (permitidas)
```
corepack pnpm run typecheck   # PASS (0 errores)
corepack pnpm run lint        # PASS (0)
corepack pnpm run test        # 712 passed
corepack pnpm run build       # Compiled successfully (rutas ƒ/○)
```

## NO ejecutado (pendiente / requiere autorización o red)
```
# scripts/rls-runtime/run.ts        (requiere Docker local; MV-04)
# pnpm audit / pnpm outdated         (requiere red; MV-07)
# gitleaks / escaneo de historial    (MV-08)
# cualquier acción contra Supabase remoto o Vercel (prohibido en esta fase)
```
