---
kind: standard
---

# Las evals mantienen viva la sesión de Claude Code mientras el subagente espera a la persona

## Objetivo

El experimento `wait` no llega a medir la espera con `specty wait` (P272): en `claude -p`, cuando el subagente deja la espera en segundo plano, el hilo principal responde, Claude Code mata la espera y el proceso sale antes de que la persona decida. Este cambio lanza Claude Code, en las ejecuciones con una persona que decide, con la entrada en `stream-json` y abierta hasta que la sesión no tiene nada más que hacer, como sigue viva una sesión con interfaz, y anota en ARCHITECTURE §16 una ejecución real del experimento con la sesión viva.

## Fuera de alcance

- Cambiar `specty wait`, sus textos, las tarjetas o la persona simulada.
- Mantener abierta la sesión de otros agentes, o la de Claude Code en los escenarios y en los experimentos sin persona.
- Repetir el experimento para promediar, o medir otros experimentos.

## Supuestos

- A1: Con `--input-format stream-json` y la entrada abierta, Claude Code (2.1.318) sin interfaz sigue vivo tras su respuesta, y cuando acaba una tarea en segundo plano, como el `specty wait` de un subagente, retoma a quien la lanzó y después al hilo principal, que responde otra vez, sin que nadie escriba. Lo comprobé con el Claude Code real contra un modelo guionizado: el `sleep` en segundo plano de un subagente acabó a los 8 s, el subagente siguió y el hilo principal dio un tercer `result`; con el prompt en la línea de comandos, en cambio, Claude Code mató ese `sleep` tras la última respuesta y salió, como en la ejecución de P264.
  - impacto: alto
- A2: La entrada se cierra cuando la sesión ya no tiene nada que hacer: con un `result` del hilo principal cuando la última lista de `background_tasks_changed` de su `stream-json` está vacía. No se cierra al cerrarse el cambio, porque después el subagente y el hilo principal aún responden y la respuesta final y el coste quedarían fuera; ni cuando la lista se vacía sin un `result`, porque en ese instante el subagente aún va a retomar. Cerrar la entrada con tareas en marcha las mata (lo comprobé: Claude Code espera unos 5 s y sale). Una sesión que nunca queda inactiva la corta el límite del experimento, como hoy.
  - impacto: alto
- A3: Solo las ejecuciones con persona (hoy, el experimento `wait`) mantienen la sesión abierta. Los escenarios acaban esperando a una persona que no existe, y con la sesión abierta un `specty wait` en segundo plano los tendría vivos hasta su límite; siguen, como los demás experimentos, con el prompt en la línea de comandos y la entrada cerrada.
  - impacto: medio
- A4: La suite no escribe en la entrada un mensaje de usuario cuando la persona decide, la alternativa que apuntaba P272: el aviso de la tarea despierta la sesión sin él, y la persona decide en su terminal, sin escribirle al agente, así que ese mensaje cambiaría lo que se mide.
  - impacto: medio
- A5: El `total_cost_usd` de cada `result` es el acumulado de la sesión (con el modelo guionizado crece en cada respuesta), así que el coste y la respuesta final siguen siendo los del último `result`, como ya los lee `agents.ts`.
  - impacto: bajo
