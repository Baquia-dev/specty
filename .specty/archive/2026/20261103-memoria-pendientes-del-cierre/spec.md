---
kind: standard
follows:
  - 20261103-memoria-cierre-entradas
---

# Los pendientes del cierre pasan a la memoria de Specty

## Objetivo

Hoy los «Pendientes» del cierre de un cambio solo los ve el cambio que lo sigue con `--follows`: si nadie lo sigue, se pierden en el archivo. Con este cambio, al cerrarse un cambio, cada pendiente de su cierre pasa a ser un pendiente abierto de la memoria de Specty, con ese cambio como origen, salvo los que ya están en ella. Así se cumple el AC3 de la épica.

## Fuera de alcance

- Decir en la tarjeta de `close` qué pendientes se anotaron: se ven con `specty memory`.
- Cambiar el texto de la tarjeta de cierre que pide llevar a «Pendientes» lo que sigue abierto.
- Leer los pendientes de un cambio cancelado: no tiene cierre.
- `specty memory drop` y su guard (AC6 de la épica): van en el cambio que sigue a este.

## Supuestos

- A1: Un pendiente del cierre es cada viñeta de primer nivel de su sección «### Pendientes» (o «### Follow-ups»), la misma que ya lee `--follows`. Pasa a la memoria como `pending`, con su texto tal cual.
  - impacto: alto
- A2: No se anota una viñeta que cita el id de una entrada que ya está en la memoria (como «P9: …»), que dice que no queda ninguno («Ninguno.», «Ninguna», «None.»), o cuyo texto es el de una entrada abierta. Dos viñetas iguales se anotan una vez.
  - impacto: alto
- A3: Se anotan al archivar un cambio cerrado (con `close`, `accept` de un cambio quick o un retro confirmado), después de cerrar las entradas que tomó, cada una en su propio commit de la memoria. Su origen es ese cambio y quien lo cerró.

## Criterios de aceptación

- AC1: CUANDO se cierra un cambio cuyo cierre tiene «### Pendientes» ENTONCES cada viñeta pasa a ser un pendiente abierto de la memoria de Specty, con ese cambio como origen.
- AC2: CUANDO una viñeta cita el id de una entrada que ya está en la memoria, dice que no queda ninguno, o repite el texto de una entrada abierta ENTONCES no se anota otra vez.

## Diseño

- Core: `harvestable(items, memory)` en `memory/entries.ts` devuelve los textos que se anotan, sin los que ya están en la memoria (`memory` son sus entradas y todos sus ids).
- CLI:
  - `flow/carried.ts` exporta `closingFollowUps(session, files)`: las viñetas de «### Pendientes» del cierre de un cambio, que ya leía para `--follows`.
  - `commands/memory.ts` exporta `harvestEntries(session, state, items)`: anota cada texto de `harvestable` como pendiente, con el cambio y quien lo cerró como origen.
  - `archive` (`flow/finish.ts`), con un cambio cerrado, lee sus pendientes y los anota después de `settleEntries`.

## Archivos

- modificar packages/core/src/memory/entries.ts — qué pendientes del cierre se anotan
- modificar packages/core/src/index.ts — exporta `harvestable`
- modificar packages/cli/src/flow/carried.ts — exporta los pendientes del cierre de un cambio
- modificar packages/cli/src/commands/memory.ts — los anota en la memoria
- modificar packages/cli/src/flow/finish.ts — al archivar un cambio cerrado
- crear packages/core/test/memory/harvest.test.ts — qué viñetas se anotan y cuáles no
- crear packages/cli/test/memory-harvest.test.ts — cerrar un cambio con pendientes, con la memoria real
- modificar docs/formats.md — los pendientes del cierre en la memoria

## Tareas

- [x] T1: Qué pendientes del cierre se anotan
  - files: packages/core/src/memory/entries.ts, packages/core/src/index.ts, packages/core/test/memory/harvest.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: Cerrar un cambio anota sus pendientes, y la documentación
  - files: packages/cli/src/flow/carried.ts, packages/cli/src/commands/memory.ts, packages/cli/src/flow/finish.ts, packages/cli/test/memory-harvest.test.ts, docs/formats.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-harvest.test.ts test/memory-settle.test.ts test/findings.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: La memoria se llena de pendientes que el agente ya iba a hacer enseguida — se toman con `new --resolves`, y la persona puede descartarlos cuando exista `memory drop`.
- R2: Una viñeta que cita un id por otro motivo no se anota — es raro, y el texto sigue en el cierre archivado.
- R3: Un cierre con muchas viñetas hace muchos commits en la memoria — uno por pendiente, como `memory add`.

## Cierre

### Resumen

Al archivarse un cambio cerrado (con `close`, `accept` de un cambio quick o un retro confirmado), cada viñeta de «### Pendientes» de su cierre pasa a ser un pendiente abierto de la memoria de Specty, con ese cambio y quien lo cerró como origen, en su propio commit. No se anotan las viñetas vacías, las que dicen que no queda ninguno, las que citan el id de una entrada de la memoria ni las que repiten el texto de una entrada abierta. Lo decide `harvestable`, en core, y la CLI lo aplica desde `archive`, después de cerrar o liberar las entradas que tomó el cambio. Con esto se cumple el AC3 de la épica.

### Desviaciones

- Ninguna respecto al plan.

### Decisiones

- La comprobación se repite dentro de cada edición de la memoria, así que un pendiente que otra sesión anotó entretanto no se duplica.
- Una viñeta que cita un id solo se omite si ese id existe en la memoria, aunque su entrada no se pueda leer.

### Pendientes

- Cambio que sigue a 20261103-memoria-pendientes-del-cierre en la épica «Memoria de Specty» (AC6): `specty memory drop <id> --reason "<motivo>"`, con el que la persona descarta una entrada y un agente, también en modo delegado, solo la propone para descartar; las entradas propuestas salen en «TE TOCA» de `specty status`; y el guard impide a los agentes escribir con git la rama `specty-memory`.
- P9: `packages/core/src/index.ts` ya tiene 309 líneas de código; decidirlo junto con P2.
