---
kind: standard
follows:
  - 20261103-memoria-lecciones-rutas
---

# Las tarjetas de la tarea y del borrador muestran las lecciones y decisiones de sus archivos

## Objetivo

La memoria de Specty ya guarda lecciones y decisiones ligadas a rutas del código, pero el agente solo las ve si ejecuta `specty memory`. Con este cambio llegan cuando importan: la tarjeta de la tarea activa muestra las de los archivos de la tarea, y la del borrador las de los archivos que ya nombra su spec. Resuelve la entrada P28 de la memoria.

## Fuera de alcance

- Mostrarlas en otras tarjetas, como la de aceptación o la de la revisión.
- Sacar lecciones solas de los cierres o de los hallazgos.

## Supuestos

- A1: Una lección o una decisión abierta corresponde a unos archivos si alguna de sus rutas encaja con alguno de ellos, en los dos sentidos, como los archivos compartidos: `src/api/**` encaja con `src/api/client.ts`, y una tarea con `src/**` encaja con `src/api/client.ts`. Las entradas sin rutas, los pendientes, las mejoras, los recordatorios y las cerradas no salen.
  - impacto: alto
- A2: En la tarjeta de la tarea, los archivos son los de la tarea activa y sus ampliaciones aprobadas; en la del borrador, los de la sección «Archivos» de la spec tal como está, también los de origen de un renombrado. Sin archivos, la memoria no se lee y la tarjeta no cambia.
  - impacto: alto
- A3: La sección «LECCIONES Y DECISIONES DE ESTOS ARCHIVOS» lista cada entrada por fecha, con su id, su tipo, la primera línea de su texto, la cita de una decisión y sus rutas, y termina pidiendo tenerlas en cuenta o proponer descartar la que ya no valga.

## Criterios de aceptación

- AC1: CUANDO el agente lee la tarjeta de su tarea activa y la memoria tiene lecciones o decisiones abiertas cuyas rutas encajan con los archivos de la tarea ENTONCES la tarjeta las muestra en «LECCIONES Y DECISIONES DE ESTOS ARCHIVOS», con su texto, la cita de cada decisión y sus rutas.
- AC2: CUANDO el agente lee la tarjeta del borrador y su spec ya nombra archivos ENTONCES la tarjeta muestra las lecciones y decisiones de esos archivos.
- AC3: CUANDO ninguna lección ni decisión abierta encaja con esos archivos, o aún no hay archivos ENTONCES la tarjeta es la de antes.

## Diseño

- Core:
  - `memory/paths.ts`, nuevo: `entriesForPaths(entries, files)`, las lecciones y decisiones abiertas cuyas rutas encajan, por fecha.
  - `cards/memory-paths.ts`, nuevo: `pathEntriesBlock(entries, ctx)`, la sección.
  - `ChangeView.pathEntries`, y la sección en la tarjeta de la tarea (`cards/work.ts`) y en la del borrador (`cards/next.ts`).
- CLI: `flow/views.ts` lee la memoria solo con archivos (los de la tarea activa o los de la spec en borrador) y pasa `entriesForPaths` a la vista.

## Archivos

- crear packages/core/src/memory/paths.ts — qué lecciones y decisiones corresponden a unos archivos
- modificar packages/core/src/index.ts — exporta `entriesForPaths`
- crear packages/core/src/cards/memory-paths.ts — la sección de las tarjetas
- modificar packages/core/src/cards/view.ts — `ChangeView.pathEntries`
- modificar packages/core/src/cards/work.ts — la sección en la tarjeta de la tarea
- modificar packages/core/src/cards/next.ts — la sección en la tarjeta del borrador
- modificar packages/cli/src/flow/views.ts — las entradas de los archivos de la tarea o del borrador
- crear packages/core/test/memory/paths.test.ts — qué entradas encajan y la sección en las dos tarjetas
- crear packages/cli/test/memory-paths.test.ts — las tarjetas con la memoria real y un cambio
- modificar docs/formats.md — dónde salen las lecciones y decisiones con rutas

## Tareas

- [x] T1: Qué lecciones y decisiones corresponden a unos archivos, y la sección
  - files: packages/core/src/memory/paths.ts, packages/core/src/index.ts, packages/core/src/cards/memory-paths.ts, packages/core/src/cards/view.ts, packages/core/test/memory/paths.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/paths.test.ts -t "which lessons and decisions" && pnpm lint
- [x] T2: La sección en las tarjetas de la tarea y del borrador
  - files: packages/core/src/cards/work.ts, packages/core/src/cards/next.ts, packages/core/test/memory/paths.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/paths.test.ts test/cards/findings.test.ts test/cards/memory-start.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T3: Las tarjetas leen la memoria, y la documentación
  - files: packages/cli/src/flow/views.ts, packages/cli/test/memory-paths.test.ts, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-paths.test.ts test/memory-settle.test.ts test/findings.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: `next` en una tarea lee la memoria cada vez — tres procesos de git, solo con archivos, como la tarjeta de inicio sin cambio.
- R2: Una lección con una ruta muy amplia (`**`) sale en todas las tareas — la persona la descarta o el agente propone acotarla.
