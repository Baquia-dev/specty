---
kind: quick
---

# init lleva el fin de turno de Claude Code al archivo de ajustes nuevo, con su check

## Objetivo

Resuelve P221. En Claude Code, `init` pone el guard en `.claude/settings.local.json` si el comando de Specty lleva una ruta local, y en `.claude/settings.json` si es `specty` del PATH; cuando cambia de uno a otro, quita del archivo anterior el guard y el `memory-stop`, pero deja su `hook agent-stop claude-code`, y el plan del fin de turno pone otro en el archivo nuevo: quedan dos fines de turno. Con este cambio, la limpieza del archivo anterior quita también su `agent-stop`, y ese fin de turno pasa al archivo nuevo con el comando del guard y su límite de tiempo; si no llevaba `--no-check` (venía de `check --install`), el del archivo nuevo sigue sin la marca y corre el check. Si el archivo nuevo ya tenía su propio fin de turno, se queda ese, y pierde la marca si el del archivo anterior corría el check. Codex comparte `blockingStop` pero tiene un solo archivo de hooks (`.codex/hooks.json`), así que no le pasa y no cambia.

## Archivos

- modificar packages/cli/src/install/agents.ts — `withoutTurnEnd` quita el fin de turno de un agente del `Stop` de un archivo de hooks, y `withTurnEndFrom` lo lleva al archivo nuevo con el comando del guard, su límite de tiempo y su check
- modificar packages/cli/src/agents/claude-code.ts — `install` quita el `agent-stop` del archivo de ajustes anterior y lo lleva al nuevo
- crear packages/cli/test/init-agent-stop-move.test.ts — al cambiar de archivo, el fin de turno queda una vez, en el archivo nuevo, con su comando, su límite de tiempo y su check, en los dos sentidos, y los hooks de la persona se quedan
- modificar docs/ARCHITECTURE.md — la fila de Claude Code cuenta que el fin de turno cambia de archivo con el guard

## Tareas

- [ ] T1: init lleva el fin de turno de Claude Code al archivo de ajustes nuevo, con su check
  - files: packages/cli/src/install/agents.ts, packages/cli/src/agents/claude-code.ts, packages/cli/test/init-agent-stop-move.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-agent-stop-move.test.ts test/init-agent-stop.test.ts test/init-agents.test.ts test/check-agent-stop.test.ts && pnpm typecheck && pnpm lint
  - type: fix
