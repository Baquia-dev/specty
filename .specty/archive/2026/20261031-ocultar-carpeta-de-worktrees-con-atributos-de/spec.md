---
kind: quick
---

# Ocultar carpeta de worktrees con atributos de sistema operativo

## Objetivo

Ocultar la carpeta contenedora `<proyecto>.worktrees` en el explorador de archivos del sistema operativo aplicando atributos nativos (`chflags hidden` en macOS y `attrib +h` en Windows) cuando Specty añade una worktree, manteniendo la compatibilidad total de rutas, agentes y herramientas.

## Archivos

- modificar packages/cli/src/flow/worktree.ts — marcar la carpeta contenedora de worktrees como oculta al añadir una worktree
- modificar packages/cli/test/worktrees.test.ts — verificación de que la carpeta de worktrees recibe el atributo oculto en el sistema operativo
- modificar docs/ARCHITECTURE.md — documentar que la carpeta de worktrees se marca como oculta mediante atributos de SO

## Tareas

- [x] T1: Ocultar la carpeta contenedora de worktrees con atributos de SO en Windows y macOS
  - files: packages/cli/src/flow/worktree.ts, packages/cli/test/worktrees.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty test test/worktrees.test.ts

## Cierre

### Resumen

ocultar la carpeta contenedora de worktrees con atributos de SO en Windows y macOS
