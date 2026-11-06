---
kind: standard
epic: 20261106-los-agentes-siempre-esperan-la-decision-de-la
slice: C1
---

# `specty wait` es la regla en todos los textos

## Objetivo

Hoy cada salida que deja el cambio esperando a la persona pide «ejecuta `specty wait` para esperar su decisión» sin decir cómo, y la tarjeta de tiempo agotado deja repetirlo «cuando corresponda». Por eso cada agente espera a su manera: en primer plano hasta que su herramienta lo corta, terminando el turno o sin repetirlo. Con este cambio, todas esas salidas piden `specty wait` con la misma frase, que dice cómo ejecutarlo en la herramienta del agente y que lo vuelva a ejecutar cada vez que se agote. La tarjeta de tiempo agotado pide repetirlo ya, y las reglas de AGENTS.md dicen que se espera siempre así.

## Fuera de alcance

- La marca de `specty wait`, la línea de latido en Gemini CLI y el tiempo por defecto de `--timeout`: son el corte C3.
- La negativa del guard a los comandos de la persona (`packages/core/src/guard/human.ts`), y hacer cumplir la regla en el guard y en el fin de turno: son el corte C2.
- Las salidas que piden una decisión mientras el agente sigue trabajando: `task done` con una solicitud de alcance pendiente («sigue dentro del alcance») y `retro --into`, que acaba con la persona repitiendo `git commit`.
- El AGENTS.md de este repositorio: lo reescribe `init`.

## Supuestos

- A1: Cómo aguanta cada herramienta un comando largo, medido el 2026-11-06, decide su frase. Claude Code 2.1.318 deja un comando en segundo plano con `run_in_background: true` y avisa al terminar. Cursor lo hace con `block_until_ms: 0`. OpenCode 2 lo hace con `background: true`, y OpenCode 1 lo mata a los 120 s salvo con `timeout` en milisegundos (`3660000`, una hora y un minuto). Antigravity (agy 1.5.1) pasa `run_command` a segundo plano él solo y avisa al terminar. Codex 0.166 devuelve el control a los 10 s con el proceso vivo, y el modelo consulta su salida. Devin (`windsurf`) pasa a segundo plano y se consulta con `get_output`, sin verificar.
  - impacto: alto
- A2: Gemini CLI, GitHub Copilot y una herramienta desconocida (sin `ctx.tool`) esperan en primer plano. Copilot no tiene guard ni medida. Gemini CLI corta un comando que pasa 300 s sin escribir nada hasta que el corte C3 añada el latido, y la frase ya pide volver a ejecutarlo cada vez que se corte.
  - impacto: medio
- A3: La frase común empieza por «ejecuta `specty wait` para esperar su decisión.», como hoy, y sigue con otra frase sobre cómo ejecutarlo en la herramienta, que acaba pidiendo volver a ejecutarlo cada vez que se agote o se corte. Las salidas que hoy piden la decisión tras `specty review` sin nombrar `wait` también la llevan.
  - impacto: bajo
- A4: El encargo de un corte lo lee un subagente de la misma herramienta que la sesión principal (`ctx.tool`), así que lleva la misma frase. Si ese subagente espera o devuelve el turno a la sesión principal es cosa de la épica, fuera de este corte.
  - impacto: medio
- A5: AGENTS.md es el mismo para todas las herramientas, así que su regla solo nombra la forma de Claude Code (en segundo plano). La de cada herramienta la dicen las tarjetas.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO una salida de Specty deja el cambio esperando a la persona (aprobar la spec o los tests, decidir una solicitud de alcance o desbloquear un test aprobado, aceptar, cerrar, repetir `close` o `accept` tras una incorporación, o decidir tras la revisión independiente de `specty review`) ENTONCES su `SIGUIENTE:` dice «ejecuta `specty wait` para esperar su decisión.» seguido de la frase de la herramienta del agente, igual en todas esas salidas. En Claude Code, en segundo plano (`run_in_background: true`); en Cursor, en segundo plano (`block_until_ms: 0`); en OpenCode, en segundo plano (`background: true`) o, en OpenCode 1, con `timeout: 3660000`; en Antigravity, dejándolo pasar a segundo plano; en Codex, consultando su salida mientras siga en marcha; en Devin, consultándola con `get_output`; y en Gemini CLI, GitHub Copilot o sin herramienta conocida, en primer plano. Todas piden volver a ejecutarlo cada vez que se agote o se corte. CUANDO el encargo de un corte dice qué hacer cuando el cambio espere a la persona ENTONCES usa la misma frase.
- AC2: CUANDO `specty wait` agota su tiempo ENTONCES su `SIGUIENTE:` pide recordar a la persona la decisión pendiente y volver a ejecutar `specty wait` ya, con la frase de la herramienta del agente, sin dejarlo a su criterio («cuando corresponda»).
- AC3: CUANDO `init` escribe las reglas de AGENTS.md ENTONCES dicen que el agente espera la decisión de la persona siempre con `specty wait` (en Claude Code, en segundo plano), que lo vuelve a ejecutar cada vez que se agote o se corte y que no espera terminando el turno, con `sleep` ni consultando `specty status`, y el bloque sigue sin pasar de 15 líneas.
- AC4: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- `cards/wait.ts` reúne cómo espera el agente de cada herramienta. Una tabla `Record<AgentTool, …>` guarda la frase de cada una, en español y en inglés, con un comentario por fila sobre lo medido (A1 y A2). El corte C3 le añadirá el tiempo por defecto y el latido. `waitStep(ctx)` da la frase común, «ejecuta `specty wait` para esperar su decisión. <cómo>, y vuelve a ejecutarlo cada vez que se agote o se corte», sin punto final, para que cada tarjeta la cierre. La tarjeta de tiempo agotado usa la misma frase empezando por «vuelve a ejecutar ya `specty wait`», tras pedir recordar a la persona la decisión pendiente.
- `wait.ts` deja de importar `blockedCard` de `flow.ts`, que ahora importa `waitStep`, y escribe su `Output` bloqueado él mismo, así no hay un ciclo entre los dos archivos.
- Cada tarjeta que hoy escribe a mano «ejecuta `${ctx.command} wait` para esperar su decisión» usa `waitStep(ctx)`: `flow.ts` (spec propuesta, cierre propuesto y solicitudes de alcance), `next.ts` (spec en revisión), `acceptance.ts`, `work.ts` (cierre enviado), `integration.ts` (`runAgainNext`), `testing.ts` (tests enviados y desbloqueo rechazado) y `epic.ts` (paso del encargo). `review.ts` la añade tras pedir aprobar o aceptar, fuera del modo delegado.
- `waitStep` no entra en la API pública de core: solo la usan las tarjetas.
- `agents-md.ts` reescribe la viñeta de las decisiones de la persona sin añadir líneas al bloque.
- Las aserciones de los tests que citan la frase entera con `toBe` cambian a la nueva. Las que la citan con `toContain` hasta «para esperar su decisión.» siguen valiendo, como `packages/core/test/cards/testing.test.ts` y `packages/cli/test/resolve.test.ts`, así que esos tests no se tocan.

