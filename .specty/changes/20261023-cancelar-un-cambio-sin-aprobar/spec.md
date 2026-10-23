---
kind: quick
---

# Cancelar un cambio sin aprobar

## Objetivo

`specty cancel` funciona también con un cambio que nunca se aprobó. Hoy falla: la carpeta de un cambio sin aprobar nunca entró en git, y al archivarlo `commitArchive` le pide a git la carpeta antigua (`git add -A -- .specty/changes/<id> …`), que git no conoce («pathspec did not match»). El cambio queda movido al archivo pero sin commit. Ahora la carpeta antigua solo entra en el commit si git la sigue.

## Archivos

- modificar packages/cli/src/flow/finish.ts — la carpeta antigua solo entra en el commit si git la sigue
- modificar packages/cli/test/flow.test.ts — cancelar un cambio en borrador y uno en revisión

## Tareas

- [x] T1: Cancelar un cambio que nunca se aprobó
  - files: packages/cli/src/flow/finish.ts, packages/cli/test/flow.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/flow.test.ts
  - type: fix
