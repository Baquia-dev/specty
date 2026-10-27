---
kind: standard
---

# init pregunta los agentes con selección múltiple y marca los detectados

## Objetivo

Hoy `specty init` solo pregunta por el agente cuando no detecta ninguno, y la persona elige uno solo. Con este cambio, una persona en la terminal siempre ve la lista de agentes con los detectados ya marcados, y puede marcar o desmarcar varios antes de confirmar. Así confirma lo que Specty encontró y añade los que usa sin recurrir a `--tools`.

## Fuera de alcance

- Quitar el guard de un agente que la persona desmarca y ya estaba instalado: para eso está `specty uninstall`.
- Guardar en `.specty/config.yaml` qué agentes se eligieron.
- Cambiar cómo se detectan los agentes por sus archivos o por el entorno.
- La pregunta del idioma, que sigue siendo de una sola opción.
- El nombre de las ramas y el flujo de git, que van en un cambio aparte.

## Supuestos

- A1: La pregunta aparece siempre que hay una persona en la terminal y no se pasa `--tools` ni `--dry-run`, también al repetir `init` en un repositorio ya instalado, porque desde ella se pueden añadir agentes.
  - impacto: alto
- A2: La lista exige al menos un agente marcado: Specty sin guard no hace cumplir nada. Si la persona cancela, se instalan los detectados, o Claude Code si no había ninguno, como hoy.
  - impacto: medio
- A3: El orden de la lista no cambia (Claude Code primero, como `AGENT_NAMES`); los detectados se distinguen por estar marcados y por la etiqueta «detectado».
- A4: Un agente o una terminal delegada no responden la pregunta: siguen instalando los detectados y el agente del entorno, o Claude Code con el aviso.

## Criterios de aceptación

- AC1: CUANDO una persona en la terminal ejecuta `init` sin `--tools` ni `--dry-run` ENTONCES `init` le pregunta, después del idioma, con qué agentes trabaja, en una lista de selección múltiple con todas las herramientas y Claude Code primero.
- AC2: CUANDO `init` detecta agentes por sus archivos o por el entorno ENTONCES esos aparecen marcados al abrir la pregunta y su etiqueta dice «detectado»; si no detecta ninguno, la pregunta lo dice y no hay ninguno marcado.
- AC3: CUANDO la persona confirma varios agentes ENTONCES `init` instala el guard de cada uno de los marcados y de ninguno de los desmarcados, aunque se hubieran detectado.
- AC4: CUANDO la persona cancela la pregunta ENTONCES `init` instala los detectados o, si no había ninguno, Claude Code.
- AC5: CUANDO nadie puede responder (un agente o `--dry-run`) o se pasa `--tools` ENTONCES `init` se comporta como hasta ahora: sin pregunta, con los detectados y el del entorno, Claude Code con aviso, o solo los de `--tools`.
- AC6: CUANDO se lee ARCHITECTURE §14 ENTONCES dice que la persona en la terminal siempre elige los agentes en una lista múltiple con los detectados marcados.

## Diseño

- CLI, `session.ts`: `Terminal` gana `chooseMany(message, options, initial)`, que devuelve los valores marcados o `undefined` si nadie responde o se cancela.
  - La terminal del sistema (`terminal.ts`) usa `multiselect` de `@clack/prompts`, ya instalado, con `initialValues` y `required: true`.
  - La terminal delegada, la de los hooks (`enforce/entry.ts`) y la pantalla de la UI (`server/actions.ts`) devuelven `undefined`: ninguna elige por la persona.
- Core, `cards/init.ts`:
  - `agentQuestion(detected, lang)` dice que se pueden marcar varios y, sin detectados, que no se detectó ninguno.
  - `agentChoices(detected, lang)` añade «detectado» a la etiqueta de los detectados.
- CLI, `install/hooks.ts`: `agentsToInstall` calcula los encontrados (archivos más entorno).
  - Con una persona y sin `--dry-run`, siempre pregunta con `chooseMany`, con los encontrados marcados.
  - Si cancela, los encontrados o Claude Code. Sin persona, lo de hoy.
- Tests: `person()` de `test/support.ts` responde `chooseMany` con lo guionizado o, por defecto, con lo marcado (o la primera opción si no hay nada marcado), así los tests que ya ejecutan `init` con una persona no cambian.

## Archivos

- modificar packages/core/src/cards/init.ts — pregunta y opciones con los detectados
- modificar packages/core/test/cards/init.test.ts — textos nuevos
- modificar packages/cli/src/session.ts — `Terminal.chooseMany` y la terminal delegada
- modificar packages/cli/src/terminal.ts — `multiselect` de clack
- modificar packages/cli/src/enforce/entry.ts — la terminal de los hooks no elige
- modificar packages/cli/src/server/actions.ts — la pantalla de la UI no elige
- modificar packages/cli/src/install/hooks.ts — `agentsToInstall` siempre pregunta a una persona
- modificar packages/cli/test/support.ts — `chooseMany` en la persona y el agente de prueba
- modificar packages/cli/test/server-actions.test.ts — su terminal de prueba gana `chooseMany`
- modificar packages/cli/test/init-agents.test.ts — la pregunta múltiple
- modificar docs/ARCHITECTURE.md — §14

## Tareas

- [x] T1: los textos de la pregunta múltiple y las opciones con los detectados marcados
  - files: packages/core/src/cards/init.ts, packages/core/test/cards/init.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/init.test.ts
- [x] T2: la terminal sabe preguntar con selección múltiple
  - files: packages/cli/src/session.ts, packages/cli/src/terminal.ts, packages/cli/src/enforce/entry.ts, packages/cli/src/server/actions.ts, packages/cli/test/support.ts, packages/cli/test/server-actions.test.ts
  - ac: AC1, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-actions.test.ts
- [x] T3: init pregunta siempre los agentes a una persona, con los detectados marcados
  - files: packages/cli/src/install/hooks.ts, packages/cli/test/init-agents.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-agents.test.ts
- [x] T4: ARCHITECTURE dice que la persona elige los agentes en una lista múltiple
  - files: docs/ARCHITECTURE.md
  - ac: AC6
  - type: docs

## Riesgos

- R1: Los tests que ejecutan `init` con una persona y comprueban las preguntas exactas reciben una más. Mitigación: la respuesta por defecto de `person()` mantiene lo instalado; los que comparan preguntas se ajustan.
- R2: `terminal.ts` está fuera de la cobertura y no se prueba en Vitest. Mitigación: se comprueba a mano con el CLI compilado en un repositorio de prueba.
