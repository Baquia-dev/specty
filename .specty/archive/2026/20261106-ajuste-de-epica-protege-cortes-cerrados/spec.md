---
kind: standard
---

# El ajuste de una épica no cambia ni borra un corte cerrado

## Objetivo

Hoy, la tarjeta de `adjusting` de una épica pide no tocar los cortes cerrados, pero `propose` acepta un ajuste que cambia o borra uno: `checkAdjusting` solo protege las tareas hechas, y una épica no tiene. Con este cambio, la CLI pasa a la validación los cortes de la épica cuyo cambio está cerrado, y `propose` rechaza con un error claro el ajuste que cambia su título, su `ac` o su `depends`, o que lo borra. Los cortes nuevos y los que no se han cerrado se siguen ajustando como hoy.

## Fuera de alcance

- Proteger en `review` las tareas hechas de un cambio que se ajusta: `checkAdjusting` sigue corriendo solo en `adjusting`.
- Validar los criterios que cubre un corte cerrado: cambiar su texto sigue siendo cosa de la revisión de la persona.
- Cambiar la tarjeta de `adjusting` de la épica, que ya pide no cambiar ni borrar los cortes cerrados.
- La validación de la UI, que no conoce los cambios de los cortes.

## Supuestos

- A1: Un corte está cerrado cuando su cambio está en `done`, como lo cuentan la tarjeta de la épica y `finishEpic`. Un cambio cancelado no lo cierra, porque su corte puede empezar de nuevo, y uno abierto en cualquier fase, también en aceptación o en cierre, aún se puede ajustar: el ajuste de la épica puede cambiar o borrar esos cortes.
  - impacto: alto
- A2: Un corte cerrado se acepta si coincide con su línea de la revisión aprobada o con la de la última propuesta, que Specty ya validó. Así, un corte que el ajuste estrechó mientras su cambio seguía abierto, y que se cerró antes de que la persona aprobara, no bloquea las propuestas siguientes del mismo ajuste.
  - impacto: alto
- A3: La regla corre en `adjusting` y en `review` cuando hay una revisión aprobada, que en `review` solo existe en la revisión de un ajuste: tras pedir cambios la persona, la propuesta siguiente sale de `review`. El ajuste que viene de `acceptance` y el que viene de `implementing` pasan los dos por `adjusting`. `approve` también valida en `review`, pero su última propuesta es la que aprueba, así que la regla no le cambia nada.
  - impacto: alto
- A4: Los cortes cerrados salen de los cambios que implementan la épica, abiertos en alguna worktree o archivados aquí y en la carpeta principal, como los cuenta la tarjeta de la épica (`childrenOf` en `flow/epic.ts`). La CLI solo los busca para una épica con una revisión aprobada.
- A5: Un corte se compara por su entrada en «Cortes» (título, `ac` y `depends`), no por su posición en la lista.

## Criterios de aceptación

- AC1: CUANDO se propone el ajuste de una épica que cambia el título, el `ac` o el `depends` de un corte cuyo cambio está cerrado ENTONCES `propose` lo rechaza con un error que nombra el corte y su cambio, y que pide llevar lo que falte a un corte nuevo.
- AC2: CUANDO se propone el ajuste de una épica que borra un corte cuyo cambio está cerrado ENTONCES `propose` lo rechaza con el mismo error.
- AC3: CUANDO se propone el ajuste de una épica que añade cortes, o que cambia o borra un corte sin cambio, con su cambio abierto o con su cambio cancelado ENTONCES `propose` no da ese error.
- AC4: CUANDO un corte cambió en una propuesta del ajuste mientras su cambio seguía abierto y ese cambio se cierra antes de la aprobación ENTONCES la propuesta siguiente en `review` que lo deja como estaba en esa propuesta no da el error, y una que lo vuelve a cambiar sí.

## Diseño

- `core/validate/context.ts`: `closedSlices?: ReadonlyMap<string, string>`, cada corte con un cambio cerrado y el id de ese cambio.
- `core/validate/phase.ts`: `checkClosedSlices`, en `adjusting` y `review` con una revisión aprobada. Un corte de `closedSlices` que estaba en la aprobada y que ahora falta, o cuyo hash (`itemHashes`) no es el de la aprobada ni el de la última propuesta, da `closed-slice-changed`, un error con el corte y su cambio, en la línea del corte si sigue en la spec.
- `core/validate/index.ts`: la regla, tras `checkAdjusting`.
- `core/spec/diagnostics.ts`, `messages.es.ts` y `messages.en.ts`: el código y sus mensajes.
- `cli/flow/epic.ts`: `closedSlices(session, epic)`, los cortes de los cambios en `done` de `childrenOf`.
- `cli/flow/analysis.ts`: pasa `closedSlices` a la validación cuando el cambio es una épica con una revisión aprobada.

