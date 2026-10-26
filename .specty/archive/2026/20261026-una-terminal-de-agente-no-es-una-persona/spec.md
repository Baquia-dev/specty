---
kind: quick
---

# Una terminal de agente no es una persona

## Objetivo

Hasta ahora, Specty daba por hecho que una terminal real era la persona. Pero Codex deja que el modelo abra una pseudo-terminal (`exec_command` con `tty: true`) y escriba en ella (`write_stdin`), y Codex no manda `PreToolUse` para lo que se escribe. Así, el agente podía teclear `specty approve`, o incluso `specty delegate on`, sin que el guard lo viera, y contestar él mismo la pregunta. Ahora una terminal solo cuenta como persona si además el entorno no delata a un agente (`CLAUDECODE`, `CURSOR_AGENT`, `GEMINI_CLI`, `CODEX_*`, `OPENCODE` o `SPECTY_AGENT`), y Codex se reconoce también por `CODEX_CI` y `CODEX_THREAD_ID`, que pone en todos sus comandos, incluso fuera del sandbox. Las variables solo quitan permisos; ninguna convierte al agente en persona (ARCHITECTURE §4).

## Archivos

- modificar packages/core/src/agents.ts — Codex por `CODEX_CI` y `CODEX_THREAD_ID`, y `personAtTerminal`
- modificar packages/core/test/cards.test.ts — tests de la detección y de `personAtTerminal`
- modificar packages/cli/src/terminal.ts — la terminal del sistema usa `personAtTerminal` con el entorno
- modificar packages/cli/src/main.ts — pasa el entorno a la terminal del sistema
- modificar docs/ARCHITECTURE.md — §4: una terminal real con el entorno de un agente es del agente

## Tareas

- [x] T1: Una terminal con el entorno de un agente no cuenta como persona
  - files: packages/core/src/agents.ts, packages/core/test/cards.test.ts, packages/cli/src/terminal.ts, packages/cli/src/main.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts && pnpm --filter @baquia-dev/specty typecheck

## Cierre

### Resumen

Codex se detecta también por CODEX_CI y CODEX_THREAD_ID; personAtTerminal (core) exige TTY sin entorno de agente y systemTerminal(env) la usa; ARCHITECTURE §4 lo explica. El test de gentle-ai ya no depende del nombre de la carpeta.
