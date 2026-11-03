---
kind: quick
---

# Las worktrees dentro del repositorio quedan medidas en un ADR

## Objetivo

Se midió qué herramientas de cada stack ven una worktree creada dentro del repositorio, en una carpeta oculta e ignorada por git (`.worktrees/<id>`), para decidir si Specty debe crear allí las de los cambios y que así cualquier agente o editor que solo trabaja en la carpeta del proyecto (Antigravity en Zed) alcance la del cambio sin que la persona haga nada. El ADR 0018 deja las cifras, los riesgos y la propuesta, a falta de que la persona decida si vale para todos los proyectos o solo para los que lo necesitan.

## Archivos

- crear docs/decisions/0018-worktrees-dentro-del-repositorio.md — la medición y la propuesta

## Tareas

- [ ] T1: El ADR 0018 deja medidas las worktrees dentro del repositorio
  - files: docs/decisions/0018-worktrees-dentro-del-repositorio.md
  - ac: —
  - verify: pnpm lint
  - type: docs
