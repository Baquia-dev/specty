---
kind: standard
epic: 20261106-pendientes-de-la-sesion-por-feature
slice: C2
---

# Un pendiente ajeno que resuelve el trabajo sale de la lista

## Objetivo

Hoy un pendiente que el trabajo de una sesión resuelve sin haberlo tomado con `new --resolves` sigue abierto, y la regla de AGENTS.md (C1) pide nombrarlo en el reporte final sin decir cómo sacarlo de la lista. Con este cambio, `specty memory resolve <ids...>` lo toma para el cambio abierto de la carpeta, con las mismas reglas y negativas que `new --resolves`; al cerrarse el cambio queda hecho y la salida del cierre dice cuáles resolvió. La regla de AGENTS.md pide marcarlos así, y el cierre deja de decir que las sesiones verán al empezar los pendientes que deja, porque desde C1 no los ven. Es el corte C2 de la épica `20261106-pendientes-de-la-sesion-por-feature` (AC4, AC5 y AC10 de la épica).

## Fuera de alcance

- El freno de parecidos de `memory add`: es el corte C3.
- El freno del guard a una entrada del frente que lleva otra conversación: hoy solo mira `new --resolves`, y `memory resolve` no lo tiene en este corte.
- Que «RESUELVE» de la tarjeta del borrador muestre las entradas tomadas con `memory resolve` (A3).
- Devolver una entrada tomada sin cancelar el cambio: no hay `memory unresolve`.
- La página de un cambio con las entradas que tomó: es el corte C5.
- Actualizar el AGENTS.md de este repositorio: lo recibe cuando la persona ejecuta `specty init`.

## Supuestos

- A1: `specty memory resolve <ids...>` toma las entradas para el cambio abierto de la carpeta donde se ejecuta, en cualquiera de sus fases hasta archivarse, como `specty note`. Sin un cambio abierto en la carpeta se niega y no toma nada; no hay opción para tomarlas para el cambio de otra carpeta.
  - impacto: alto
- A2: Toma con las reglas de `new --resolves` (`claimable`): solo pendientes y mejoras abiertas, o tomadas por un cambio que ya no está abierto. Con un id que no puede tomar no toma ninguno de los que nombra, y dice por qué con los textos de `--resolves`, salvo que la negativa nombra `memory resolve` y el siguiente paso propone repetirlo sin ese id; para un recordatorio, propone además `specty memory done <id>`. Una entrada que ya tomó este mismo cambio no es una negativa: sigue tomada y no se escribe nada.
  - impacto: medio
- A3: El cambio no anota en su auditoría ni en su estado las entradas que toma `memory resolve`: la memoria guarda el cambio en `taken`, y su commit lleva el trailer `Specty-Change`. Por eso «RESUELVE» del borrador sigue mostrando solo las de `new --resolves` (`change.created`), y el cierre lee las tomadas de la memoria, como ya hace `settleEntries`.
  - impacto: medio
- A4: La salida del comando que cierra el cambio (`close`, `accept` de un quick o un retro confirmado) nombra en «PENDIENTES QUE RESOLVIÓ ESTE CAMBIO», antes de los recordatorios que disparó y de los pendientes que deja, cada entrada que marcó hecha, la tomara con `--resolves` o con `memory resolve`. La de `cancel` no añade nada: las entradas vuelven a estar libres sin más aviso.
  - impacto: bajo