- A6: Basta una ejecución real del experimento `wait` con Claude Code y la sesión de la persona, y una segunda solo si la primera falla por algo ajeno al flujo; sus cifras son orientativas.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO se lanza un agente con una sesión ENTONCES su entrada empieza por el mensaje de la sesión y sigue abierta mientras corre; tras la primera línea completa de su salida que la sesión da por terminada, la entrada se cierra y la sesión no lee más líneas; y uno cuya sesión no termina nunca lo corta su límite y acaba sin código.
- AC2: CUANDO se pide la conversación de Claude Code ENTONCES su línea de comandos es la de siempre con `--input-format stream-json` en lugar del prompt, sin las opciones que saltan permisos; su entrada es una sola línea JSON con el prompt como mensaje del usuario; y su sesión termina con un `result` del hilo principal cuando la última lista de tareas en segundo plano está vacía, y no con un `result` mientras corre una tarea ni con la lista vacía sin un `result`. Los demás agentes no tienen conversación.
- AC3: CUANDO la suite arma la ejecución de un agente ENTONCES, con una persona que decide y Claude Code, usa su conversación; sin persona, o con un agente sin conversación, usa su línea de comandos de siempre, con el prompt y sin sesión.
- AC4: CUANDO se lee ARCHITECTURE §16 ENTONCES cuenta que las ejecuciones con persona mantienen viva la sesión de Claude Code, con la entrada en `stream-json` abierta hasta que no queda nada que hacer, y la tabla del experimento `wait` da su ejecución real con este cambio (cumplió, tiempo, rondas, bloqueos, coste y contexto máximo del hilo principal), con una o dos frases, en lugar de la explicación de la ejecución sin avance.
  - test: manual

## Diseño

- `evals/src/launch.ts`: `Session` (`input`, el mensaje con que empieza la entrada, y `done(line)`, si tras esa línea de la salida no queda nada que hacer). `launch(..., { session })` abre la entrada, escribe `input`, parte la salida en líneas completas y cierra la entrada con la primera que `done` da por terminada; ignora los errores de escritura de un agente que ya salió. Sin sesión, la entrada sigue cerrada, como hoy.
- `evals/src/agents.ts`: `Agent.conversation?(binary, prompt, turns)` da `{ command, session }`. Claude Code comparte sus opciones entre `command` y `conversation`, y su sesión cuenta las tareas de la última `background_tasks_changed` y termina con un `result` cuando no queda ninguna. `invocation(agent, binary, prompt, { turns, person })` elige entre la conversación y la línea de comandos.
- `evals/run/compliance.eval.ts`: `runOnce` arma la ejecución con `invocation` y le pasa la sesión a `launch`.
- Tests nuevos: `evals/test/session.test.ts` (AC1) y `evals/test/conversation.test.ts` (AC2, AC3). `launch.test.ts` y el test de `report.test.ts` que mira la línea de comandos siguen igual: sin sesión, nada cambia.

## Archivos

- modificar evals/src/launch.ts — la sesión abierta y cuándo se cierra su entrada
- modificar evals/src/agents.ts — la conversación de Claude Code y qué ejecución arma la suite
- modificar evals/run/compliance.eval.ts — runOnce lanza la conversación cuando decide una persona
- crear evals/test/session.test.ts — tests de AC1
- crear evals/test/conversation.test.ts — tests de AC2 y AC3
- modificar docs/ARCHITECTURE.md — §16: la sesión viva y la ejecución real de `wait`

## Tareas

- [x] T1: Un agente lanzado con una sesión tiene la entrada abierta hasta que termina
  - files: evals/src/launch.ts, evals/test/session.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/session.test.ts test/launch.test.ts && pnpm lint
  - type: feat
- [ ] T2: Claude Code mantiene viva su sesión en las ejecuciones con persona
  - files: evals/src/agents.ts, evals/run/compliance.eval.ts, evals/test/conversation.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/conversation.test.ts test/report.test.ts test/consumption.test.ts test/question.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T3: La arquitectura cuenta la sesión viva y la ejecución real de wait
  - files: docs/ARCHITECTURE.md
  - ac: AC4
  - verify: grep -q 'input-format stream-json' docs/ARCHITECTURE.md && pnpm lint
  - type: docs

## Riesgos

- R1: Una versión de Claude Code que no dé `background_tasks_changed` terminaría la sesión con su primer `result`, como hoy. Mitigación: la ejecución real lo dice, y ARCHITECTURE §16 anota la versión.
- R2: Una sesión que no queda nunca inactiva, como un subagente que repite `specty wait` sin que nadie decida, dura hasta el límite del experimento (30 minutos). Mitigación: la persona decide toda fase que la espera, y el límite acota el coste.
