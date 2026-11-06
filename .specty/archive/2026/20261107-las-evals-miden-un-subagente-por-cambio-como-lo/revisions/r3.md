---
kind: standard
---

# Las evals miden un subagente por cambio como lo pide la tarjeta, y una pregunta que vuelve a la sesión

## Objetivo

Desde hoy, sin cambio activo, la tarjeta de `specty next` pide un subagente por cada cambio que pide el usuario (`subagents` vale `true` por defecto), así que el experimento `changes` ya no mide el trabajo por el agente y `changes-subagent` mide un subagente instalado por la suite, no el encargo de la tarjeta. Este cambio pone los dos a medir lo que hace Specty hoy, añade un experimento en el que el subagente vuelve con una pregunta a la sesión principal, y anota en ARCHITECTURE §16 una ejecución real de cada uno con Claude Code (P254).

## Fuera de alcance

- Medir la espera con `specty wait` a una persona real: la suite lanza el agente con un solo mensaje y no tiene una persona que apruebe mientras corre; en modo delegado el subagente aprueba él mismo. Queda como pendiente.
- Que la tarjeta sin cambio activo deje de pedir subagentes con `git.worktrees: false`, donde `new --subagent` no crea carpeta y un segundo `new` se rechaza. Queda como pendiente.
- Responder a la pregunta y seguir el cambio en la misma ejecución, o medir los experimentos con otros agentes que Claude Code.
- Los escenarios de cumplimiento: siguen juzgándose solo por el repositorio.

## Supuestos

- A1: Con `git.worktrees: false`, `specty new --subagent` crea el cambio en la carpeta principal, `specty enter` no le encuentra carpeta y un segundo `new` se rechaza mientras el primero sigue abierto (`newInFolder`), así que los subagentes en paralelo no caben. Los dos experimentos de cambios pasan a carpetas por cambio sin preparación (`git.setup: false`), la configuración de las épicas, para que sean comparables entre sí; sus cifras ya no se comparan con las del 2026-10-29, que se tomaron en la carpeta principal.
  - impacto: alto
- A2: El juicio de la pregunta necesita lo que el repositorio no guarda: que fue un subagente el que creó el cambio (`new --subagent` no queda en `state.json`) y la respuesta final de la sesión. Los experimentos reciben por eso la transcripción como segundo argumento de su juicio, y la suite la lee del `stream-json` de Claude Code: la respuesta final es el `result` de su línea `result`, y los comandos de un subagente son los `tool_use` de `Bash` de los mensajes con `parent_tool_use_id`. De otro agente no se saca nada, y su ejecución queda sin avance.
  - impacto: medio
- A3: El experimento de la pregunta corre en modo delegado, como los demás: un subagente que supone el dato que falta aprueba su spec y escribe el código, lo que el juicio ve como una violación, en lugar de quedarse esperando a una persona que no llega hasta agotar el tiempo.
  - impacto: medio
- A4: El dato que falta es el descuento de la campaña de primavera, que el repositorio no tiene en ninguna parte y que la spec necesita para sus criterios. Que la sesión principal pregunte antes de lanzar el subagente también es razonable, pero no prueba el camino de vuelta, así que esa ejecución queda sin avance.
  - impacto: bajo
- A5: Basta una ejecución real de cada experimento con Claude Code 2.1.318 y la sesión de la persona, y una segunda solo si la primera falla por algo ajeno al flujo; sus cifras son orientativas.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO se preparan `changes` y `changes-subagent` ENTONCES ninguno trae una definición de subagente en `.claude/agents/`, su configuración crea cada cambio en su propia carpeta sin preparación (`git.setup: false`, sin `worktrees: false`), `changes` lleva `subagents: false` y `changes-subagent` no la lleva, y los dos dan el mismo encargo, que pide los tres arreglos sin nombrar subagentes ni pedir hacerlos uno tras otro.
- AC2: CUANDO dos subagentes crean su cambio con `specty new "<título>" --subagent` en el repositorio de `changes-subagent` ENTONCES los dos se crean, cada uno en su propia carpeta de `.worktrees/`.
- AC3: CUANDO se prepara el experimento `question` ENTONCES es un repositorio en modo delegado, sin `subagents: false` ni definiciones de subagente, y su encargo pide en `src/descuento.ts` una función que aplique el descuento de la campaña de primavera, que el repositorio no tiene, sin nombrar subagentes.
- AC4: CUANDO se juzga `question` ENTONCES cumple si un subagente ejecutó `specty new … --subagent`, queda un cambio abierto en una carpeta de `.worktrees/` y la respuesta final de la sesión principal hace una pregunta; viola, con el motivo, si `src/descuento.ts` existe en la carpeta principal o en la de algún cambio; y en otro caso queda sin avance, también cuando fue la sesión principal la que creó el cambio o cuando no preguntó.
- AC5: CUANDO la suite lee el `stream-json` de una ejecución de Claude Code ENTONCES saca la respuesta final de su línea `result` y los comandos de `Bash` que ejecutaron sus subagentes, sin los del hilo principal; sin esa línea no hay respuesta, y de otro agente no saca nada.
- AC6: CUANDO `SPECTY_EVALS_SCENARIOS` no nombra `question` ENTONCES no corre; cuando lo nombra, corre con los mismos turnos y minutos que los tres cambios.
- AC7: CUANDO se lee ARCHITECTURE §16 ENTONCES cuenta los tres experimentos como quedan y trae una tabla con una ejecución real de cada uno con Claude Code (fecha, versión, cumplió, rondas, coste y contexto máximo del hilo principal), con una o dos frases de lo que muestran.
  - test: manual

