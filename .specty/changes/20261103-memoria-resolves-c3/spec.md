---
kind: standard
epic: 20261030-memoria-de-specty
slice: C3
---

# Los pendientes se toman al crear su cambio

## Objetivo

Hoy un pendiente de la memoria de Specty se toma citando su id en la petición de `specty new`, pero nadie más lo sabe, así que otra sesión puede empezar el mismo. Con este corte, `specty new --resolves <id>…` deja cada entrada tomada por el cambio que crea. Además, `new` se niega a tomar una que ya lleva otro cambio abierto, y dice cuál, quién lo lleva y cuál es la siguiente libre. Es la primera parte del AC5 de la épica.

## Fuera de alcance

- Cerrar las entradas al cerrarse el cambio, liberarlas al cancelarlo y mostrarlas en la tarjeta del borrador: van en el cambio que sigue a este, para que este no sea XL.
- Los pendientes del cierre convertidos en entradas (AC3 de la épica), y `specty memory drop` con las entradas propuestas para descartar en «TE TOCA» y el guard que impide a los agentes escribir la rama de la memoria con git (AC6 de la épica): van en otros cambios que siguen a este.
- Liberar a mano una entrada tomada por un cambio que sigue abierto.
- Marcar hechas las entradas que ya se resolvieron antes de existir `--resolves`, como P4.

## Supuestos

- A1: Solo se toman pendientes y mejoras. Un recordatorio se marca hecho con `specty memory done`, y una decisión nunca se hace.
  - impacto: alto
- A2: La entrada tomada guarda en su frontmatter el cambio que la tomó y cuándo (`taken`), y su estado pasa a `taken`. Sigue abierta: sale en `specty memory`, pero no entre las libres de la tarjeta de inicio.
  - impacto: alto
- A3: Una entrada tomada por un cambio que ya no está abierto vuelve a estar libre para `--resolves`. Pasa, por ejemplo, con un cambio cerrado o cancelado antes de que exista el cambio que sigue a este.
- A4: `new` comprueba todas las entradas antes de crear nada, y las toma después de crear el cambio, una por commit de la memoria. Si otra sesión tomó una en ese intervalo, la conserva esa sesión.
- A5: La siguiente libre que propone la negativa es la primera por fecha entre los pendientes y las mejoras abiertas que nadie tomó, sin las que pidió `new`.
- A6: `change.created` guarda en el audit las entradas de `--resolves`, para la trazabilidad del cambio.

## Criterios de aceptación

- AC1: CUANDO el agente crea un cambio con `specty new --resolves <id>…` ENTONCES cada entrada queda tomada por ese cambio: `specty memory`, desde cualquier carpeta del clon, la lista como tomada por él, y la tarjeta de inicio ya no la cuenta entre las libres.
- AC2: CUANDO otro cambio abierto ya tomó una de las entradas de `--resolves` ENTONCES `new` no crea nada y dice qué cambio la tomó, en qué fase está, quién lo lleva y cuál es la siguiente entrada libre.
- AC3: CUANDO una entrada de `--resolves` no existe, es un recordatorio o una decisión, o ya está hecha, descartada o propuesta para descartar ENTONCES `new` no crea nada y dice por qué.

## Diseño

- Core, `memory/entries.ts`:
  - `MemoryEntry` gana `taken?: { change, at }`. `MemoryOperation` (`add`, `done` y `take`) nombra lo que hace cada commit de la memoria.
  - `claimable(ids, entries, open)` devuelve las entradas que se pueden tomar o el primer problema: `unknown`, `not-work`, `unavailable` o `taken`, con el cambio que la tomó. `open` son los ids de los cambios abiertos.
  - `freeWork(entries)` da los pendientes y las mejoras libres por fecha. `byDate` pasa aquí desde `cards/memory.ts`.
  - `takenEntry(entry, change, at)` es la entrada tomada.
