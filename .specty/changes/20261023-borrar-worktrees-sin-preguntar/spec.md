---
kind: quick
---

# Borrar worktrees sin preguntar

## Objetivo

Las worktrees deben ser transparentes para el usuario, así que borrar una tampoco pide confirmación. `specty init` deja de escribir `ExitWorktree(action:remove)` en `permissions.ask`, y lo quita si lo había escrito antes. Así `ExitWorktree`, que ya está en `permissions.allow`, no pregunta nunca. Las demás reglas `ask` que haya en el archivo se conservan; si `ask` queda vacío, se quita.

## Archivos

- modificar packages/cli/src/install/agents.ts — solo `allow`; quitar la regla `ask` de antes
- modificar packages/cli/test/setup.test.ts — sin `ask`, y la regla antigua se borra conservando las demás
- modificar docs/ARCHITECTURE.md — §10: borrar una worktree tampoco pregunta

## Tareas

- [x] T1: ExitWorktree sin pregunta al borrar
  - files: packages/cli/src/install/agents.ts, packages/cli/test/setup.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
