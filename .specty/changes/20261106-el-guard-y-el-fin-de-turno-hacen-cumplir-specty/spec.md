---
kind: standard
epic: 20261106-los-agentes-siempre-esperan-la-decision-de-la
slice: C2
---

# El guard no deja esperar en primer plano ni con `sleep`

## Objetivo

Hoy el guard deja que el agente de Claude Code ejecute `specty wait` en primer plano, que ocupa su herramienta hasta el límite del comando, y que cualquier agente espere a la persona con `sleep`. Con este cambio, el guard rechaza un `specty wait` de Claude Code sin `run_in_background: true` y pide ese parámetro, y rechaza los comandos con `sleep` mientras el cambio de la carpeta espera a la persona y pide `specty wait`. La negativa de los comandos de la persona también pide `specty wait` con la frase común, en la forma de la herramienta del agente.

## Fuera de alcance

- El fin de turno que devuelve al agente a esperar: es el corte C4.
- Instalar el fin de turno en `init` y avisar en `doctor`: son los cortes C5 y C6.
- Frenar `specty wait` en primer plano en las demás herramientas (Cursor con `block_until_ms`, OpenCode con `background`): AC4 de la épica solo pide Claude Code, y su guard no recibe hoy ese dato de ellas.
- Leer `sleep` dentro de otro intérprete (`bash -c "sleep 5"`, `node -e …`) o tras programas que no son envoltorios (`timeout 5 sleep 10`).
- Cambiar cómo lee el guard el programa de un comando tras `do`, `then` o `{` para las demás reglas: solo lo hace la de `sleep`.
- Cambiar la frase de `specty wait` o su tabla por herramienta (`waitStep`, `WAIT_HABITS`): son del corte C1.

## Supuestos

- A1: En Claude Code, el guard no puede pasar `specty wait` a segundo plano sin saltarse los permisos de la persona: `updatedInput` solo se aplica con `permissionDecision: "allow"`, que se salta su pregunta de permisos, o con `"ask"`, que se la hace cada vez. El módulo de Claude Code ya bloquea en vez de reescribir (no tiene `redirect`, `docs/ARCHITECTURE.md` §10). Por eso el guard lo rechaza y pide `run_in_background: true`.
  - impacto: alto
- A2: El freno de `wait` en primer plano mira el `run_in_background` que Claude Code manda en la entrada de `Bash`, y rige aunque el cambio no espere a la persona. En ese caso `wait` devuelve enseguida la tarjeta de `next`, también en segundo plano.
  - impacto: medio
- A3: Un cambio espera a la persona como lo calcula `wait` (`isWaitingForHuman` de `commands/wait.ts`, que pasa a exportarse): su fase es de la persona o tiene solicitudes de alcance pendientes. Es el cambio de la carpeta cuyo cambio juzga el guard, la que la conversación entró si entró en una.
  - impacto: alto
- A4: Un comando espera con `sleep` cuando alguno de sus comandos simples ejecuta el programa `sleep`, también tras las palabras que abren un comando compuesto o una rama (`if`, `then`, `elif`, `else`, `while`, `until`, `do`, `!`, `{`), tras asignaciones y tras los envoltorios que ya salta el análisis (`env`, `nohup`, `time`…). Es de mejor esfuerzo, como las demás reglas del shell.
  - impacto: medio
- A5: En modo delegado, el freno de `sleep` pide `specty next` en vez de `specty wait`, porque esperar en modo delegado lo que `SIGUIENTE:` pide ejecutar al agente queda fuera de la épica, y `next` dice si decide él o espera a la persona. `specty status` y `specty next` no se frenan nunca.
  - impacto: medio
