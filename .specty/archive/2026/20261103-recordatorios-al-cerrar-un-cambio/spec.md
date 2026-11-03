---
kind: standard
---

# Recordatorios al cerrar un cambio

## Objetivo

Segundo y último cambio de P32 (recordatorios con disparador): un recordatorio de la memoria de Specty puede esperar a que se archive un cambio concreto (`specty memory add --kind reminder --on-close <id>`). Hasta entonces no sale en las sesiones; al cerrarse o cancelarse ese cambio, la salida del comando lo muestra y desde ahí sale en cada sesión hasta que se marca hecho. Resuelve también P46: los rechazos de `memory add` y `memory done` salen de `cards/memory.ts`, que ya tiene 372 líneas de código y donde este cambio añade otros.

## Fuera de alcance

- La página «Memoria» de la UI, que sigue mostrando en «Te toca» todos los recordatorios abiertos (P45).
- Cambiar el disparador de un recordatorio ya anotado: se marca hecho y se anota otro.
- Disparar en otros momentos del cambio, como su aprobación o la aceptación de uno standard.
- Disparar los recordatorios de un cambio que se archivó sin hacerlo, como uno cerrado con una versión anterior de Specty.

## Supuestos

- A1: `--on-close` lleva el id de un cambio abierto, de cualquier carpeta del clon, y se guarda en el campo `onClose` del frontmatter, que solo admite un recordatorio. Un id que no es el de un cambio abierto (desconocido, cerrado o cancelado) no se anota, porque el recordatorio nunca saldría.
  - impacto: alto
- A2: El recordatorio se dispara cuando el cambio se archiva por cualquier motivo: al cerrarse (`close`, `accept` de un cambio quick o un retro confirmado) y también al cancelarse, para que no se pierda; la persona decide si sigue valiendo y lo marca hecho. Disparar quita `onClose`, en su propio commit de la rama de la memoria, y desde entonces es un recordatorio sin disparador. Solo se disparan los abiertos.
  - impacto: alto
- A3: La salida del comando que archiva el cambio muestra los recordatorios disparados en la sección «RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO», tras lo que ya dice y antes del consumo, con que desde ahora salen en cada sesión hasta que se marquen hechos. Sin ninguno, la sección no sale.
- A4: Un recordatorio lleva un solo disparador: `--on-close` junto a `--due` o `--path` no se anota, y el rechazo nombra las dos opciones dadas. El de `--due` con `--path` no cambia su texto.
- A5: Los rechazos de `memory add` y `memory done` pasan tal cual a `cards/memory-refusals.ts`: ningún texto cambia, y la API pública (`memoryRefusalCard` y `MemoryRefusal`) sigue siendo la misma.

## Criterios de aceptación

- AC1: CUANDO se anota un recordatorio con `--on-close` de un cambio abierto ENTONCES no sale en la tarjeta de inicio ni en «TE TOCA» de `specty status`, y `specty memory` lo lista con «al cerrar `<id>`».
- AC2: CUANDO ese cambio se cierra o se cancela ENTONCES la salida del comando muestra el recordatorio en «RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO» con cómo marcarlo hecho, y desde entonces sale en la tarjeta de inicio y en «TE TOCA» hasta que se marca hecho.
- AC3: CUANDO `--on-close` va en una entrada que no es un recordatorio, junto a `--due` o `--path`, o con el id de un cambio que no está abierto ENTONCES `memory add` no anota nada y explica por qué.

## Diseño

- Core, `memory/entries.ts`: `MemoryEntry.onClose` (el id del cambio), en el esquema solo para recordatorios; la operación `fire` de la rama de la memoria.
- Core, `memory/triggers.ts`: `sessionEntries` deja fuera también los recordatorios con `onClose`; `waitingFor(entries, change)`, los recordatorios abiertos que esperan a `change`; `firedEntry(entry)`, el recordatorio sin `onClose`.
- Core, `cards/memory-refusals.ts` (nuevo): los rechazos de `memory add` y `memory done` que hoy están en `cards/memory.ts`, con los nuevos `on-close-not-reminder` y `not-open-change`, y `two-triggers` con las dos opciones dadas (sin ellas, `--due` y `--path`).
- Core, `cards/memory.ts`: la línea de la lista lleva «al cerrar `<id>`»; `firedRemindersBlocks(entries, ctx)`, la sección de los disparados; el asunto del commit `fire` («memoria: P5 disparada»).
- CLI, `commands/memory.ts`: `memory add --on-close <id>`, con sus rechazos; el de un cambio que no está abierto lee los cambios abiertos solo cuando se da `--on-close`.
- CLI, `flow/finish.ts`, que ya reúne lo que hace archivar un cambio: `fireReminders(session, state)` dispara, un commit cada uno, los que esperan al cambio; `archive` lo llama tras liquidar las entradas que tomó el cambio y los devuelve en `fired`; `withFiredReminders(card, fired, session)` añade su sección a una tarjeta. `close`, `cancel`, `accept` de un quick y la confirmación de un retro los muestran.

## Archivos