- Core, tarjetas:
  - `cards/memory-claims.ts`, nuevo: `resolvesRefusalCard`, para cada problema. El de `taken` recibe el `StatusEntry` del cambio que la tomó y la siguiente libre.
  - `cards/memory.ts`: el asunto de commit de `take`, y `specty memory` dice qué cambio tomó cada entrada tomada.
  - `cards/status.ts` exporta `heldBy`, para decir quién lleva el cambio con las mismas palabras que `status`.
- CLI:
  - `commands/status.ts` exporta `openChanges(session)`: los `StatusEntry` de los cambios abiertos de todas las worktrees, que ya calculaba `status`.
  - `commands/memory.ts` exporta `resolvesRefusal(session, ids)` y `takeEntries(session, change, ids)`. Escribe con `editMemory`, una entrada por commit, y vuelve a comprobar cada entrada dentro de la edición.
  - `store/memory.ts` acepta la operación `take`.
  - `new --resolves <ids...>`: comprueba antes de crear y toma después, desde `createChange`, que sirve con y sin worktree.

## Archivos

- modificar packages/core/src/memory/entries.ts — `taken`, las operaciones y las reglas para tomar una entrada
- modificar packages/core/src/index.ts — exporta lo nuevo de la memoria
- modificar packages/core/src/cards/memory.ts — el asunto de commit de `take` y el cambio que tomó cada entrada en `specty memory`
- crear packages/core/src/cards/memory-claims.ts — la tarjeta de `new --resolves` que no crea nada
- modificar packages/core/src/cards/status.ts — exporta `heldBy`
- modificar packages/core/src/cards/index.ts — exporta la tarjeta nueva
- modificar packages/cli/src/store/memory.ts — la operación `take`
- modificar packages/cli/src/commands/memory.ts — comprueba y toma las entradas de `new --resolves`
- modificar packages/cli/src/commands/new.ts — `--resolves`: comprueba antes de crear y toma después
- modificar packages/cli/src/commands/agent-commands.ts — la opción `--resolves`
- modificar packages/cli/src/commands/status.ts — exporta `openChanges`
- crear packages/core/test/memory/claims.test.ts — qué se puede tomar, la entrada tomada y la tarjeta de cada negativa
- crear packages/cli/test/memory-resolves.test.ts — tomar y negarse con la memoria real
- modificar docs/formats.md — `taken` en la entrada y `new --resolves`

## Tareas

- [x] T1: El modelo de la entrada tomada y sus reglas
  - files: packages/core/src/memory/entries.ts, packages/core/src/index.ts, packages/core/src/cards/memory.ts, packages/core/test/memory/claims.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/claims.test.ts -t "what --resolves can take" && pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/entries.test.ts test/cards/memory-start.test.ts && pnpm lint
- [x] T2: La tarjeta de `new --resolves` que no crea nada
  - files: packages/core/src/cards/memory-claims.ts, packages/core/src/cards/status.ts, packages/core/src/cards/index.ts, packages/core/test/memory/claims.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/claims.test.ts test/cards/status-holder.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T3: `new --resolves` toma las entradas, o dice por qué no, y la documentación
  - files: packages/cli/src/store/memory.ts, packages/cli/src/commands/memory.ts, packages/cli/src/commands/new.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/src/commands/status.ts, packages/cli/test/memory-resolves.test.ts, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-resolves.test.ts test/memory.test.ts test/status-json.test.ts test/memory-status.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: La escritura en la memoria falla después de crear el cambio y la entrada queda libre — `new` comprobó antes que lo estaba; `memory` la mostrará libre hasta que otro `new --resolves` la tome, y el cambio sigue sirviendo.
- R2: `new --resolves` lee todos los cambios abiertos para saber quién lleva el que tomó la entrada — solo con `--resolves`, y es lo mismo que ya hace `status`.
- R3: Un cambio de otro clon toma una entrada que este clon no ve — la rama de la memoria es local hasta que la persona la sube (R5 de la épica).
