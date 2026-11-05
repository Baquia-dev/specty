---
kind: standard
epic: 20261104-epicas-y-features-con-subagentes
slice: C6
---

# Cada subagente de Codex trabaja en la carpeta de su cambio

## Objetivo

Hoy el guard reconoce una conversación de Codex por el `session_id` de sus hooks, y los subagentes que Codex lanza con `spawn_agent` envían el del hilo raíz. Por eso el guard los trata como al hilo principal: un subagente no puede entrar en la carpeta de otro cambio («una sesión trabaja un solo cambio a la vez»), y sus parches y comandos van a la carpeta del hilo principal. Con este corte, el guard distingue a cada subagente de Codex por su `agent_id`, como a los de Claude Code (C1): entra con `specty enter`, queda atado a la carpeta de su cambio, y el guard lleva allí sus comandos y parches sin mover al hilo principal. La tabla de capacidades pone a Codex en «sí» en «Cortes en subagentes».

## Fuera de alcance

- OpenCode y Cursor (C7 y C8).
- El fin de turno de un subagente de Codex: Codex lo avisa con `SubagentStop`, que Specty no escucha, así que el aviso de `specty check --changed` y la red de la memoria al terminar el turno siguen siendo solo del hilo principal.
- Las redes de seguridad del guard para subagentes (P81).
- `specty new --subagent` en Codex: sus comandos no llevan el id de la conversación, así que `new` no ata a nadie en Codex, con `--subagent` o sin él.

## Supuestos

- A1: Codex añade `agent_id` (el id del hilo hijo) y `agent_type` a los hooks de un subagente desde 0.134, con el `session_id` del hilo raíz, y no los añade a los del hilo principal. Comprobado el 2026-11-04 con Codex 0.166.0 contra el modelo guionizado; AC4 lo vuelve a comprobar con la versión instalada.
  - impacto: alto
- A2: El subagente arranca en la carpeta del turno del hilo que lo lanzó (comprobado con 0.166.0). La conversación principal de Codex ya entra con `specty enter` y recibe sus acciones reescritas con `updatedInput`, así que al subagente le vale lo mismo, sin el bloqueo con la ruta buena que necesita Claude Code.
- A3: En Codex 0.166.0, `spawn_agent` y `wait_agent` son herramientas diferidas del espacio de nombres `multi_agent_v1`, activo por defecto: el modelo las encuentra con `tool_search` antes de usarlas, y `spawn_agent` devuelve el `agent_id` del hijo.
- A4: Los eventos sin `agent_id` se juzgan como hoy.

## Criterios de aceptación

- AC1: CUANDO un evento de Codex trae `agent_id` ENTONCES el guard lo trata como una conversación propia, `<session_id>--<agent_id>`: su enlace a una carpeta y sus pasos en `specty status` son suyos, no del hilo principal.
- AC2: CUANDO un subagente de Codex ejecuta `specty enter <id>` de un cambio con carpeta ENTONCES el guard lo ata a esa carpeta sin tocar el enlace del hilo principal, aunque este trabaje en otro cambio abierto.
- AC3: CUANDO un subagente de Codex atado a la carpeta de un cambio ejecuta un comando o aplica un parche ENTONCES el guard lo lleva a esa carpeta (con `updatedInput`, un `cd` a ella delante del comando y las rutas del parche dentro de ella) y lo juzga con las reglas de ese cambio, mientras los del hilo principal siguen yendo a la suya.
- AC4: CUANDO Codex real lanza un subagente contra el modelo guionizado ENTONCES el subagente queda atado con su `agent_id` a la carpeta del cambio en el que entra con `specty enter`, su parche y su comando van allí, y el hilo principal sigue en la carpeta del suyo.
- AC5: CUANDO se muestra la tabla de capacidades (ARCHITECTURE §10) ENTONCES Codex está en «sí» en «Cortes en subagentes».

## Diseño

- El módulo de Codex compone `normalize: asSubagentConversation`, como el de Claude Code: la conversación de un subagente es `<session_id>--<agent_id>`, así que su enlace en `sessions/`, sus pasos para `status` y su frente son suyos, y la regla «una conversación, un cambio abierto» le vale como al hilo principal.
- Nada más cambia en el guard. Codex no entra por nombre (su `worktreeByName` es «indirecto»), así que `entersOnItsOwn` ya es falso para todos sus eventos, y `redirect` reescribe las acciones de la conversación que trae el evento, sea el hilo principal o un subagente.
- La documentación de `subagentOf` nombra también a Codex.
- `AGENT_CAPABILITIES.codex.subagentSlices` pasa a `yes`, con un comentario de dónde viene.
- Pruebas del guard con los eventos que envía Codex 0.166.0 (`codex-subagents.test.ts`): el `session_id` del hilo raíz, `turn_id`, un `agent_id` con forma de UUID y `agent_type: "default"`.
- Prueba con Codex real (`codex-e2e.test.ts`):
  - `fakeResponses` acepta un guion por subagente, que elige por una marca en el encargo del subagente, y responde a cada hilo por su cuenta.
  - Sabe pedir `tool_search`, llamar a una herramienta de un espacio de nombres y esperar con `wait_agent` a los subagentes que lanzó el hilo, con los ids que devolvió `spawn_agent`.
  - El hilo principal entra en un cambio, busca las herramientas, lanza un subagente con la marca, lo espera y ejecuta `pwd`. El subagente entra en otro cambio, añade un archivo con un parche y ejecuta `pwd`.
