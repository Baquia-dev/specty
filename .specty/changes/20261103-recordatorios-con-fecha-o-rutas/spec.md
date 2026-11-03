---
kind: standard
---

# Recordatorios con fecha o con rutas

## Objetivo

Primer cambio de P32 (recordatorios con disparador): un recordatorio de la memoria de Specty puede esperar a un día (`specty memory add --kind reminder --due AAAA-MM-DD`) o a que alguien toque unas rutas (`--path`), en vez de salir en cada sesión. Hoy todo recordatorio abierto sale en la tarjeta de inicio y en «TE TOCA» de `specty status`, aunque solo importe en una fecha o al tocar ciertos archivos, y acaba ignorándose.

## Fuera de alcance

- El disparador al cerrar un cambio concreto (`--on-close <id>`): es el cambio siguiente, que resuelve P32.
- La página «Memoria» de la UI: sigue mostrando en «Te toca» todos los recordatorios abiertos, también los que esperan.
- Cambiar el disparador de un recordatorio ya anotado: se marca hecho y se anota otro.
- Recordatorios que se repiten.

## Supuestos

- A1: El día de `--due` es una fecha del calendario en forma `AAAA-MM-DD` y se compara con la fecha local de la máquina, como el id de los cambios. Un recordatorio con un día de hoy o pasado sale ya. Se guarda en el campo `due` del frontmatter, que solo admite un recordatorio.
  - impacto: alto
- A2: Un recordatorio con `--path` es el de esas rutas: no sale en la tarjeta de inicio ni en «TE TOCA», y sale en la tarjeta de la tarea activa o del borrador cuyos archivos encajan con sus rutas, en los dos sentidos, como las lecciones. Va en su propia sección, «RECORDATORIOS DE ESTOS ARCHIVOS», tras la de las lecciones y decisiones, que no cambia.
  - impacto: alto
- A3: Un recordatorio lleva un solo disparador: `--due` y `--path` juntos no se anotan. `--due` en una entrada que no es un recordatorio, tampoco.
- A4: `specty memory` lista el día de un recordatorio que lo tiene («desde AAAA-MM-DD»), y sus rutas como ya hace. `specty memory done` marca hecho un recordatorio, tenga disparador o no.
- A5: Un recordatorio sin disparador sale como hoy, en cada sesión.

## Criterios de aceptación

- AC1: CUANDO se anota un recordatorio con `--due` de un día que no ha llegado ENTONCES no sale en la tarjeta de inicio ni en «TE TOCA» de `specty status`, y `specty memory` lo lista con su día; CUANDO llega ese día ENTONCES sale en las dos hasta que se marca hecho.
- AC2: CUANDO un recordatorio tiene `--path` ENTONCES no sale en la tarjeta de inicio ni en «TE TOCA», y sale en «RECORDATORIOS DE ESTOS ARCHIVOS» de la tarjeta de la tarea cuyos archivos encajan con sus rutas, con cómo marcarlo hecho.
- AC3: CUANDO `--due` no es un día `AAAA-MM-DD` válido, va en una entrada que no es un recordatorio o va junto a `--path` ENTONCES `memory add` no anota nada y explica por qué.

## Diseño

- Core, `memory/entries.ts`: `MemoryEntry.due` (`AAAA-MM-DD`), en el esquema solo para recordatorios.
- Core, `memory/triggers.ts`: `localDay(now)`, el día local; `isDay(text)`, si es una fecha del calendario; `sessionEntries(entries, today)`, las entradas sin los recordatorios que esperan a su día o a sus rutas.
- Core, `memory/paths.ts`: `entriesForPaths` incluye los recordatorios con rutas. `cards/memory-paths.ts` los muestra en su propia sección.
- Core, `cards/memory.ts`: la línea de la lista lleva el día, y `memoryRefusalCard`, los rechazos `bad-date`, `due-not-reminder` y `two-triggers`.
- CLI, `commands/memory.ts`: `memory add --due <día>`. `commands/next.ts` y `commands/status.ts` pasan a sus tarjetas `sessionEntries` con el día local.

## Archivos

- modificar packages/core/src/memory/entries.ts — el campo `due` de un recordatorio
- crear packages/core/src/memory/triggers.ts — el día local y qué recordatorios esperan a su disparador
- modificar packages/core/src/memory/paths.ts — los recordatorios con rutas también encajan con los archivos
- modificar packages/core/src/index.ts — exporta `localDay`, `isDay` y `sessionEntries`
- crear packages/core/test/memory/triggers.test.ts — qué recordatorios salen en la sesión y cuáles con los archivos
- modificar packages/core/src/cards/memory.ts — el día en la lista y los rechazos nuevos de `memory add`
- modificar packages/core/src/cards/memory-paths.ts — la sección «RECORDATORIOS DE ESTOS ARCHIVOS»
- crear packages/core/test/cards/reminder-triggers.test.ts — la lista, la sección de la tarjeta de la tarea y los rechazos, en español y en inglés
- modificar packages/cli/src/commands/memory.ts — `memory add --due`, y sus rechazos
- modificar packages/cli/src/commands/next.ts — la tarjeta de inicio deja fuera los recordatorios que esperan
- modificar packages/cli/src/commands/status.ts — «TE TOCA» deja fuera los recordatorios que esperan
- crear packages/cli/test/memory-triggers.test.ts — un recordatorio con día o con rutas, de punta a punta
- modificar docs/formats.md — `due`, `--due` y los recordatorios con rutas
- modificar docs/ARCHITECTURE.md — la tarjeta de inicio, «TE TOCA» y `memory add` con disparadores

## Tareas

- [x] T1: Qué recordatorios esperan a su día o a sus rutas
  - files: packages/core/src/memory/entries.ts, packages/core/src/memory/triggers.ts, packages/core/src/memory/paths.ts, packages/core/src/index.ts, packages/core/test/memory/triggers.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/triggers.test.ts test/memory/paths.test.ts test/memory/entries.test.ts && pnpm lint
- [ ] T2: Las tarjetas muestran el día, los recordatorios de los archivos y los rechazos
  - files: packages/core/src/cards/memory.ts, packages/core/src/cards/memory-paths.ts, packages/core/test/cards/reminder-triggers.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/reminder-triggers.test.ts test/cards/memory-start.test.ts && pnpm typecheck && pnpm lint
- [ ] T3: `memory add --due`, y la sesión sin los recordatorios que esperan
  - files: packages/cli/src/commands/memory.ts, packages/cli/src/commands/next.ts, packages/cli/src/commands/status.ts, packages/cli/test/memory-triggers.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-triggers.test.ts test/memory.test.ts test/memory-status.test.ts test/memory-start.test.ts test/memory-paths.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T4: La documentación de los recordatorios con disparador
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un recordatorio con rutas que nadie toca no vuelve a salir — `specty memory` lo sigue listando, y la persona lo marca hecho o lo descarta.
