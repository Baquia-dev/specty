---
kind: retro
---

# Hooks de Claude Code en .claude/settings.json

## Objetivo

Los hooks del guard de Claude Code pasan a `.claude/settings.json`, versionado, con la orden portable `specty guard --tool claude-code` en `PreToolUse`, `PostToolUse` y `PostToolUseFailure`, así que el aviso tras cada comando de Bash funciona en este repositorio. El bloque del proyecto de AGENTS.md añade `packages/ui`.

## Motivo

Tras el cambio «Comprobación tras cada comando de Bash» había que volver a ejecutar `specty init` para instalar los hooks nuevos. Como el `specty` del PATH es este mismo script (un enlace de npm al `dist` de este repositorio), init eligió el modo portable: escribió `.claude/settings.json` y quitó el guard de `.claude/settings.local.json`, que no se versiona. Con el archivo en git, los worktrees reciben los hooks sin copiar `settings.local.json` a mano.

## Archivos

- crear .claude/settings.json

## Riesgos

- R1: En los worktrees que todavía tienen el guard en su `.claude/settings.local.json`, al traer este commit el guard se ejecutará dos veces por acción — `specty init` en cada worktree quita la copia local.
- R2: Si `specty` no está en el PATH del entorno donde corre Claude Code, los hooks no se ejecutan — `specty doctor` comprueba que los hooks encuentran Specty.
