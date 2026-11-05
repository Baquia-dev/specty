---
kind: standard
epic: 20261106-pendientes-de-la-sesion-por-feature
slice: C1
---

# El agente solo ve y reporta los pendientes de su trabajo

## Objetivo

Hoy cada sesión empieza con «Pendientes y mejoras abiertas: 72. Las primeras libres: …», y los agentes repiten en sus reportes pendientes ajenos. Además, una viñeta del cierre como «Ninguno nuevo.» se guarda como pendiente (P74, P173). Con este cambio, la tarjeta de inicio y la de `next` sin cambio activo solo dan los recordatorios y el frente que lleva la conversación, las reglas de AGENTS.md piden respuestas directas y un reporte final con solo los pendientes del trabajo de la sesión, y el cierre no guarda las viñetas que dicen que no hay ninguno. Es el corte C1 de la épica `20261106-pendientes-de-la-sesion-por-feature` (AC1, AC2, AC3 y AC10 de la épica).

## Fuera de alcance

- `specty memory resolve` y que el reporte final lo mencione: es el corte C2.
- El freno de parecidos de `memory add`: es el corte C3.
- Lo que ve la persona: `specty memory`, «TE TOCA» de `specty status` y la página Memoria siguen mostrando todas las entradas abiertas.
- Actualizar el AGENTS.md de este repositorio: lo recibe cuando la persona ejecuta `specty init`.
- Comparar por parecido los pendientes que el cierre cosecha: sigue comparando el texto exacto.

## Supuestos

- A1: Un pendiente ajeno es una entrada abierta que no salió del cambio de la sesión ni fue tomada por él. La tarjeta de inicio y la de `next` sin cambio activo dejan de listar las entradas libres, de contarlas, de nombrar los frentes con dueño de otras conversaciones y de remitir a `specty memory`. A la conversación que lleva un frente, «MEMORIA DE SPECTY» le sigue dando las tres primeras entradas libres de ese frente, en su orden, y cómo tomar una, o que no tiene ninguna libre y que le pregunte a la persona qué sigue. Sin frente propio, esa sección no sale. «RECORDATORIOS» no cambia.
  - impacto: alto
- A2: La regla de respuestas directas y concisas va en la misma viñeta que la del reporte final, la última del bloque de reglas, para que el bloque siga en 15 líneas y 5 reglas, el tope que fijan los tests de `agents-md`. Pide dar primero el resultado o la pregunta, sin repetir la salida de Specty, sin narrar cada paso y sin enumerar opciones que no se van a seguir. El reporte final nombra lo que queda pendiente del trabajo de la sesión y, de los demás pendientes, solo los que ese trabajo resolvió.
  - impacto: medio
