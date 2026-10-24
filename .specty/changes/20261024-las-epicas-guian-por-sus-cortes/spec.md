---
kind: standard
---

# Las épicas guían por sus cortes

## Objetivo

Una épica aprobada queda en `implementing` para siempre: nada dispara `childrenDone`, y su tarjeta, al no tener tarea activa, cae en la de aceptación y pide un `accept` que se rechaza. La otra sesión tuvo que cancelar su épica por eso. Ahora la tarjeta de la épica lista sus cortes con su estado y propone el siguiente paso, `next` la pasa a aceptación cuando todos los cortes están cerrados, `new --epic --slice` rechaza un corte que no puede empezar, y aceptarla y cerrarla funciona como en un cambio standard, sin verificar código que no tiene.

## Fuera de alcance

- Que una sesión pase de la carpeta de la épica a la de un corte (la regla de una sesión por worktree): es el cambio siguiente.
- Ver la épica y sus cortes en la UI.
- Rellenar la spec del corte con los criterios de la épica.

## Supuestos

- A1: Un corte está cerrado si un cambio con `epic: <id>` y `slice: <C>` en su frontmatter está en fase `done`, en el archivo de la carpeta principal o en cualquier worktree. Un cambio cancelado no cuenta, así que el corte puede volver a empezar.
- A2: Los cortes se derivan cada vez de los cambios hijos: la épica no guarda en su estado qué cambio implementa cada corte, para tener una sola fuente de verdad.
- A3: Si hay varios cortes listos, la tarjeta propone el primero en el orden de la spec; los demás se pueden empezar en paralelo en otras sesiones.
- A4: Al aceptar una épica no se ejecuta la verificación completa, ni al incorporarla: no tiene código propio, y cada corte se verificó al cerrarse.

## Criterios de aceptación

- AC1: CUANDO una épica aprobada está en `implementing` ENTONCES `specty next` lista sus cortes con su estado (cerrado, en curso con su cambio, listo para empezar o a la espera de sus `depends`), y su SIGUIENTE propone seguir con el corte en curso o empezar el primero listo con `specty new "<título>" --epic <id> --slice <C>`. Nunca pide un `accept`.
- AC2: CUANDO todos los cortes de la épica tienen un cambio cerrado ENTONCES `specty next` la pasa a aceptación, lo anota como `epic.slicesDone` con el cambio de cada corte, y la tarjeta de aceptación lista los cortes.
- AC3: CUANDO `specty new --epic <id> --slice <C>` nombra una épica que no está abierta y aprobada, un corte que no tiene, un corte cuyas dependencias no están cerradas o un corte que ya tiene un cambio abierto, o falta una de las dos opciones, ENTONCES lo rechaza diciendo por qué, sin crear nada.
- AC4: CUANDO la persona acepta una épica ENTONCES la nota lista los cortes y no se ejecuta la verificación completa.
- AC5: CUANDO se cierra una épica ENTONCES se incorpora a la rama principal como un cambio standard, sin verificación.

## Diseño

- Core, `cards/epic.ts`: `epicCard` (la tarjeta de la épica en `implementing`) y `sliceLines` (una línea por corte, también para la aceptación). `ChangeView.slices` lleva los cortes (`SliceView`: id, título, `depends`, estado y el cambio hijo).
- CLI, `flow/epic.ts`: busca los cambios hijos (los abiertos de cada worktree y los archivados de la carpeta principal y de esta), deriva el estado de cada corte, pasa la épica a aceptación con `childrenDone` y explica por qué un corte no puede empezar.
- `next` cierra la fase de la épica antes de mostrar su tarjeta; `changeView` añade los cortes; `new` rechaza el corte inválido; `accept` y `absorbTarget` no verifican una épica, que pasa a incorporarse como un standard.

## Archivos

- modificar packages/core/src/cards/view.ts — `SliceView` y `ChangeView.slices`
- crear packages/core/src/cards/epic.ts — la tarjeta de la épica y las líneas de los cortes
- modificar packages/core/src/cards/work.ts — la épica en `implementing` y los cortes en aceptación
- modificar packages/core/src/index.ts — exportar `epicCard`, `sliceLines` y `SliceView`
- crear packages/core/test/cards/epic.test.ts — la tarjeta de la épica
- crear packages/cli/src/flow/epic.ts — los cortes de una épica, su cierre y la validación de un corte
- modificar packages/cli/src/flow/views.ts — los cortes en la vista
- modificar packages/cli/src/commands/next.ts — la épica pasa a aceptación
- modificar packages/cli/src/commands/new.ts — rechazar un corte que no puede empezar
- modificar packages/cli/src/commands/accept.ts — sin verificación completa en una épica
- modificar packages/cli/src/flow/integrate.ts — la épica se incorpora, sin verificar
- crear packages/cli/test/epic.test.ts — el flujo de una épica de punta a punta
- modificar docs/ARCHITECTURE.md — §5, §6 y §9
- modificar docs/formats.md — §4: `epic.slicesDone`

## Tareas

- [x] T1: La tarjeta de la épica y los cortes en la aceptación
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/epic.ts, packages/core/src/cards/work.ts, packages/core/src/index.ts, packages/core/test/cards/epic.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/epic.test.ts
- [ ] T2: next lista los cortes y pasa la épica a aceptación
  - files: packages/cli/src/flow/epic.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/next.ts, packages/cli/test/epic.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic.test.ts
- [ ] T3: new rechaza un corte que no puede empezar
  - files: packages/cli/src/flow/epic.ts, packages/cli/src/commands/new.ts, packages/cli/test/epic.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic.test.ts
- [ ] T4: Aceptar y cerrar una épica sin verificar código que no tiene
  - files: packages/cli/src/commands/accept.ts, packages/cli/src/flow/integrate.ts, packages/cli/test/epic.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC4, AC5
  - verify: pnpm check
