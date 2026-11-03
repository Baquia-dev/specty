---
kind: standard
follows:
  - 20261103-memoria-pendientes-del-cierre
---

# Solo la persona descarta una entrada de la memoria

## Objetivo

Hoy ninguna entrada de la memoria de Specty se puede descartar: un pendiente que ya no aplica se queda abierto para siempre. Con este cambio, `specty memory drop <id> --reason "<motivo>"` descarta la entrada cuando lo ejecuta la persona desde su terminal. Si lo ejecuta un agente, también en modo delegado, la entrada solo queda propuesta para descartar, y la persona la ve en «TE TOCA» de `specty status` para descartarla o mantenerla. Así se cumple la decisión de la persona del 2026-10-30 (A2 de la épica) y la parte de CLI del AC6. Resuelve la entrada P11 de la memoria, salvo su guard.

## Fuera de alcance

- El guard que impide a los agentes escribir con git la rama `specty-memory`: va en el cambio que sigue a este.
- Descartar desde `specty ui`: va en el corte C7.
- Descartar varias entradas a la vez.

## Supuestos

- A1: Es la persona quien está en una terminal interactiva, como en `approve` o `cancel`. El modo delegado no cuenta: con él, un agente también solo propone, porque descartar nunca se delega.
  - impacto: alto
- A2: La entrada guarda en `drop` el motivo, quién lo pidió y cuándo. Propuesta, su estado es `drop-proposed`; descartada, `dropped`, con `closed` como `memory done`.
  - impacto: alto
- A3: El motivo es obligatorio, salvo cuando la persona descarta una entrada ya propuesta: entonces conserva el de la propuesta.
- A4: No se descarta una entrada hecha o ya descartada, ni una que tomó un cambio abierto: se libera si se cancela ese cambio. Una tomada por un cambio que ya no está abierto sí se descarta.
- A5: `specty memory keep <id>` devuelve a `open`, sin `drop`, una entrada propuesta para descartar. Lo pueden ejecutar la persona y el agente, porque no descarta nada.
- A6: «TE TOCA» muestra primero las propuestas, con quién lo propuso y su motivo, y después los recordatorios.

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `specty memory drop <id> --reason "<motivo>"` desde su terminal ENTONCES la entrada queda descartada, con su motivo, y `specty memory` ya no la lista entre las abiertas.
- AC2: CUANDO un agente ejecuta `specty memory drop <id> --reason "<motivo>"`, también en modo delegado ENTONCES la entrada no se descarta: queda propuesta para descartar, con su motivo y quién la propuso, y la tarjeta le pide al agente que se lo diga al usuario.
- AC3: CUANDO hay entradas propuestas para descartar ENTONCES «TE TOCA» de `specty status` las muestra con quién lo propuso, su motivo y cómo descartarlas o mantenerlas; y con `specty memory keep <id>` la entrada vuelve a estar abierta.
- AC4: CUANDO la entrada no existe, ya está hecha o descartada, la tomó un cambio abierto, o falta el motivo ENTONCES `specty memory drop` no cambia nada y dice por qué.

## Diseño

- Core:
  - `memory/entries.ts`: `MemoryEntry` gana `drop?: { reason, by, at }`, y `MemoryOperation` gana `drop`, `propose-drop` y `keep`. `droppedEntry(entry, drop, person)` da la entrada descartada (persona) o propuesta (agente), y `keptEntry(entry)` la que vuelve a estar abierta.
  - `cards/memory-drop.ts`, nuevo: la tarjeta de `drop` (descartada o propuesta), la de `keep`, la de cada negativa y `dropProposalLines(entries, ctx)`, las líneas de las propuestas en «TE TOCA».
  - `cards/memory.ts`: los asuntos de commit de las operaciones nuevas.
  - `cards/status.ts`: «TE TOCA» lleva las propuestas antes que los recordatorios.
- CLI:
  - `commands/memory-drop.ts`, nuevo: `memory drop <id> [--reason]` y `memory keep <id>`, que `memoryCommand` registra. Lee los cambios abiertos solo si la entrada está tomada.
  - `commands/memory.ts` registra los subcomandos y exporta `targetOf` y `authorOf` para compartirlos.

## Archivos

- modificar packages/core/src/memory/entries.ts — `drop`, las operaciones nuevas y la entrada descartada, propuesta o mantenida
- modificar packages/core/src/index.ts — exporta `droppedEntry` y `keptEntry`
- modificar packages/core/src/cards/memory.ts — los asuntos de commit de `drop`, `propose-drop` y `keep`
- crear packages/core/src/cards/memory-drop.ts — las tarjetas de `memory drop` y `memory keep`, y las propuestas en «TE TOCA»
- modificar packages/core/src/cards/status.ts — las propuestas en «TE TOCA»
- modificar packages/core/src/cards/index.ts — exporta las tarjetas nuevas
- crear packages/cli/src/commands/memory-drop.ts — `memory drop` y `memory keep`
- modificar packages/cli/src/commands/memory.ts — los registra y comparte `targetOf` y `authorOf`
- crear packages/core/test/memory/drop.test.ts — la entrada descartada, propuesta o mantenida, y sus tarjetas
- crear packages/cli/test/memory-drop.test.ts — descartar, proponer, mantener y negarse con la memoria real
- modificar docs/formats.md — `drop` en la entrada, `memory drop` y `memory keep`
- modificar docs/ARCHITECTURE.md — los comandos nuevos de la memoria

## Tareas

- [x] T1: La entrada descartada, propuesta o mantenida
  - files: packages/core/src/memory/entries.ts, packages/core/src/index.ts, packages/core/src/cards/memory.ts, packages/core/test/memory/drop.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/drop.test.ts -t "a dropped, proposed or kept entry" && pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/entries.test.ts test/memory/claims.test.ts && pnpm lint
- [x] T2: Las tarjetas de `memory drop` y `memory keep`, y las propuestas en «TE TOCA»
  - files: packages/core/src/cards/memory-drop.ts, packages/core/src/cards/status.ts, packages/core/src/cards/index.ts, packages/core/test/memory/drop.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/drop.test.ts test/cards/status-turn.test.ts test/cards/status-holder.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T3: `specty memory drop` y `specty memory keep`, y la documentación
  - files: packages/cli/src/commands/memory-drop.ts, packages/cli/src/commands/memory.ts, packages/cli/test/memory-drop.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-drop.test.ts test/memory.test.ts test/memory-status.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un agente propone descartar entradas sin que el usuario lo pida — solo propone: la entrada sigue abierta hasta que la persona decide, y lo ve en «TE TOCA».
- R2: La persona descarta por error una entrada — queda en la rama con su motivo y su historia; no hay comando para recuperarla, pero `specty memory --all` la sigue mostrando.
- R3: Un agente ejecuta `memory drop` en una terminal interactiva propia — es la misma frontera que ya protege `approve` y `cancel`.