- A3: Una viñeta de «Pendientes» dice que no hay ninguno cuando su primera frase, hasta el primer «.» o «:», sin mayúsculas, tildes ni énfasis de Markdown, es una de una lista cerrada en español y en inglés: «ninguno», «ninguno nuevo», «ninguna más», «no hay», «no hay pendientes», «nada pendiente», «nada nuevo», «sin pendientes», «none», «none new», «nothing», «nothing new», «nothing pending» y sus variantes. Lo que sigue a ese signo no cuenta, así que «Ninguno nuevo. C6 hará que…» no se guarda; una frase más larga, como «Ninguno pendiente de X, salvo Y.», sí. La regla mira solo el idioma de la viñeta, no el lenguaje ni el stack del proyecto, y la usan el cierre y la red del fin de turno, que comparten `harvestable`.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO un agente empieza una sesión o ejecuta `next` sin un cambio activo y la memoria tiene pendientes o mejoras abiertas ENTONCES la tarjeta no los lista, no dice cuántos hay ni remite a `specty memory`; sigue mostrando los recordatorios que tocan y, si la conversación lleva un frente, sus primeras entradas libres.
- AC2: CUANDO `init` escribe el bloque de reglas de AGENTS.md ENTONCES pide responder al usuario de forma directa y concisa, y que el reporte final solo nombre los pendientes del trabajo de la sesión y, de los demás, solo los que ese trabajo resolvió.
- AC3: CUANDO el cierre de un cambio tiene en «Pendientes» un punto que dice que no hay ninguno («Ninguno nuevo.», «No hay.», «None.», «Ninguno nuevo. C6 hará que…») ENTONCES no se guarda como pendiente.
- AC4: CUANDO salen los textos nuevos de la tarjeta y de AGENTS.md ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/memory.ts`: `memoryStartBlocks` deja de llamar a `workLines`, que listaba y contaba las entradas libres; la sección «MEMORIA DE SPECTY» sale solo con el frente propio (`ownFrontLines` sin el total de la memoria y con la línea de cómo tomar una, sin `specty memory`). `reminderLines` no cambia.
- Core, `agents-md.ts`: `ruleLines` cambia su última viñeta (A2), en español y en inglés.
- Core, `memory/entries.ts`: `harvestable` deja fuera una viñeta cuya primera frase está en la lista de A3 (`saysNone`), en lugar del set de tres palabras exactas.
- Docs: formats.md §1 (la cosecha del cierre y los frentes en la tarjeta de inicio) y §8 (el bloque de AGENTS.md), ARCHITECTURE §6 (lo que trae la tarjeta al empezar una sesión) y el ADR 0016 (qué pendientes ve cada sesión).

## Archivos

- modificar packages/core/src/memory/entries.ts — `harvestable` reconoce las viñetas que dicen que no hay ninguno
- modificar packages/core/test/memory/harvest.test.ts — las variantes de «no hay ninguno», en español y en inglés
- modificar packages/core/src/cards/memory.ts — la tarjeta sin cambio activo solo da el frente propio y los recordatorios
- modificar packages/core/test/cards/memory-start.test.ts — la tarjeta no lista ni cuenta los pendientes abiertos
- modificar packages/core/test/cards/front-start.test.ts — el frente propio sin el total, y nada para una conversación sin frente
- modificar packages/core/test/cards/exclusions.test.ts — el orden de los bloques, con un recordatorio en lugar de un pendiente
- modificar packages/cli/test/memory-start.test.ts — `next` sin cambio activo no lista los pendientes, de punta a punta
- modificar packages/cli/test/front-start.test.ts — el frente propio en Claude Code, sin el total
- modificar packages/cli/test/front-start-codex.test.ts — el frente propio en Codex, sin el total
- modificar packages/cli/test/memory-resolves.test.ts — la tarjeta sin cambio activo ya no lista las entradas libres
- modificar packages/cli/test/memory-settle.test.ts — la tarjeta sin cambio activo ya no lista las entradas libres
- modificar packages/cli/test/memory-harvest.test.ts — el cierre no guarda «Ninguno nuevo. …», y no mira la tarjeta de `next`
- modificar packages/core/src/agents-md.ts — la regla de respuestas concisas y del reporte final
- modificar packages/core/test/cards.test.ts — la última regla del bloque, en español y en inglés
- modificar docs/formats.md — la cosecha del cierre, la tarjeta de inicio y el bloque de AGENTS.md
- modificar docs/ARCHITECTURE.md — lo que trae la tarjeta al empezar una sesión
- modificar docs/decisions/0016-la-memoria-de-specty.md — qué pendientes ve cada sesión

## Tareas

- [ ] T1: Las viñetas del cierre que dicen que no hay ningún pendiente no se guardan
  - files: packages/core/src/memory/entries.ts, packages/core/test/memory/harvest.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/harvest.test.ts test/memory/entries.test.ts
  - type: feat
- [ ] T2: La tarjeta sin cambio activo solo da el frente propio y los recordatorios
  - files: packages/core/src/cards/memory.ts, packages/core/test/cards/memory-start.test.ts, packages/core/test/cards/front-start.test.ts, packages/core/test/cards/exclusions.test.ts, packages/cli/test/memory-start.test.ts, packages/cli/test/front-start.test.ts, packages/cli/test/front-start-codex.test.ts, packages/cli/test/memory-resolves.test.ts, packages/cli/test/memory-settle.test.ts, packages/cli/test/memory-harvest.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-start.test.ts test/front-start.test.ts test/front-start-codex.test.ts test/memory-resolves.test.ts test/memory-settle.test.ts test/memory-harvest.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/memory-start.test.ts test/cards/front-start.test.ts test/cards/exclusions.test.ts && pnpm lint
  - type: feat
- [ ] T3: Las reglas de AGENTS.md piden respuestas concisas y reportar solo los pendientes propios
  - files: packages/core/src/agents-md.ts, packages/core/test/cards.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts test/cards/ test/agents-md.test.ts && pnpm typecheck && pnpm lint && pnpm knip && pnpm sources
  - type: feat
- [ ] T4: La documentación de qué pendientes ve cada sesión
  - files: docs/formats.md, docs/ARCHITECTURE.md, docs/decisions/0016-la-memoria-de-specty.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Sin ver los pendientes abiertos, un agente puede volver a anotar uno que ya existe — el freno de parecidos del corte C3.
- R2: Una viñeta real que empieza como las de «no hay ninguno» se perdería — solo cuenta la primera frase entera, hasta «.» o «:», y solo si está en la lista cerrada: «Ninguno, salvo Y» o «Ninguno pendiente de X» se guardan.
