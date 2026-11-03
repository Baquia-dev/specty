---
kind: standard
---

# Lo que el cierre deja en la memoria, en su salida

## Objetivo

Resuelve P43 y P47. Hoy la salida de `specty close` no dice qué pendientes deja en la memoria: las viñetas de «### Pendientes» y las observaciones de la revisión que el cierre no cita. Para saber qué se anotó hay que ejecutar `specty memory`. Con este cambio, la salida del comando que cierra un cambio los nombra, con su id y su primera línea, tras los recordatorios que disparó. Para hacerlo, lo que archivar un cambio hace en la memoria sale de `commands/memory.ts` (319 líneas de código) a `flow/archive-memory.ts`, como propone P47.

## Fuera de alcance

- Las lecciones de los riesgos que toma la aceptación: `accept` ya las nombra.
- Cambiar qué se recoge del cierre o de la revisión, o cuándo.
- Partir `packages/core/src/cards/index.ts` (P2).

## Supuestos

- A1: Los pendientes que se nombran son los que `archive` anota al cerrar un cambio, con `close`, `accept` de un quick o la confirmación de un retro: los de «### Pendientes» y las observaciones sin citar. Los que no anota, porque citan una entrada o repiten una abierta, no salen.
- A2: La sección va tras «RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO», con una línea por entrada (`P59 · <primera línea>`) y otra que dice que las sesiones las verán al empezar. Sin pendientes nuevos, no sale.
- A3: `firedRemindersBlocks` deja `cards/memory.ts` y va con la nueva sección a `cards/archived-memory.ts`, lo que una tarjeta dice de la memoria al archivar un cambio. `withFiredReminders` pasa a ser `withArchivedMemory`, que recibe lo archivado y añade las dos secciones.
- A4: `settleEntries`, `harvestEntries` (que pasa a devolver las entradas anotadas, no sus ids), `Harvest` y `fireReminders` van a `flow/archive-memory.ts`, sin cambiar lo que hacen.

## Criterios de aceptación

- AC1: CUANDO se cierra un cambio cuyo cierre deja pendientes nuevos en la memoria ENTONCES la salida de `close` añade «PENDIENTES QUE QUEDAN EN LA MEMORIA», con el id y la primera línea de cada uno, en el orden en que se anotaron, y que las sesiones los verán al empezar.
- AC2: CUANDO el cierre no deja ningún pendiente nuevo, porque no tiene o porque los que tiene citan o repiten una entrada ENTONCES la sección no sale.
- AC3: CUANDO `accept` de un cambio anota lecciones de los riesgos que acepta ENTONCES su salida las nombra como antes.

## Diseño

- Core, `cards/archived-memory.ts` (nuevo): `firedRemindersBlocks`, movido de `cards/memory.ts`, y `harvestedBlocks(entries, ctx)`, en español y en inglés.
- Core, `cards/index.ts`: exporta las dos desde el archivo nuevo.
- CLI, `flow/archive-memory.ts` (nuevo): `Harvest`, `harvestEntries`, `settleEntries`, `fireReminders` y `withArchivedMemory(session, card, archived)`.
- CLI, `commands/memory.ts`: sin ellas; exporta `authorOf`, que usan.
- CLI, `flow/finish.ts`: `ArchivedChange.harvested`, las entradas que anotó el cierre.
- CLI, `commands/finish.ts`, `commands/accept.ts` y `commands/retro.ts`: `withArchivedMemory` en vez de `withFiredReminders`.

## Archivos

- crear packages/core/src/cards/archived-memory.ts — lo que una tarjeta dice de la memoria al archivar un cambio
- modificar packages/core/src/cards/memory.ts — sin los recordatorios disparados, que van al archivo nuevo
- modificar packages/core/src/cards/index.ts — exporta las secciones desde el archivo nuevo
- crear packages/core/test/cards/archived-memory.test.ts — la sección de los pendientes, en español y en inglés
- crear packages/cli/src/flow/archive-memory.ts — lo que archivar un cambio hace en la memoria
- modificar packages/cli/src/commands/memory.ts — sin lo que hace archivar un cambio
- modificar packages/cli/src/flow/finish.ts — los pendientes que anotó el cierre, en lo archivado
- modificar packages/cli/src/commands/finish.ts — la salida de `close` y `cancel` con lo archivado
- modificar packages/cli/src/commands/accept.ts — la salida de `accept` con lo archivado, y las lecciones desde el archivo nuevo
- modificar packages/cli/src/commands/retro.ts — la salida de un retro confirmado con lo archivado
- crear packages/cli/test/close-harvest.test.ts — `close` nombra los pendientes que deja, de punta a punta
- modificar docs/formats.md — la salida que nombra los pendientes anotados

## Tareas

- [x] T1: La sección de los pendientes que deja un cierre
  - files: packages/core/src/cards/archived-memory.ts, packages/core/src/cards/memory.ts, packages/core/src/cards/index.ts, packages/core/test/cards/archived-memory.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/archived-memory.test.ts test/cards/memory-start.test.ts && pnpm lint
- [x] T2: Lo que archivar un cambio hace en la memoria, en su archivo, y las salidas que lo nombran
  - files: packages/cli/src/flow/archive-memory.ts, packages/cli/src/commands/memory.ts, packages/cli/src/flow/finish.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts, packages/cli/src/commands/retro.ts, packages/cli/test/close-harvest.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/close-harvest.test.ts test/memory-harvest.test.ts test/memory-on-close.test.ts test/memory-settle.test.ts test/risk-lessons.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T3: La documentación de la salida del cierre
  - files: docs/formats.md
  - ac: AC1
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Mover `harvestEntries` y `settleEntries` puede romper lo que hace archivar un cambio — los tests de la recolección, del reparto de entradas y de los recordatorios siguen en la verificación de T2.