## Archivos

- modificar packages/core/src/cards/wait.ts — la tabla de cómo espera el agente de cada herramienta, la frase común `waitStep` y la tarjeta de tiempo agotado
- modificar packages/core/src/cards/flow.ts — la spec propuesta, el cierre propuesto y las solicitudes de alcance piden `wait` con la frase común
- modificar packages/core/src/cards/next.ts — la spec en revisión pide `wait` con la frase común
- modificar packages/core/src/cards/acceptance.ts — la aceptación pide `wait` con la frase común
- modificar packages/core/src/cards/work.ts — el cierre enviado pide `wait` con la frase común
- modificar packages/core/src/cards/integration.ts — repetir `close` o `accept` tras una incorporación pide `wait` con la frase común
- modificar packages/core/src/cards/testing.ts — los tests enviados y el desbloqueo rechazado piden `wait` con la frase común
- modificar packages/core/src/cards/review.ts — tras la revisión independiente, pedir aprobar o aceptar lleva la frase común
- modificar packages/core/src/cards/epic.ts — el encargo de un corte espera con la frase común
- modificar packages/core/src/agents-md.ts — la regla de AGENTS.md para esperar siempre con `specty wait`
- modificar packages/core/test/cards/wait.test.ts — la tarjeta de tiempo agotado con cada herramienta y en los dos idiomas
- modificar packages/core/test/cards/delegated.test.ts — la frase común con cada herramienta en todas las salidas que esperan a la persona, y la nueva en las que ya comprobaba
- modificar packages/core/test/cards/review.test.ts — la frase común tras la revisión independiente
- modificar packages/core/test/cards/incorporation.test.ts — la frase común al repetir `close`
- modificar packages/core/test/cards/epic.test.ts — la frase común en los encargos
- modificar packages/core/test/agents-md.test.ts — la regla de AGENTS.md
- modificar docs/formats.md — el ejemplo de salida de `propose` con la frase común
- modificar docs/ARCHITECTURE.md — cómo piden las salidas `specty wait` según la herramienta

## Tareas

- [x] T1: La tarjeta de tiempo agotado pide volver a ejecutar `specty wait` ya, con la frase de cada herramienta
  - files: packages/core/src/cards/wait.ts, packages/core/test/cards/wait.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/wait.test.ts
  - type: feat
- [x] T2: Las salidas que esperan a la persona piden `specty wait` con la misma frase
  - files: packages/core/src/cards/wait.ts, packages/core/src/cards/flow.ts, packages/core/src/cards/next.ts, packages/core/src/cards/acceptance.ts, packages/core/src/cards/work.ts, packages/core/src/cards/integration.ts, packages/core/src/cards/testing.ts, packages/core/src/cards/review.ts, packages/core/src/cards/epic.ts, packages/core/test/cards/delegated.test.ts, packages/core/test/cards/review.test.ts, packages/core/test/cards/incorporation.test.ts, packages/core/test/cards/epic.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/delegated.test.ts test/cards/review.test.ts test/cards/incorporation.test.ts test/cards/epic.test.ts test/cards/testing.test.ts
  - type: feat
- [x] T3: Las reglas de AGENTS.md mandan esperar siempre con `specty wait`
  - files: packages/core/src/agents-md.ts, packages/core/test/agents-md.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts test/cards.test.ts test/cards/language.test.ts && pnpm typecheck && pnpm lint
  - type: feat

## Riesgos

- R1: Una frase mal medida de una herramienta hace que su agente espere mal. Cada fila de la tabla cita la versión medida, y la frase siempre pide volver a ejecutarlo cada vez que se agote o se corte.
- R2: T2 toca trece archivos. Es el mismo cambio en cada tarjeta, y su test recorre todas las salidas con cada herramienta.
