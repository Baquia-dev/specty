---
kind: retro
---

# Borrar worktrees sin preguntar en .claude/settings.json

## Objetivo

`.claude/settings.json` deja de tener la regla `ask` `ExitWorktree(action:remove)`. Con `ExitWorktree` en `permissions.allow`, el agente entra, sale y borra worktrees sin preguntar. Los hooks del guard no cambian.

## Motivo

El usuario quiere que las worktrees sean transparentes, sin pregunta tampoco al borrarlas. El cambio «Borrar worktrees sin preguntar» hizo que `specty init` deje de escribir esa regla y la quite si ya estaba. Este commit es el resultado de volver a ejecutar `specty init` con la CLI recompilada.

## Archivos

- modificar .claude/settings.json

## Riesgos

- R1: Un agente puede borrar una worktree sin confirmación — `ExitWorktree` se niega a borrar una con cambios sin guardar o con commits fuera de la rama original, salvo que se le pida descartarlos, y el cierre de Specty ya borra la worktree de cada cambio terminado.
