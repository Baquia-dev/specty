---
kind: retro
---

# Permisos de worktree en .claude/settings.json

## Objetivo

`.claude/settings.json` permite a los agentes de Claude Code `EnterWorktree` y `ExitWorktree` sin preguntar, y mantiene la pregunta para `ExitWorktree(action:remove)`, que borra la worktree y su rama. Ninguna sesión de este repositorio vuelve a ver «Do you want to proceed with EnterWorktree?» al entrar en la worktree de cada cambio. Los hooks del guard no cambian.

## Motivo

Cada cambio vive en su worktree, y el agente entra en ella con `EnterWorktree`, que pedía permiso cada vez; el usuario pidió evitarlo. El cambio «Permisos de worktree para Claude Code» hizo que `specty init` escriba estos permisos junto al guard. Este commit es el resultado de volver a ejecutar `specty init` en este repositorio con la CLI recompilada. Al versionarlo, lo reciben todos los clones y las worktrees nuevas.

## Archivos

- modificar .claude/settings.json

## Riesgos

- R1: Entrar o salir de una worktree ya no pide confirmación — solo cambia la carpeta de trabajo de la sesión, y borrar una (`remove`) sigue preguntando.
