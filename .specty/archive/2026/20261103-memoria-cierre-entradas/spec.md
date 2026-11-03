---
kind: standard
follows:
  - 20261103-memoria-resolves-c3
---

# Las entradas tomadas se cierran o se liberan con su cambio y salen en el borrador

## Objetivo

Desde el corte C3, `specty new --resolves` deja tomadas las entradas de la memoria de Specty, pero se quedan así para siempre: cerrar el cambio no las marca hechas, y cancelarlo no las libera. Con este cambio, al archivarse el cambio sus entradas quedan hechas si se cerró y libres si se canceló, y la tarjeta del borrador muestra las que resuelve, para que la spec las tenga en cuenta. Así se completa el AC5 de la épica.

## Fuera de alcance

- Los pendientes del cierre convertidos en entradas (AC3 de la épica) y `specty memory drop` con su guard (AC6): van en los cambios que siguen a este.
- Mostrar las entradas tomadas fuera del borrador, como en la tarjeta de la tarea o en la de aceptación.
- Avisar en la tarjeta de `close` o de `cancel` de las entradas que cerró o liberó: se ven con `specty memory`.
- P9 y P10 de la memoria.

## Supuestos

- A1: Las entradas se cierran o se liberan al archivar el cambio, así que vale para `close`, para `accept` de un cambio quick, para la confirmación de un retro y para `cancel`. Son las entradas tomadas por ese cambio cuando se archiva.
  - impacto: alto
- A2: Hecha, la entrada guarda quién cerró el cambio y cuándo (`closed`, como `memory done`) y conserva `taken`, para saber qué cambio la resolvió. Liberada, vuelve a `open` sin `taken`.
- A3: La tarjeta del borrador muestra las entradas que `change.created` anotó en `resolves`, tal como están en la memoria en ese momento, con su id, su tipo y la primera línea de su texto. Sin `resolves`, la tarjeta no lee la memoria y queda como antes.
- A4: Cada entrada se cierra o se libera en su propio commit de la memoria, y solo si sigue tomada por ese cambio.

## Criterios de aceptación

- AC1: CUANDO se cierra un cambio que tomó entradas con `--resolves` ENTONCES quedan hechas, con quién cerró el cambio y cuándo, y `specty memory` ya no las lista entre las abiertas.
- AC2: CUANDO se cancela un cambio que tomó entradas ENTONCES vuelven a estar libres: `specty memory` las lista sin el cambio que las tomó, y la tarjeta de inicio vuelve a ofrecerlas.
- AC3: CUANDO el agente lee la tarjeta del borrador de un cambio creado con `--resolves` ENTONCES ve la sección «RESUELVE» (en inglés, «RESOLVES») con cada entrada, y que quedarán hechas al cerrarse el cambio.

## Diseño

- Core:
  - `memory/entries.ts`: `settledEntry(entry, closed?)` da la entrada hecha (con `closed`) o liberada (sin él), y `MemoryOperation` gana `free`.
  - `cards/memory.ts`: el asunto de commit de `free` y `resolvesLines(entries, ctx)`, las líneas de la sección «RESUELVE».
  - `ChangeView` gana `resolves`, y `cards/next.ts` pone la sección en la tarjeta del borrador, después de la petición del usuario.
- CLI:
  - `commands/memory.ts` exporta `settleEntries(session, state)`: lee la memoria y cierra o libera, una por commit, las entradas que siguen tomadas por ese cambio. Si no hay ninguna, no escribe.
  - `archive` (`flow/finish.ts`) llama a `settleEntries` con el estado final del cambio.
  - `flow/views.ts`: en el borrador, si `change.created` lleva `resolves`, lee la memoria y pasa esas entradas a la vista.

## Archivos

- modificar packages/core/src/memory/entries.ts — `settledEntry` y la operación `free`
- modificar packages/core/src/index.ts — exporta `settledEntry`
- modificar packages/core/src/cards/memory.ts — el asunto de commit de `free` y las líneas de «RESUELVE»
- modificar packages/core/src/cards/view.ts — `ChangeView.resolves`
- modificar packages/core/src/cards/next.ts — la sección «RESUELVE» en la tarjeta del borrador
- modificar packages/cli/src/commands/memory.ts — cierra o libera las entradas de un cambio
- modificar packages/cli/src/flow/finish.ts — lo hace al archivar el cambio
- modificar packages/cli/src/flow/views.ts — las entradas de `resolves` en la vista del borrador
- crear packages/core/test/memory/settle.test.ts — la entrada hecha o liberada, y la sección del borrador
- crear packages/cli/test/memory-settle.test.ts — cerrar, cancelar y el borrador con la memoria real
- modificar docs/formats.md — qué pasa con las entradas tomadas al archivar el cambio

## Tareas

- [x] T1: La entrada hecha o liberada, y la sección del borrador
  - files: packages/core/src/memory/entries.ts, packages/core/src/index.ts, packages/core/src/cards/memory.ts, packages/core/src/cards/view.ts, packages/core/src/cards/next.ts, packages/core/test/memory/settle.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory test/cards/findings.test.ts test/cards/memory-start.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: Archivar el cambio cierra o libera sus entradas, y el borrador las muestra
  - files: packages/cli/src/commands/memory.ts, packages/cli/src/flow/finish.ts, packages/cli/src/flow/views.ts, packages/cli/test/memory-settle.test.ts, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-settle.test.ts test/memory-resolves.test.ts test/commands.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Archivar un cambio lee la memoria aunque no tomara nada — son tres procesos de git, una vez por cambio, y solo escribe si alguna entrada es suya.
- R2: La escritura en la memoria falla al archivar y la entrada queda tomada por un cambio ya archivado — `new --resolves` ya trata como libre una entrada tomada por un cambio que no está abierto.
- R3: El borrador lee la memoria en cada `next` — solo si el cambio se creó con `--resolves`, y solo en el borrador.

## Cierre

### Resumen

Las entradas de la memoria de Specty que toma un cambio con `--resolves` ya no se quedan tomadas para siempre. Al archivarse el cambio, `archive` llama a `settleEntries`, que trata las que siguen tomadas por él:
- si se cerró (con `close`, `accept` de un cambio quick o un retro confirmado), quedan hechas, con quien lo cerró en `closed` y el cambio aún en `taken`;
- si se canceló, vuelven a estar libres, sin `taken`, y la tarjeta de inicio las ofrece de nuevo.

Cada una va en su propio commit de la memoria («memoria: P1 hecha» o «memoria: P1 libre de nuevo»). La tarjeta del borrador muestra en «RESUELVE» las entradas que toma el cambio, con su tipo y su texto, y qué les pasará. Con esto se completa el AC5 de la épica.

### Desviaciones

- Las tres condiciones del borrador de `phaseFacts` pasaron a una sola función, `draftFacts`, para no subir su complejidad.

### Decisiones

- `settledEntry` conserva `taken` en una entrada hecha, para saber qué cambio la resolvió.
- El borrador solo lee la memoria si `change.created` lleva `resolves`.

### Pendientes

- Los cambios que siguen dentro del corte C3: los pendientes del cierre convertidos en entradas (AC3 de la épica) y `specty memory drop` con su guard (AC6).
- P9: `packages/core/src/index.ts` ya tiene 303 líneas de código; decidirlo junto con P2.
