---
kind: quick
---

# La trazabilidad no cuenta para un criterio las líneas de test que el cambio deja como estaban en main

## Objetivo

En aceptación, «CRITERIOS Y TESTS» (y `criteriaTests` del servidor, que es la misma función) cuenta para un criterio cada línea con su id cuyo `git blame` apunta a un commit de una tarea o de tests del cambio: si un commit borra unas líneas de main y otro las vuelve a poner tal cual, el blame se las atribuye al segundo y el cambio se apunta tests ajenos, como los de `memory.test.ts` con «AC1» en el nombre (P364). Con este cambio, una línea solo cuenta si además el cambio la deja distinta de donde empezó: la añade el diff neto desde el merge-base con la rama destino, como en `specty check --changed`. Si HEAD es ese merge-base (el cambio trabaja en la propia rama destino, con `git.branchPerChange: false`), el diff no dice nada del cambio y cuenta solo el blame, como hasta ahora.

## Archivos

- modificar packages/cli/src/check/files.ts — exporta las líneas que añade cada archivo desde el merge-base con la rama destino, sin nada cuando HEAD es ese merge-base
- modificar packages/cli/src/flow/criteria-tests.ts — `criteriaTests` deja fuera las líneas con id que el diff neto del cambio no añade
- modificar packages/cli/test/criteria-tests.test.ts — un test de main que una tarea borra y otra devuelve tal cual no cuenta para el criterio; con `git.branchPerChange: false` la matriz sigue contando los tests del cambio
- modificar docs/ARCHITECTURE.md — §13, la matriz de aceptación: tampoco cuenta la línea que el cambio deja como estaba en el merge-base con la rama destino

## Tareas

- [x] T1: La matriz de aceptación no cuenta las líneas de test que el cambio deja como estaban en main
  - files: packages/cli/src/check/files.ts, packages/cli/src/flow/criteria-tests.ts, packages/cli/test/criteria-tests.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/criteria-tests.test.ts test/contract-matrix.test.ts test/server/records.test.ts && pnpm typecheck && pnpm lint
  - type: fix