- Documentos: ARCHITECTURE §10 (los subagentes de Codex y la tabla de capacidades).

## Archivos

- modificar packages/cli/src/agents/codex.ts — un evento con `agent_id` es la conversación de un subagente
- modificar packages/cli/src/enforce/actions.ts — `subagentOf` nombra también el `agent_id` de Codex
- modificar packages/core/src/capabilities.ts — Codex en «sí» en «Cortes en subagentes»
- modificar docs/ARCHITECTURE.md — los subagentes de Codex en §10 y la tabla de capacidades
- crear packages/cli/test/codex-subagents.test.ts — el guard con los eventos de un subagente de Codex
- modificar packages/cli/test/codex-e2e.test.ts — Codex real lanza un subagente que trabaja en la carpeta de otro cambio
- modificar packages/cli/test/fake-responses.ts — un guion por subagente, `tool_search`, herramientas con espacio de nombres y `wait_agent`
- modificar packages/core/test/capabilities.test.ts — la fila de Codex

## Tareas

- [x] T1: Cada subagente de Codex entra con `specty enter` y trabaja en la carpeta de su cambio
  - files: packages/cli/src/agents/codex.ts, packages/cli/src/enforce/actions.ts, packages/cli/test/codex-subagents.test.ts, packages/cli/test/codex-e2e.test.ts, packages/cli/test/fake-responses.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex-subagents.test.ts test/codex-e2e.test.ts && pnpm typecheck && pnpm lint
- [x] T2: La tabla de capacidades dice que Codex reparte los cortes de una épica entre subagentes
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Codex cambia los campos que envían sus hooks dentro de un subagente, o la forma de lanzarlos (`multi_agent_v2` ya existe, apagado por defecto). Mitigación: AC4 lo comprueba con la versión instalada.
- R2: La prueba con Codex real se salta donde no está Codex, también en `pnpm check`. Mitigación: las pruebas del guard con los eventos grabados de 0.166.0 cubren AC1, AC2 y AC3 siempre.
- R3: C7 y C8 tocan a la vez las mismas líneas de la tabla de capacidades y de su test. Mitigación: al incorporar main, la tabla se regenera desde `capabilityTable` y el test conserva las filas de los tres cortes.

## Cierre

### Resumen

- El guard distingue a cada subagente de Codex por su `agent_id`: el módulo de Codex compone `asSubagentConversation`, así que la conversación de un subagente es `<session_id>--<agent_id>`, con su propio enlace a una carpeta, sus pasos en `status` y su frente.
- Un subagente de Codex entra con `specty enter <id>` en la carpeta de un cambio sin mover al hilo principal. Desde entonces el guard le reescribe las acciones con `updatedInput` (un `cd` a su carpeta delante de cada comando y las rutas de cada parche dentro de ella) y las juzga con las reglas de ese cambio.
- La tabla de capacidades pone a Codex en «sí» en «Cortes en subagentes», y ARCHITECTURE §10 explica sus subagentes.
- Comprobado con Codex 0.166.0 real contra el modelo guionizado (AC4, en `codex-e2e.test.ts`). `spawn_agent` es una herramienta diferida de `multi_agent_v1` que el modelo encuentra con `tool_search`. Los eventos del hijo traen el `session_id` del hilo raíz, su `agent_id` y `agent_type: "default"`; los del hilo principal no los traen, y el hijo arranca en la carpeta del turno del padre.

### Desviaciones (respecto al plan)

- Codex no estaba instalado en la máquina: se instaló 0.166.0 en una carpeta temporal de la sesión, sin tocar la instalación global, y las pruebas con Codex real corrieron con `SPECTY_E2E_CODEX`. En `pnpm check` se saltan, como los demás E2E de Codex.
- El primer `specty propose` de los tests se rechazó por AC4. Specty lee el id de un criterio solo en la línea que declara el test o en un comentario, y Biome había pasado el nombre largo del test a la línea siguiente. Se acortó el nombre para que quepa en la línea de `it(`.

### Decisiones

- Las pruebas del guard van en un archivo nuevo, `codex-subagents.test.ts`, con los eventos tal como los envía Codex 0.166.0. No van en `subagents.test.ts` ni en `codex.test.ts`, para no chocar con los cortes C7 y C8, que se hacen a la vez.
- Lo que el falso de la API Responses sabe de los subagentes de Codex queda dentro de `fake-responses.ts`: el espacio de nombres `multi_agent_v1`, el `agent_id` que devuelve `spawn_agent` y la espera con `wait_agent`. El guion usa `spawnAgent()` y los pasos `{ search }` y `{ wait: "spawned" }`.
- Antes de enviar los tests, sus escenarios se comprobaron contra una copia del build con el `normalize` ya añadido, para no tener que pedir un desbloqueo después.

### Pendientes

- El fin de turno de un subagente de Codex llega como `SubagentStop`, que Specty no escucha: al terminar el turno de un subagente no corren ni el aviso de `specty check --changed` ni la red de la memoria.
- Codex 0.166.0 trae `multi_agent_v2`, estable pero apagado por defecto. Cuando sea el modo por defecto, comprobar con la prueba de Codex real que sus subagentes siguen enviando `agent_id` y que `spawn_agent` no cambió.