## Archivos

- modificar packages/core/src/validate/context.ts — los cortes cerrados en el contexto de validación
- modificar packages/core/src/validate/phase.ts — la regla de los cortes cerrados
- modificar packages/core/src/validate/index.ts — la regla en la lista
- modificar packages/core/src/spec/diagnostics.ts — el código `closed-slice-changed`
- modificar packages/core/src/spec/messages.es.ts — su mensaje en español
- modificar packages/core/src/spec/messages.en.ts — su mensaje en inglés
- crear packages/core/test/validate/closed-slices.test.ts — AC1 a AC4, en core
- modificar packages/cli/src/flow/epic.ts — los cortes de la épica con un cambio cerrado
- modificar packages/cli/src/flow/analysis.ts — los pasa a la validación de una épica ajustada
- crear packages/cli/test/epic-closed-slices.test.ts — AC1 a AC3, de punta a punta
- modificar docs/formats.md — la regla de validación
- modificar docs/ARCHITECTURE.md — la tabla de fases y el ajuste de una épica (§12)

## Tareas

- [x] T1: La validación rechaza un corte cerrado que cambia o desaparece
  - files: packages/core/src/validate/context.ts, packages/core/src/validate/phase.ts, packages/core/src/validate/index.ts, packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/validate/closed-slices.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/closed-slices.test.ts test/validate/phase.test.ts
- [x] T2: La CLI pasa los cortes cerrados de la épica a `propose`
  - files: packages/cli/src/flow/epic.ts, packages/cli/src/flow/analysis.ts, packages/cli/test/epic-closed-slices.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-closed-slices.test.ts test/epic-adjust.test.ts test/epic.test.ts && pnpm typecheck && pnpm lint
- [x] T3: La documentación de la regla de los cortes cerrados
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Buscar los cambios de la épica lee las specs archivadas en cada `propose` de una épica ajustada — es lo que ya hace su tarjeta en cada `next`, y solo se parsean las que nombran la épica.

## Cierre

### Resumen

El ajuste de una épica ya no puede cambiar ni borrar un corte cerrado. `analyzeChange` pasa a la validación los cortes de una épica aprobada cuyo cambio está en `done` (`closedSlices` en `flow/epic.ts`, sobre los mismos cambios que cuenta la tarjeta de la épica). `checkClosedSlices` (`validate/phase.ts`) corre en `adjusting` y en la revisión del ajuste. Si un corte cerrado falta, o no es como en la revisión aprobada ni como en la última propuesta, da `closed-slice-changed`: un error que nombra el corte y su cambio y pide llevar lo que falte a un corte nuevo. Los cortes nuevos, y los que no tienen cambio o lo tienen abierto o cancelado, se siguen ajustando. formats.md §2 y ARCHITECTURE (tabla de fases y §12) lo documentan.

### Desviaciones

- **Ninguna respecto al plan.**

### Decisiones

- Un corte está cerrado cuando su cambio está en `done`. Uno cancelado no lo cierra, porque su corte puede empezar de nuevo, y uno abierto, en cualquier fase, aún se puede ajustar.
- La regla también corre en `review` con una revisión aprobada, porque la propuesta que sigue a los comentarios de la persona sale de esa fase. Si solo corriera en `adjusting`, bastaría con volver a proponer para saltársela.
- Un corte cerrado se acepta tal como estaba en la revisión aprobada o en la última propuesta. Así, un corte que el ajuste estrechó mientras su cambio seguía abierto, y que se cerró antes de la aprobación, no bloquea las propuestas siguientes. Borrar un corte cerrado siempre es un error, aunque la última propuesta ya lo hubiera borrado.
- La tarjeta de `adjusting` de la épica no cambió: ya pedía no cambiar ni borrar los cortes cerrados, y ahora el error lo explica cuando pasa.

### Pendientes

- P191: `checkAdjusting` solo corre en `adjusting`. La propuesta que sigue a los comentarios de la persona en `review` puede cambiar o borrar una tarea hecha sin `done-task-changed`. Falta decidir si esa regla corre también en `review` con una revisión aprobada, como la de los cortes cerrados.
