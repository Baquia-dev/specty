---
kind: quick
---

# Los commits del flujo no fallan con worktrees anidadas que git ignora

## Objetivo

Con un cambio abierto en `.worktrees/`, que git ignora (`specty new` lo añade a `.git/info/exclude` e `init` al `.gitignore`), cada commit que Specty hace en la carpeta principal falla: `git add -A` rechaza el `:(exclude)` de una carpeta ignorada con «The following paths are ignored by one of your .gitignore files». Le pasó a `specty init`, que dejó sus archivos preparados y sin commit. Ahora los commits del flujo solo excluyen las worktrees anidadas que git no ignora: las ignoradas ya quedan fuera de `git add -A`.

## Archivos

- modificar packages/cli/src/flow/commits.ts — excluir solo las worktrees anidadas que git no ignora
- modificar packages/cli/test/init-commit.test.ts — init hace su commit con otro cambio abierto en `.worktrees/`

## Tareas

- [x] T1: Los commits del flujo no excluyen las worktrees anidadas que git ignora
  - files: packages/cli/src/flow/commits.ts, packages/cli/test/init-commit.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-commit.test.ts test/worktrees.test.ts

## Cierre

### Resumen

commitWithReceipt solo pasa :(exclude) para las worktrees anidadas que git no ignora; git add -A ya deja fuera las ignoradas y rechazaba excluirlas. Test de init con otro cambio en .worktrees/ ignorada
