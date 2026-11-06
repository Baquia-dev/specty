---
kind: quick
---

# init pone el comando nuevo de Specty en el fin de turno que ya estaba

## Objetivo

Cuando `init` cambia el comando con que se llama a Specty (de `specty` a `node "<ruta>/specty.mjs"` o al revés, o de una ruta a otra) en un agente con un solo archivo de hooks (Codex, Cursor, Gemini CLI, Devin y Antigravity), reescribe el guard, pero el `hook agent-stop <agente>` que ya estaba se queda con el comando viejo, porque `jsonStop` salta el archivo que ya lo contiene (P230). Con este cambio, el plan del fin de turno (el de `init` y el de `check --install`) le pone al que ya está el comando del guard, conservando su `--no-check` o su ausencia (el que venía de `check --install` sigue con su check) y su límite de tiempo. Generaliza lo que P221 hizo para Claude Code entre sus dos archivos: una sola función, `withTurnEnds`, cambia el comando y la marca de los fines de turno, y la usan `jsonStop` y `withTurnEndFrom`, que deja de tener las suyas. El plugin de OpenCode ya sale bien, porque `init` lo escribe entero con el comando nuevo y conserva `STOP` y `CHECK`: el test lo comprueba.

## Archivos

- modificar packages/cli/src/agents/adapter.ts — `jsonStop` pone el comando del guard en el fin de turno que ya está, con `withTurnEnds`, que sustituye a `withCheck`
- modificar packages/cli/src/install/agents.ts — `withTurnEndFrom` cambia comandos y marca con `withTurnEnds`, también en el fin de turno que ya estaba en el archivo nuevo, y deja de tener su `withCommands`
- modificar packages/cli/test/init-agent-stop.test.ts — al cambiar de comando en un sentido y en el otro, cada fin de turno de los cinco agentes y el de OpenCode tienen el comando nuevo, una vez, con su marca o su check y su límite de tiempo; el de Claude Code en el mismo archivo también
- modificar docs/ARCHITECTURE.md — el fin de turno cuenta que toma el comando del guard cuando `init` lo cambia

## Tareas

- [x] T1: El fin de turno que ya estaba toma el comando del guard
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/install/agents.ts, packages/cli/test/init-agent-stop.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-agent-stop.test.ts test/init-agent-stop-move.test.ts test/check-agent-stop.test.ts && pnpm typecheck && pnpm lint
