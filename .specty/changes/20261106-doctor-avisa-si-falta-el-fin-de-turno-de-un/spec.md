---
kind: standard
epic: 20261106-los-agentes-siempre-esperan-la-decision-de-la
slice: C6
---

# `doctor` avisa si falta el fin de turno de un agente

## Objetivo

Desde C5, `specty init` instala el fin de turno de cada agente (`hook agent-stop <agente> --no-check`), que lo devuelve a esperar con `specty wait` cuando el cambio espera a la persona. Una instalación anterior puede no tenerlo, y entonces el agente termina su turno sin esperar. Con este cambio, `specty doctor` lo dice para cada agente instalado al que le falta y explica que se arregla volviendo a ejecutar `specty init`.

## Fuera de alcance

- Escribir el fin de turno desde `doctor`: lo escribe `init` (C5).
- Pedir `check --install` o avisar de que el fin de turno no ejecuta `check --changed`: eso sigue siendo decisión de la persona.
- Comprobar el evento, el tiempo límite o el comando de Specty del fin de turno que ya está.
- El fin de turno en la carpeta del usuario (por ejemplo, los hooks de Codex en `~/.codex`), que Specty solo lee.
- Copilot, que no tiene un fin de turno que haga seguir al agente.

## Supuestos

- A1: Un agente tiene su fin de turno cuando el archivo de hooks donde está su guard lleva `hook agent-stop <agente>`, con `--no-check` (el de `init`) o sin la marca (el de `check --install`). `doctor` lo busca en el texto de los mismos archivos que ya lee para cada agente, como hace con la red de la memoria (`memoryStopLines`): los dos archivos de ajustes de Claude Code, `.codex/hooks.json` del proyecto, `.cursor/hooks.json`, `.gemini/settings.json`, `.devin/hooks.v1.json` y `.agents/hooks.json`.
  - impacto: alto
- A2: El plugin de OpenCode siempre contiene el texto `hook agent-stop opencode`, así que allí cuenta su constante `STOP`. Con `null` (o en un plugin anterior a `STOP`), el fin de turno está apagado y `doctor` lo dice. `CHECK` no cuenta.
  - impacto: alto
- A3: La línea es un problema, como la de la red de la memoria (`memory-stop`): `doctor` sale con 1, y no hay una línea buena cuando el fin de turno está. Solo sale si el guard del agente está en su archivo. Sin el guard, `doctor` ya da la línea del guard, que se arregla con el mismo `init`.
  - impacto: medio
- A4: Se arregla volviendo a ejecutar `specty init`, que vuelve a configurar los agentes detectados y escribe el fin de turno de cada uno con `--no-check` (C5), como pide ya la línea de la red de la memoria.
  - impacto: medio
- A5: Las demás líneas de `doctor` de cada agente siguen igual. Un plugin de OpenCode anterior al fin de turno de OpenCode 2.2 y con `STOP` apagado da las dos líneas, `opencode-turn-end` y la nueva, y el mismo `init` arregla las dos.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el guard de Claude Code, Codex, Cursor, Gemini CLI, Devin o Antigravity está en su archivo de hooks y ese archivo no tiene `hook agent-stop <agente>` ENTONCES `doctor` lo dice como problema del agente, con que se arregla con `specty init`, y sale con 1.
- AC2: CUANDO el plugin de OpenCode tiene el guard y `STOP` apagado ENTONCES `doctor` dice lo mismo de OpenCode. CUANDO `STOP` está puesto, con `CHECK` encendido o apagado ENTONCES no lo dice.
- AC3: CUANDO el fin de turno está en el archivo de hooks del agente, con `--no-check` (de `init`) o sin la marca (de `check --install`) ENTONCES `doctor` no lo dice.
- AC4: CUANDO `doctor` dice que falta el fin de turno de un agente ENTONCES la línea sale en español y en inglés, con el nombre del agente.

## Diseño