- A5: La última regla del bloque de AGENTS.md añade «y márcalos con `specty memory resolve <id>`» tras «nombra solo los que tu trabajo resolvió», en la misma viñeta, para que el bloque siga en 15 líneas.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO un agente ejecuta `specty memory resolve P1` en la carpeta de un cambio abierto ENTONCES P1 queda tomada por ese cambio, `specty memory` la lista «tomada por `<cambio>`» y la salida la nombra y dice que queda hecha al cerrarse el cambio y libre si se cancela.
- AC2: CUANDO se cierra el cambio que tomó P1 con `memory resolve` ENTONCES P1 queda hecha, sale de las abiertas y la salida del cierre la nombra en «PENDIENTES QUE RESOLVIÓ ESTE CAMBIO»; CUANDO se cancela ENTONCES P1 vuelve a estar libre.
- AC3: CUANDO `memory resolve` nombra una entrada que no existe, ya hecha, descartada o propuesta para descartar, un recordatorio, una decisión o una entrada que tomó otro cambio abierto ENTONCES no toma ninguna de las que nombra y dice por qué y qué hacer.
- AC4: CUANDO se ejecuta `memory resolve` en una carpeta sin un cambio abierto ENTONCES no toma nada y dice que toma las entradas para el cambio abierto de la carpeta.
- AC5: CUANDO `init` escribe el bloque de reglas de AGENTS.md ENTONCES la última regla pide marcar con `specty memory resolve <id>` los pendientes ajenos que el trabajo resolvió.
- AC6: CUANDO el cierre deja pendientes en la memoria ENTONCES su salida dice que la persona los ve en la página Memoria de `specty ui` y con `specty memory`, y no que las sesiones los verán al empezar.
- AC7: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/memory-claims.ts`, que ya dice qué toma un cambio: `memoryResolvedCard` (las entradas tomadas, con las líneas de «RESUELVE» de `resolvesLines`) y `memoryResolveRefusalCard`, que reusa los motivos de `resolvesRefusalCard` (el de «no es un pendiente» nombra el comando) y añade `no-change`. Se exportan en `cards/index.ts`.
- Core, `cards/archived-memory.ts`: `resolvedBlocks` (lo que el cierre marcó hecho) y la última línea de `harvestedBlocks` (A4, AC6).
- Core, `agents-md.ts`: la última viñeta de `ruleLines` (A5).
- CLI, `commands/memory-resolve.ts`, nuevo: `resolveEntries`, con el candado del cambio, como `note`; y `claimEntries` y `takeEntries`, que salen de `commands/memory.ts` (324 líneas) para que el archivo no crezca y sin importaciones en ciclo. `takeEntries` recibe el destino de la memoria, que `new.ts` calcula con `targetOf`. Las comprobaciones de `claimEntries` se separan de su tarjeta para que `memory resolve` las use sin contar como «otro cambio» el suyo.
- CLI, `commands/memory.ts`: registra `memory resolve <ids...>` con su ayuda, junto a `drop` y `keep`.
- CLI, `flow/archive-memory.ts`: `settleEntries` devuelve las entradas que marcó hechas (ninguna al cancelar), `archive` (`flow/finish.ts`) las guarda en `resolved` y `withArchivedMemory` las muestra primero.

## Archivos

- modificar packages/core/src/cards/memory-claims.ts — las tarjetas de `memory resolve`: lo que toma y por qué no toma nada
- modificar packages/core/src/cards/archived-memory.ts — el bloque de lo que resolvió el cierre, y la última línea de los pendientes que deja
- modificar packages/core/src/cards/index.ts — exporta las tarjetas de `memory resolve` y `resolvedBlocks`
- crear packages/core/test/cards/memory-resolve.test.ts — las tarjetas de `memory resolve`, en español y en inglés
- modificar packages/core/test/cards/archived-memory.test.ts — lo que resolvió el cierre y la nueva última línea de los pendientes, en español y en inglés
- crear packages/cli/src/commands/memory-resolve.ts — `memory resolve`, y `claimEntries` y `takeEntries`, que salen de `memory.ts`
- modificar packages/cli/src/commands/memory.ts — registra `memory resolve`, sin las funciones que pasan a `memory-resolve.ts`
- modificar packages/cli/src/commands/new.ts — toma `claimEntries` y `takeEntries` de `memory-resolve.ts`
- crear packages/cli/test/memory-resolve.test.ts — `memory resolve` de punta a punta: lo que toma, cuándo se niega y qué pasa al cerrar y al cancelar
- modificar packages/cli/src/flow/archive-memory.ts — `settleEntries` devuelve las entradas que marcó hechas, y `withArchivedMemory` las muestra
- modificar packages/cli/src/flow/finish.ts — `archive` guarda en `resolved` las entradas que marcó hechas
- modificar packages/cli/test/close-harvest.test.ts — la nueva última línea de los pendientes que deja el cierre
- modificar packages/core/src/agents-md.ts — la regla del reporte final pide marcar con `specty memory resolve <id>`
- modificar packages/core/test/cards.test.ts — la regla, en español y en inglés
- modificar docs/formats.md — `memory resolve`, la salida del cierre y el bloque de AGENTS.md
- modificar docs/ARCHITECTURE.md — `memory resolve` en la lista de comandos
- modificar docs/decisions/0016-la-memoria-de-specty.md — cómo se marca resuelto un pendiente ajeno

## Tareas

- [x] T1: Las tarjetas de `memory resolve` y de lo que resolvió el cierre
  - files: packages/core/src/cards/memory-claims.ts, packages/core/src/cards/archived-memory.ts, packages/core/src/cards/index.ts, packages/core/test/cards/memory-resolve.test.ts, packages/core/test/cards/archived-memory.test.ts
  - ac: AC1, AC2, AC3, AC4, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/memory-resolve.test.ts test/cards/archived-memory.test.ts test/memory/claims.test.ts test/memory/lessons.test.ts
  - type: feat
- [x] T2: El cierre dice qué entradas tomadas resolvió, y que la persona ve los pendientes que deja
  - files: packages/cli/src/flow/archive-memory.ts, packages/cli/src/flow/finish.ts, packages/cli/test/close-harvest.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/close-harvest.test.ts test/memory-settle.test.ts test/memory-harvest.test.ts && pnpm lint
  - type: feat
- [x] T3: `specty memory resolve` toma las entradas para el cambio de la carpeta
  - files: packages/cli/src/commands/memory-resolve.ts, packages/cli/src/commands/memory.ts, packages/cli/src/commands/new.ts, packages/cli/test/memory-resolve.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-resolve.test.ts test/memory-resolves.test.ts test/memory-settle.test.ts test/memory-drop.test.ts test/commands-named.test.ts && pnpm lint
  - type: feat
- [ ] T4: La regla del reporte final pide marcar con `memory resolve` los pendientes ajenos resueltos, y la documentación lo cuenta
  - files: packages/core/src/agents-md.ts, packages/core/test/cards.test.ts, docs/formats.md, docs/ARCHITECTURE.md, docs/decisions/0016-la-memoria-de-specty.md
  - ac: AC5, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts test/agents-md.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/commands-named.test.ts && pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: feat

## Riesgos

- R1: Un agente marca como resuelto un pendiente que su trabajo no resolvió del todo — la entrada solo queda hecha al cerrarse el cambio, la salida del cierre la nombra para que la persona lo vea, y cancelar la devuelve.
- R2: Mover `claimEntries` y `takeEntries` a otro archivo rompe `new --resolves` — los tests de `new --resolves` (`memory-resolves`, `memory-settle`) van en la verificación de T3.