- A6: Los textos del guard dicen cómo esperar según la herramienta del guard (`--tool`), no la que detecta el entorno. Por eso el contexto del guard lleva esa herramienta, y `waitStep` acepta solo el idioma, el comando y la herramienta.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente de Claude Code ejecuta un comando de shell con `specty wait` sin `run_in_background: true` ENTONCES el guard lo rechaza y su `SIGUIENTE:` pide lanzarlo de nuevo en segundo plano (`run_in_background: true`) y repetirlo cada vez que se agote o se corte. CUANDO lo ejecuta con `run_in_background: true`, o ejecuta otro comando en primer plano ENTONCES el guard lo deja pasar.
- AC2: CUANDO el cambio de la carpeta espera a la persona y el agente ejecuta un comando de shell con `sleep` ENTONCES el guard lo rechaza y su `SIGUIENTE:` pide `specty wait` con la frase común en la forma de su herramienta, o `specty next` en modo delegado. CUANDO el cambio no espera a la persona, no hay cambio o el comando es `specty status` o `specty next` sin `sleep` ENTONCES el guard lo deja pasar.
- AC3: CUANDO el guard niega al agente un comando de la persona ENTONCES su `SIGUIENTE:` pide que la persona lo ejecute y `specty wait` con la frase común, en la forma de la herramienta del agente.
- AC4: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, `guard/action.ts`: `ShellFacts` gana `sleeps` (algún comando simple ejecuta `sleep`) y `background` (si la herramienta lo ejecuta en segundo plano, solo para la que lo dice). `GuardChange` gana `waiting` (el cambio espera a la persona), `GuardContext` gana `tool` (la herramienta del agente) y `GuardRule` gana `wait`.
- Core, `guard/shell.ts`: `analyzeShell` da `sleeps`, con el programa de cada comando simple tras las palabras de A4, las asignaciones y los envoltorios.
- Core, `cards/wait.ts`: `foregroundWaitDenial(ctx)` y `sleepDenial(id, ctx)` dan la razón y el siguiente paso en español y en inglés, con la frase común de `waitStep` en la forma de la herramienta. `waitStep` y su ayudante privado aceptan solo `lang`, `command` y `tool` de `CardContext`. Las tarjetas que ya lo usan no cambian.
- Core, `guard/decide.ts`: tras la regla de correr fuera de la carpeta, la regla `wait` rechaza un comando con `specty wait` cuyo `background` es `false`, y uno con `sleeps` mientras `change.waiting`. `guard/human.ts` arma su siguiente paso con `waitStep` y la herramienta del contexto.
- CLI: `RawAction` de shell gana `background`, que `shellAction` recibe y que el módulo de Claude Code saca de `run_in_background`. `enforce/place.ts` pasa `sleeps` y `background` a los hechos. `enforce/guard.ts` pone en el contexto la herramienta del guard y, en el cambio, `waiting` con `isWaitingForHuman`.
- Docs: `docs/ARCHITECTURE.md` cuenta las dos reglas donde describe `wait` y las reglas de shell del guard.

## Archivos

- modificar packages/core/src/guard/action.ts — `sleeps` y `background` en los hechos del shell, `waiting` en el cambio, `tool` en el contexto y la regla `wait`
- modificar packages/core/src/guard/shell.ts — `analyzeShell` reconoce los comandos que ejecutan `sleep`
- modificar packages/core/src/guard/decide.ts — la regla `wait`: `specty wait` en primer plano y `sleep` mientras el cambio espera a la persona
- modificar packages/core/src/cards/wait.ts — las negativas de `wait` en primer plano y de `sleep`, en español y en inglés; `waitStep` con solo idioma, comando y herramienta
- crear packages/core/test/guard/wait.test.ts — `sleeps` del análisis del shell y la regla `wait`, en los dos idiomas y en modo delegado
- modificar packages/core/src/guard/human.ts — la negativa de los comandos de la persona pide `specty wait` con `waitStep`
- modificar packages/core/test/guard/decide.test.ts — el siguiente paso de esa negativa con la frase común
- modificar packages/cli/src/enforce/actions.ts — `background` en la acción de shell y en `shellAction`
- modificar packages/cli/src/agents/claude-code.ts — `run_in_background` de `Bash` llega como `background`
- modificar packages/cli/src/enforce/place.ts — `sleeps` y `background` en los hechos del shell
- modificar packages/cli/src/enforce/guard.ts — la herramienta del guard en su contexto y `waiting` en el cambio
- modificar packages/cli/src/commands/wait.ts — exporta `isWaitingForHuman`
- crear packages/cli/test/wait-guard.test.ts — el guard de Claude Code ante `specty wait` en primer plano y ante `sleep`, con el cambio esperando a la persona o no
- modificar docs/ARCHITECTURE.md — las reglas `wait` del guard

## Tareas

- [x] T1: El guard de core rechaza `specty wait` en primer plano y `sleep` mientras el cambio espera a la persona
  - files: packages/core/src/guard/action.ts, packages/core/src/guard/shell.ts, packages/core/src/guard/decide.ts, packages/core/src/cards/wait.ts, packages/core/test/guard/wait.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/wait.test.ts
  - type: feat
- [x] T2: La negativa de los comandos de la persona pide `specty wait` con la frase común
  - files: packages/core/src/guard/human.ts, packages/core/test/guard/decide.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts
  - type: feat
- [x] T3: El guard de Claude Code lee `run_in_background` y rechaza `specty wait` sin él
  - files: packages/cli/src/enforce/actions.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/enforce/place.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/wait-guard.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/wait-guard.test.ts -t AC1
  - type: feat
- [ ] T4: El guard sabe si el cambio de la carpeta espera a la persona y frena `sleep`
  - files: packages/cli/src/commands/wait.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/wait-guard.test.ts, docs/ARCHITECTURE.md
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/wait-guard.test.ts && pnpm typecheck && pnpm lint
  - type: feat

## Riesgos

- R1: El freno de `sleep` puede frenar un uso legítimo mientras el cambio espera a la persona. En esa espera el código está bloqueado y no hay nada que esperar con `sleep`, y la negativa dice qué usar.
- R2: Un agente puede esquivar el freno con `sleep` dentro de otro intérprete. Es de mejor esfuerzo como las demás reglas del shell, y el fin de turno de C4 lo devuelve a esperar con `specty wait`.
- R3: El corte C4 también toca `core/src/cards/wait.ts` y puede exportar `isWaitingForHuman` en paralelo. Este cambio solo añade funciones en ese archivo y cambia el tipo del contexto de `waitStep`, y exportar la función es el mismo cambio en las dos ramas.