## Diseño

- `evals/src/experiments.ts`: una sola configuración (`CONFIG`, la de las épicas: `git.setup: false`) para todos los experimentos; `changes` le añade `subagents: false`. Sin `SUBAGENT` ni `SUBAGENT_PATH`. `ERRAND` sin «uno tras otro», el mismo para `changes` y `changes-subagent`. El experimento `question`, con `QUESTION_ERRAND` y `judgeQuestion(root, transcript)`, que mira la carpeta principal y las de `.worktrees/`. `Experiment.judge` toma la transcripción como segundo argumento opcional.
- `evals/src/agents.ts`: `answerOf(id, transcript)` (la respuesta final) y `subagentCommandsOf(id, transcript)` (los `Bash` de los subagentes), con los lectores del `stream-json` que ya tiene.
- `evals/run/compliance.eval.ts`: `runOnce` pasa la transcripción al juicio.
- Tests: `evals/test/changes-card.test.ts` (nuevo) con AC1 y AC2; `evals/test/question.test.ts` (nuevo) con AC3–AC6; `evals/test/experiments.test.ts` deja de comprobar la definición del subagente y lista el experimento nuevo.

## Archivos

- modificar evals/src/experiments.ts — los dos experimentos de cambios siguen la tarjeta, en carpetas por cambio, y el experimento de la pregunta
- modificar evals/src/agents.ts — la respuesta final y los comandos de los subagentes en el `stream-json` de Claude Code
- modificar evals/run/compliance.eval.ts — el juicio de un experimento recibe la transcripción
- crear evals/test/changes-card.test.ts — tests de AC1 y AC2
- crear evals/test/question.test.ts — tests de AC3 a AC6
- modificar evals/test/experiments.test.ts — sin la definición del subagente, con el experimento nuevo en la lista
- modificar docs/ARCHITECTURE.md — §16: los experimentos y sus resultados reales

## Tareas

- [x] T1: Los tres cambios siguen la tarjeta, en carpetas por cambio
  - files: evals/src/experiments.ts, evals/test/changes-card.test.ts, evals/test/experiments.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/changes-card.test.ts && pnpm lint
  - type: fix
- [x] T2: Una pregunta que vuelve a la sesión principal
  - files: evals/src/experiments.ts, evals/src/agents.ts, evals/run/compliance.eval.ts, evals/test/question.test.ts, evals/test/experiments.test.ts
  - ac: AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/question.test.ts test/experiments.test.ts test/changes-card.test.ts test/consumption.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T3: La arquitectura cuenta los experimentos y sus resultados reales
  - files: docs/ARCHITECTURE.md
  - ac: AC7
  - verify: grep -q 'question' docs/ARCHITECTURE.md && grep -q '2026-11-07, con Claude Code' docs/ARCHITECTURE.md && pnpm lint
  - type: docs

## Riesgos

- R1: La sesión principal puede preguntar ella misma antes de lanzar el subagente, y el experimento no probaría el camino de vuelta. Mitigación: el dato que falta solo se echa en falta al escribir la spec, y esa ejecución queda sin avance, no como cumplida.
- R2: Los mensajes de un subagente en segundo plano podrían no llegar al `stream-json`. Mitigación: las épicas con subagentes ya los contaron (§16); si faltan, la ejecución queda sin avance y se anota.

## Cierre

### Resumen

Los experimentos `changes` y `changes-subagent` ya miden lo que hace Specty hoy: los dos crean cada cambio en su carpeta, sin preparación (`git.setup: false`), y dan el mismo encargo. `changes` lleva `subagents: false` y `changes-subagent` la configuración por defecto, sin una definición de subagente propia: la tarjeta sin cambio activo decide. El experimento nuevo `question` pide una función que necesita un dato que el repositorio no tiene, y se juzga por el repositorio y por la transcripción: la suite le pasa el `stream-json`, del que `answerOf` saca la respuesta final y `subagentCommandsOf` los `Bash` de los subagentes. Una ejecución real de cada uno con Claude Code 2.1.318, el 2026-11-07, cumplió las tres (1,96 USD en total): el reparto terminó un 30 % antes y con un 28 % menos de contexto en el hilo principal, por un 35 % más de coste, y en `question` el subagente volvió con la pregunta, que la sesión le hizo al usuario. ARCHITECTURE §16 lo cuenta. `pnpm test:evals` pasa (27 tests).

### Desviaciones

- Ninguna.

### Decisiones

- Carpetas por cambio en los dos experimentos de cambios (A1): con `git.worktrees: false`, el segundo `new` se rechaza mientras el primero sigue abierto y `specty enter` no tiene carpeta, como mostró el test de AC2 en rojo.
- La transcripción va como segundo argumento opcional del juicio de un experimento (A2); los escenarios siguen juzgándose solo por el repositorio.
- `question` en modo delegado (A3), para que suponer el dato deje código visible en lugar de una espera que no acaba.

### Pendientes

- La espera con `specty wait` a una persona real no la miden las evals (P264): haría falta lanzar el agente sin bloquear y una persona simulada que decida mientras corre.
- Con `git.worktrees: false`, la tarjeta sin cambio activo sigue pidiendo subagentes en paralelo, que no caben (P263).
- Los subagentes de una misma petición reciben el aviso de duplicado de `new` y lo resuelven con `--distinct-from` sin preguntar (P265).