- crear packages/core/src/cards/memory-refusals.ts — los rechazos de `memory add` y `memory done`, y los nuevos de `--on-close`
- modificar packages/core/src/cards/memory.ts — sin los rechazos; «al cerrar `<id>`» en la lista, la sección de los disparados y el asunto del commit `fire`
- modificar packages/core/src/cards/index.ts — exporta los rechazos desde su archivo nuevo y `firedRemindersBlocks`
- modificar packages/core/src/memory/entries.ts — el campo `onClose` de un recordatorio y la operación `fire`
- modificar packages/core/src/memory/triggers.ts — los recordatorios que esperan a un cambio, y dispararlos
- modificar packages/core/src/index.ts — exporta `waitingFor` y `firedEntry`
- crear packages/core/test/memory/close-trigger.test.ts — el campo `onClose`, la sesión sin los que esperan y el disparo
- crear packages/core/test/cards/close-reminders.test.ts — la lista, la sección de los disparados, el asunto del commit y los rechazos, en español y en inglés
- modificar packages/cli/src/commands/memory.ts — `memory add --on-close` y sus rechazos
- modificar packages/cli/src/flow/finish.ts — `archive` dispara los recordatorios del cambio, y su sección en la salida
- modificar packages/cli/src/commands/finish.ts — `close` y `cancel` muestran los disparados
- modificar packages/cli/src/commands/accept.ts — `accept` de un quick muestra los disparados
- modificar packages/cli/src/commands/retro.ts — la confirmación de un retro muestra los disparados
- crear packages/cli/test/memory-on-close.test.ts — un recordatorio al cerrar un cambio, de punta a punta
- modificar docs/formats.md — `onClose`, `--on-close` y cuándo se dispara
- modificar docs/ARCHITECTURE.md — `memory add --on-close`, «TE TOCA» y la salida al archivar un cambio

## Tareas

- [x] T1: Los rechazos de la memoria en su propio archivo
  - files: packages/core/src/cards/memory-refusals.ts, packages/core/src/cards/memory.ts, packages/core/src/cards/index.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/reminder-triggers.test.ts test/memory/entries.test.ts test/memory/lessons.test.ts && pnpm lint
  - type: refactor
- [x] T2: Qué recordatorios esperan a un cambio, y dispararlos
  - files: packages/core/src/memory/entries.ts, packages/core/src/memory/triggers.ts, packages/core/src/index.ts, packages/core/test/memory/close-trigger.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/close-trigger.test.ts test/memory/triggers.test.ts test/memory/entries.test.ts && pnpm lint
- [x] T3: Las tarjetas muestran el cambio que esperan, los disparados y los rechazos
  - files: packages/core/src/cards/memory.ts, packages/core/src/cards/memory-refusals.ts, packages/core/src/cards/index.ts, packages/core/test/cards/close-reminders.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/close-reminders.test.ts test/cards/reminder-triggers.test.ts && pnpm typecheck && pnpm lint
- [x] T4: `memory add --on-close`, y el cierre o la cancelación que los disparan
  - files: packages/cli/src/commands/memory.ts, packages/cli/src/flow/finish.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts, packages/cli/src/commands/retro.ts, packages/cli/test/memory-on-close.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-on-close.test.ts test/memory-triggers.test.ts test/memory-settle.test.ts test/memory-harvest.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T5: La documentación de los recordatorios al cerrar un cambio
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un recordatorio cuyo cambio se archiva sin dispararlo, como con una versión anterior de Specty, no vuelve a salir — `specty memory` lo sigue listando con «al cerrar `<id>`», y la persona lo marca hecho o lo descarta.

## Cierre

### Resumen

Un recordatorio de la memoria de Specty puede esperar a que se archive un cambio abierto: `specty memory add --kind reminder --on-close <id>` lo guarda con `onClose`, no sale en la tarjeta de inicio ni en «TE TOCA», y `specty memory` lo lista con «al cerrar `<id>`». Al archivarse ese cambio, se cierre (`close`, `accept` de un quick o un retro confirmado) o se cancele, `archive` dispara cada recordatorio abierto que lo esperaba: pierde `onClose` en su propio commit de la memoria («memoria: P5 disparada»), la salida del comando lo muestra en «RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO» y desde entonces sale en cada sesión hasta que se marca hecho. `--on-close` en otro tipo de entrada, junto a `--due` o `--path`, o con el id de un cambio que no está abierto no anota nada y lo explica. Con P32 queda resuelta también P46: los rechazos de `memory add` y `memory done` viven en `cards/memory-refusals.ts`, y `cards/memory.ts` baja de 372 a unas 240 líneas de código.

### Desviaciones

- `waitingFor` y `firedEntry` están en `memory/entries.ts`, junto a `freeWork` y `settledEntry`, y no en `memory/triggers.ts` como decía el diseño: `entries.ts` ya importa `isDay` de `triggers.ts`, y el camino contrario creaba un import circular.

### Decisiones

- También la cancelación dispara los recordatorios, para que no se pierdan; la persona decide si siguen valiendo.
- Se disparan los recordatorios abiertos, también los propuestos para descartar; los hechos o descartados conservan `onClose` sin efecto.
- El rechazo `two-triggers` lleva `flags` opcional con las dos opciones dadas; sin ellas son `--due` y `--path`, así que su texto anterior y su test no cambian.
- Si el cambio está abierto se comprueba con `locateChanges`, sin leer las specs como `openChanges`, y solo cuando se da `--on-close`.
- La definición de «Disparador» en `docs/dominio.md` incluye ahora `onClose`.

### Pendientes

- `packages/cli/src/commands/memory.ts` tiene 316 líneas de código (el aviso salta a partir de 300). Propuesta de división por responsabilidad: llevar lo que archivar un cambio hace en la memoria (`settleEntries`, `harvestEntries` con `Harvest`, y `fireReminders` de `flow/finish.ts`) a `flow/archive-memory.ts`.
- P45: la página «Memoria» de `specty ui` muestra en «Te toca» también los recordatorios que esperan al cierre de un cambio.
- P2 y P9: `packages/core/src/cards/index.ts` tiene 381 líneas de código y `packages/core/src/index.ts`, 322.
