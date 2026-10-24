---
kind: quick
---

# Doctor detecta la guía de flujo de gentle-ai

## Objetivo

gentle-ai escribe en las instrucciones del agente bloques delimitados (``). Su guía de ODD (`agent-routing`), que no se puede desactivar, pide al agente hacer sus propios commits por unidad de trabajo y su propio documento de tareas, y el guard de Specty bloquea esos commits, así que el agente choca con Specty sin saber por qué. `specty doctor` avisa cuando encuentra la guía de flujo de gentle-ai (`agent-routing` y los bloques de su antiguo SDD: `orchestrator`, `sdd-orchestrator` y `sdd`) en `AGENTS.md` o `CLAUDE.md` del repositorio, o en los archivos globales donde gentle-ai la escribe: `~/.claude/CLAUDE.md`, el `AGENTS.md` de Codex (`$CODEX_HOME` o `~/.codex`) y de OpenCode (`$XDG_CONFIG_HOME/opencode` o `~/.config/opencode`), y `~/.cursor/rules/gentle-ai.mdc`. Dice en qué archivo y qué bloques, y que hay que quitarlos para usar Specty; los demás bloques de gentle-ai (persona, engram…) no chocan y no se nombran. Las rutas y los nombres salen del código de gentle-ai (commit 7beb055, consultado el 2026-10-24).

## Archivos

- crear packages/cli/src/detect/gentle-ai.ts — los archivos donde gentle-ai escribe y sus bloques de flujo
- modificar packages/cli/src/commands/doctor.ts — el aviso por cada archivo con esos bloques
- crear packages/cli/test/gentle-ai.test.ts — el aviso en el repositorio y en los archivos globales
- modificar docs/ARCHITECTURE.md — lo que comprueba `doctor` (§14)

## Tareas

- [x] T1: `doctor` avisa de la guía de flujo de gentle-ai
  - files: packages/cli/src/detect/gentle-ai.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/gentle-ai.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: feat

## Cierre

### Resumen

detect/gentle-ai.ts busca los bloques de flujo de gentle-ai (agent-routing, orchestrator, sdd-orchestrator, sdd) en AGENTS.md y CLAUDE.md del repositorio y en los archivos globales de Claude Code, Codex, OpenCode y Cursor; doctor avisa por archivo, nombrando los bloques. ARCHITECTURE §14.
