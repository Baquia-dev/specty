---
kind: standard
epic: 20261030-memoria-de-specty
slice: C5
---

# El agente no termina su turno con pendientes sin anotar en la memoria

## Objetivo

La regla del reporte final ya pide anotar cada pendiente con `specty memory add`, pero un agente puede terminar su turno listando pendientes solo en el chat, y se pierden con `/clear` o con una sesión nueva. Con este corte, `specty hook memory-stop <agente>` lee el último mensaje del agente al terminar su turno. Si lista pendientes que no están en la memoria de Specty, le devuelve el turno una sola vez para que los anote o diga que no hace falta. Es el AC10 de la épica, para los agentes cuyo fin de turno trae el último mensaje: Claude Code y Codex.

## Fuera de alcance

- Instalar el hook con `specty init`, quitarlo con `uninstall` y que `doctor` avise si falta: va en el cambio que sigue a este.
- Los agentes cuyo fin de turno no trae el último mensaje (Cursor, OpenCode, Antigravity, Gemini CLI y Devin): su documentación no lo da, y quedan sin red.
- Juzgar con un modelo si una frase es un pendiente: Specty solo mira las listas bajo un encabezado de pendientes.

## Supuestos

- A1: El fin de turno de Claude Code y el de Codex traen el texto final del agente en `last_assistant_message`, según su documentación (consultada el 2026-11-03), y los dos devuelven el turno con `{"decision":"block","reason":…}`, marcando el segundo fin de turno con `stop_hook_active`, como ya usa `blockingStop`.
  - impacto: alto
- A2: Un pendiente del mensaje es cada viñeta de primer nivel (`-`, `*`, `•` o `1.`) bajo un encabezado de pendientes: una línea sola, con `#`, en negrita o acabada en `:`, que dice «Pendientes», «Qué queda pendiente», «Lo que queda», «Próximos pasos», «Pending», «Follow-ups», «Next steps» o «To do», sin tildes ni mayúsculas. La lista acaba en la primera línea que no es una viñeta ni está en blanco.
  - impacto: alto
- A3: No cuenta un pendiente que ya está en la memoria, con la misma regla que los pendientes del cierre (`harvestable`): el que cita el id de una entrada, el que dice que no queda ninguno o el que repite el texto de una entrada abierta.
- A4: Una sola vez por turno: con `stop_hook_active`, el hook deja terminar. Fuera de un repositorio de Specty, o con un agente sin último mensaje, no dice nada.
- A5: Es un hook aparte de `agent-stop`, que ejecuta `specty check --changed` y solo instala `check --install`: la red de la memoria es barata y debe llegar a todos, sin que todos paguen la verificación.

## Criterios de aceptación

- AC1: CUANDO Claude Code o Codex terminan un turno cuyo último mensaje lista pendientes que no están en la memoria de Specty ENTONCES `specty hook memory-stop <agente>` le devuelve el turno con esos pendientes y le pide anotarlos con `specty memory add` y citar su id, o decir que no hace falta.
- AC2: CUANDO el agente vuelve a terminar el turno que el hook ya le devolvió ENTONCES el hook lo deja terminar sin decir nada.
- AC3: CUANDO el último mensaje no lista pendientes, o todos citan una entrada de la memoria, dicen que no queda ninguno o repiten una entrada abierta ENTONCES el hook deja terminar el turno sin decir nada.

## Diseño

- Core:
  - `memory/turn-end.ts`, nuevo: `pendingInMessage(message)`, las viñetas de primer nivel bajo cada encabezado de pendientes (A2).
  - `cards/memory-turn.ts`, nuevo: `memoryStopReason(items, ctx)`, el texto que devuelve el turno.
- CLI:
  - `AgentAdapter.lastMessage(event)`: el último mensaje, en Claude Code y Codex desde `last_assistant_message` (`lastAssistantMessage` en `adapter.ts`).
  - `enforce/memory-stop.ts`, nuevo: `memoryStop(session, tool, input)`. Con un agente que tiene `stop` y `lastMessage`, y si `stop.acts(event)`, saca los pendientes del mensaje, se queda con los de `harvestable` frente a la memoria y, si queda alguno, responde con `stop.reply`.
  - `enforce/entry.ts` despacha `hook memory-stop <agente>`.

## Archivos

- crear packages/core/src/memory/turn-end.ts — los pendientes que lista un mensaje
- crear packages/core/src/cards/memory-turn.ts — el texto que devuelve el turno
- modificar packages/core/src/index.ts — exporta `pendingInMessage`
- modificar packages/core/src/cards/index.ts — exporta `memoryStopReason`
- crear packages/cli/src/enforce/memory-stop.ts — el hook de fin de turno de la memoria
- modificar packages/cli/src/enforce/entry.ts — despacha `hook memory-stop`
- modificar packages/cli/src/agents/adapter.ts — `lastMessage` y `lastAssistantMessage`
- modificar packages/cli/src/agents/claude-code.ts — su último mensaje
- modificar packages/cli/src/agents/codex.ts — su último mensaje
- crear packages/core/test/memory/turn-end.test.ts — qué viñetas son pendientes, y el texto
- crear packages/cli/test/memory-stop.test.ts — el hook con eventos de Claude Code y de Codex y la memoria real
- modificar docs/ARCHITECTURE.md — la red de la memoria en el fin de turno

## Tareas

- [x] T1: Los pendientes que lista un mensaje, y el texto que devuelve el turno
  - files: packages/core/src/memory/turn-end.ts, packages/core/src/cards/memory-turn.ts, packages/core/src/index.ts, packages/core/src/cards/index.ts, packages/core/test/memory/turn-end.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/turn-end.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: El último mensaje de Claude Code y de Codex
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/codex.ts, packages/cli/test/memory-stop.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts && pnpm typecheck && pnpm lint
- [x] T3: `specty hook memory-stop`, y la documentación
  - files: packages/cli/src/enforce/memory-stop.ts, packages/cli/src/enforce/entry.ts, packages/cli/test/memory-stop.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-stop.test.ts test/check-agent-stop.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un encabezado de pendientes que no lo es devuelve el turno sin motivo — pasa una sola vez por turno, y el agente puede decir que no hace falta anotarlos.
- R2: Un agente lista pendientes sin encabezado, en prosa — no se detectan; la regla del reporte final sigue pidiendo anotarlos.
- R3: Leer la memoria en cada fin de turno — solo cuando el mensaje lista pendientes.