- Core: la línea `agent-stop` (con `tool`) va en `DoctorLine`, en el mismo tipo que `memory-stop`, y su texto en `AGENT_WRITERS` de `cards/doctor-agents.ts`, en español y en inglés: «`<Agente>`: falta el fin de turno de Specty (`hook agent-stop`), que devuelve al agente a `specty wait` cuando el cambio espera a la persona; ejecuta `specty init`».
- `install/agents.ts`: `memoryStopLines` pasa a ser `stopLines(texts, tool, hooks)`, que da la línea de cada fin de turno de Specty (`memory-stop` o `agent-stop`) que les falta a los archivos de `tool` cuando su guard está en alguno. Claude Code y Codex piden los dos, y Cursor, Gemini CLI, Devin y Antigravity solo `agent-stop`.
- Cada `doctor` de `agents/` añade esas líneas a sus problemas. En Gemini CLI, Devin y Antigravity se añaden también cuando faltan otros hooks del guard, y no cuando falta el guard.
- OpenCode: `install/opencode.ts` exporta `stopOf`, que lee `STOP` del plugin, y `agents/opencode.ts` da la línea cuando el guard está y `STOP` está apagado.
- Docs: `docs/ARCHITECTURE.md` («Fin de turno») cuenta que `doctor` avisa (`agent-stop`).

## Archivos

- modificar packages/core/src/cards/doctor.ts — la línea `agent-stop` de `doctor`, con la de `memory-stop`
- modificar packages/core/src/cards/doctor-agents.ts — el texto de la línea `agent-stop`, en español y en inglés
- crear packages/core/test/cards/doctor-agent-stop.test.ts — la línea en español y en inglés
- modificar packages/cli/src/install/agents.ts — `stopLines`: las líneas de los fines de turno de Specty que faltan junto al guard, en lugar de `memoryStopLines`
- modificar packages/cli/src/agents/claude-code.ts — `doctor` avisa si falta el fin de turno, además de la red de la memoria
- modificar packages/cli/src/agents/codex.ts — `doctor` avisa si falta el fin de turno, además de la red de la memoria
- modificar packages/cli/src/agents/cursor.ts — `doctor` avisa si falta el fin de turno
- modificar packages/cli/src/agents/gemini-cli.ts — `doctor` avisa si falta el fin de turno
- modificar packages/cli/src/agents/windsurf.ts — `doctor` avisa si falta el fin de turno
- modificar packages/cli/src/agents/antigravity.ts — `doctor` avisa si falta el fin de turno
- crear packages/cli/test/doctor-agent-stop.test.ts — `doctor` y el fin de turno de los agentes con hooks en JSON: falta, está con `--no-check` y está sin la marca
- modificar packages/cli/src/install/opencode.ts — exporta `stopOf`, que lee `STOP` del plugin
- modificar packages/cli/src/agents/opencode.ts — `doctor` avisa si el plugin tiene `STOP` apagado
- crear packages/cli/test/doctor-opencode-stop.test.ts — `doctor` y el fin de turno del plugin de OpenCode, con `STOP` apagado y puesto
- modificar docs/ARCHITECTURE.md — `doctor` avisa si falta el fin de turno

## Tareas

- [x] T1: La línea de `doctor` cuando falta el fin de turno de un agente, en español y en inglés
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/test/cards/doctor-agent-stop.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor-agent-stop.test.ts
  - type: feat
- [x] T2: `doctor` avisa si falta el fin de turno en los hooks de Claude Code, Codex, Cursor, Gemini CLI, Devin y Antigravity
  - files: packages/cli/src/install/agents.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/codex.ts, packages/cli/src/agents/cursor.ts, packages/cli/src/agents/gemini-cli.ts, packages/cli/src/agents/windsurf.ts, packages/cli/src/agents/antigravity.ts, packages/cli/test/doctor-agent-stop.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-agent-stop.test.ts test/memory-stop-install.test.ts
  - type: feat
- [ ] T3: `doctor` avisa si el plugin de OpenCode tiene el fin de turno apagado, y la documentación lo cuenta
  - files: packages/cli/src/install/opencode.ts, packages/cli/src/agents/opencode.ts, packages/cli/test/doctor-opencode-stop.test.ts, docs/ARCHITECTURE.md
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-opencode-stop.test.ts && pnpm typecheck && pnpm lint
  - type: feat

## Riesgos

- R1: Los proyectos que ya usan Specty verán en `doctor` un problema nuevo hasta que vuelvan a ejecutar `init`. La línea dice qué falta y cómo arreglarlo, y el fin de turno que escribe `init` no ejecuta `check --changed`.
