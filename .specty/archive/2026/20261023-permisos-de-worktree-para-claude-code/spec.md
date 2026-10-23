---
kind: quick
---

# Permisos de worktree para Claude Code

## Objetivo

Cada cambio vive en su worktree, y en Claude Code el agente entra en ella con `EnterWorktree`, que hoy pide permiso cada vez. `specty init` añade al mismo archivo de Claude Code donde instala el guard los permisos `EnterWorktree` y `ExitWorktree` en `permissions.allow`, y `ExitWorktree(action:remove)` en `permissions.ask`, para que borrar una worktree siga preguntando. Los permisos que ya tuviera el archivo se conservan, y volver a ejecutar `init` no duplica nada.

## Archivos

- modificar packages/cli/src/install/agents.ts — los permisos de worktree junto al hook del guard
- modificar packages/cli/test/setup.test.ts — se escriben, conservan los existentes y no se duplican
- modificar docs/ARCHITECTURE.md — §10: lo que `init` escribe para Claude Code

## Tareas

- [x] T1: Permisos de worktree en la instalación de Claude Code
  - files: packages/cli/src/install/agents.ts, packages/cli/test/setup.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check

## Cierre

### Resumen

init añade a la configuración de Claude Code donde instala el guard los permisos EnterWorktree y ExitWorktree (allow) y ExitWorktree(action:remove) (ask), después de las reglas que ya hubiera y sin duplicar al repetir init. ARCHITECTURE §10 lo documenta.
