---
kind: standard
---

# Un ajuste corrige la verify de una tarea pendiente mientras se implementa

## Objetivo

Una `verify` de tarea mal escrita (por ejemplo, `vitest run` en la UI de Angular, que no carga sus tests porque van con `ng test`) no tiene arreglo tras aprobar la spec: la tarea no se completa y `specty adjust` solo se admite en aceptación, salvo en una épica, así que hay que cancelar el cambio y rehacerlo (P258). Con este cambio, `specty adjust` también se admite mientras se implementa cualquier cambio con tareas, para corregir las tareas pendientes: su `verify`, sus archivos o su texto. Al aprobarse, el cambio vuelve a `implementing` sin pasar otra vez por la fase de tests, y la tarea activa sigue donde estaba, con su trabajo.

## Fuera de alcance

- Que el rojo de la fase de tests no cuente una suite que no llega a cargarse: depende de cada herramienta de tests, y las reglas de Specty son agnósticas del lenguaje y del framework.
- Añadir o borrar tareas, o cambiar criterios, mientras se implementa: siguen pidiéndose con el resultado en aceptación, o en un cambio de seguimiento.
- Corregir la `verify` en la fase de tests (`testing`), con la spec bloqueada.
- Un botón de la UI para ajustar en `implementing` un cambio que no es una épica: la corrección la pide el agente cuando su tarea no se completa. El servidor la admite igual, porque ejecuta el mismo comando.

## Supuestos

- A1: Mientras se implementa, un ajuste solo corrige las tareas pendientes: puede modificar cualquier campo de una tarea no completada (`verify`, `files`, `ac`, `type`, título) y las secciones que no son tareas ni criterios (Archivos, para declarar un archivo nuevo de esa tarea, Supuestos, Riesgos…). `propose` rechaza con `pending-tasks-only` cada tarea añadida o borrada y cada criterio añadido, modificado o borrado, en `adjusting` como hoy `done-task-changed`. Así el ajuste nunca trae tests nuevos que pasen por el rojo con el trabajo de la tarea activa sin commit.
  - impacto: alto
- A2: Un ajuste pedido en `implementing` se reconoce sin estado nuevo. `propose` lo sabe porque la revisión aprobada aún tiene tareas sin completar: en aceptación todas están hechas, y una épica no tiene tareas, así que ni su ajuste ni el de aceptación cambian. La tarjeta de `adjusting`, porque una tarea sigue activa (`next` activa la primera pendiente al implementar), sin leer la revisión aprobada. `state.json` no gana campos.
  - impacto: medio
- A3: Con `policy.tests: contract`, el ciclo de tests de un ajuste cuenta solo las tareas que trae, las que no estaban en la revisión aprobada, además de los criterios que modifica (`flow/adjusted-tests.ts`): las tareas ya aprobadas pasaron su fase de tests al aprobarse la spec. En aceptación es lo mismo que hoy, porque las aprobadas están hechas. Un ajuste de tareas pendientes vuelve así a `implementing`, y los tests aprobados siguen bloqueados.
  - impacto: alto
- A4: Al aprobarse, la tarea activa conserva su estado tal cual (`active`, `baseCommit`, `startedAt`, intentos y archivos añadidos con `scope add`): `approve` no toca `state.tasks`, y el commit de la spec solo lleva `.specty/`, que el alcance de la tarea no cuenta.
  - impacto: medio
- A5: La máquina admite `adjust` en `implementing` para todo cambio salvo una retro, que no tiene fase de implementación (`kind-not-allowed`). La negativa de las demás fases nombra las dos fases. La petición de un ajuste en `implementing` puede ser del agente (qué corregir y por qué), y su aprobación sigue siendo de la persona, o del agente en modo delegado.
  - impacto: medio
- A6: `possible-new-scope` también avisa de una tarea pendiente que gana un archivo fuera de los aprobados, no solo de una tarea nueva; en aceptación no cambia nada, porque allí las tareas aprobadas están hechas.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty adjust "<petición>"` con un cambio con tareas en `implementing` ENTONCES el cambio pasa a `adjusting` con la petición anotada y la tarjeta de `next` pide corregir solo las tareas pendientes (su `verify`, sus archivos o su texto), sin añadir ni borrar tareas ni cambiar criterios; CUANDO lo ejecuta en otra fase que no es la aceptación ENTONCES la negativa dice que los ajustes se piden mientras se implementan sus tareas o con el resultado en aceptación.
- AC2: CUANDO se propone un ajuste pedido en `implementing` que añade o borra una tarea, o añade, modifica o borra un criterio ENTONCES `propose` lo rechaza con `pending-tasks-only`, que nombra ese elemento; CUANDO solo modifica la `verify` de una tarea pendiente ENTONCES lo admite, y avisa con `possible-new-scope` si esa tarea gana un archivo fuera de los aprobados.
- AC3: CUANDO se aprueba ese ajuste, también con `policy.tests: contract` ENTONCES el cambio vuelve a `implementing` sin pasar por la fase de tests, la tarea activa conserva su `baseCommit` y su inicio, los tests aprobados siguen bloqueados y `task done` la completa con la `verify` corregida.
- AC4: CUANDO falla la verificación de `task done` ENTONCES su SIGUIENTE dice que, si lo que está mal es la propia `verify` de la tarea (no carga ni ejecuta sus tests), se corrige antes con `specty adjust`.

## Diseño

- `flow/machine.ts`: `adjustOutcome` lleva `implementing` a `adjusting` para todo cambio salvo una retro.
- `validate/phase.ts`: `checkAdjusting` reconoce el ajuste pedido en `implementing` porque la revisión aprobada aún tiene tareas sin completar; con él, da `pending-tasks-only` por cada entrada de `specDelta` que es una tarea añadida o borrada, o un criterio. `possible-new-scope` mira las tareas sin completar, no solo las nuevas.
- `cards/adjust.ts`: la negativa de un cambio que no es una épica nombra las dos fases.
- `cards/work.ts`: en `adjusting`, si una tarea sigue activa (el ajuste se pidió mientras se implementaba), la tarjeta da «CÓMO CORREGIRLAS» en lugar de la clasificación de aceptación. `cards/flow.ts`: el SIGUIENTE de `verifyFailedCard` añade la corrección de la `verify` con `adjust`.
- CLI: `flow/adjusted-tests.ts` decide el ciclo con las tareas que trae el ajuste. `commands/adjust.ts` no cambia: la negativa la decide la máquina.

## Archivos

- modificar packages/core/src/flow/machine.ts — `adjust` en `implementing` para todo cambio con tareas
- modificar packages/core/src/validate/phase.ts — `pending-tasks-only` y `possible-new-scope` de las tareas pendientes
- modificar packages/core/src/spec/diagnostics.ts — el código `pending-tasks-only`
- modificar packages/core/src/spec/messages.es.ts — el mensaje de `pending-tasks-only`
- modificar packages/core/src/spec/messages.en.ts — el mensaje de `pending-tasks-only`
- modificar packages/core/src/cards/adjust.ts — la negativa nombra `implementing` y la aceptación
- modificar packages/core/src/cards/work.ts — la tarjeta de `adjusting` para corregir tareas pendientes
- modificar packages/core/src/cards/flow.ts — el SIGUIENTE de la verificación fallida nombra `adjust`
- modificar packages/cli/src/flow/adjusted-tests.ts — el ciclo cuenta solo las tareas que trae el ajuste
- modificar packages/core/test/flow/machine.test.ts — `adjust` en `implementing`
- modificar packages/core/test/cards/adjust.test.ts — la negativa con las dos fases, la tarjeta para corregir tareas pendientes y el SIGUIENTE de la verificación fallida
- modificar packages/core/test/validate/phase.test.ts — `pending-tasks-only` y `possible-new-scope` de una tarea pendiente
- modificar packages/cli/test/commands.test.ts — `adjust` en `implementing` ya no se niega
- modificar packages/cli/test/epic-adjust.test.ts — un cambio que no es una épica se ajusta en `implementing`, de punta a punta con `contract`
- modificar packages/cli/test/server/epic-adjust.test.ts — el servidor ajusta también un cambio que no es una épica en `implementing`
- modificar docs/ARCHITECTURE.md — §4 y §12: el ajuste de las tareas pendientes mientras se implementa
- modificar docs/formats.md — §2: `pending-tasks-only` y `possible-new-scope` de las tareas pendientes
- modificar docs/ui.md — la UI no ofrece el ajuste en `implementing` a lo que no es una épica: lo pide el agente

## Tareas

- [ ] T1: La máquina admite `adjust` en `implementing` y `propose` lo limita a las tareas pendientes
  - files: packages/core/src/flow/machine.ts, packages/core/src/validate/phase.ts, packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/flow/machine.test.ts, packages/core/test/validate/phase.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/flow/machine.test.ts test/validate/phase.test.ts test/spec/messages.test.ts
- [ ] T2: Las tarjetas dicen cuándo se ajusta y cómo corregir las tareas pendientes y su `verify`
  - files: packages/core/src/cards/adjust.ts, packages/core/src/cards/work.ts, packages/core/src/cards/flow.ts, packages/core/test/cards/adjust.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/adjust.test.ts test/cards/adjusting.test.ts
- [ ] T3: La aprobación del ajuste vuelve a la tarea activa sin fase de tests, y la documentación lo cuenta
  - files: packages/cli/src/flow/adjusted-tests.ts, packages/cli/test/epic-adjust.test.ts, packages/cli/test/commands.test.ts, packages/cli/test/server/epic-adjust.test.ts, docs/ARCHITECTURE.md, docs/formats.md, docs/ui.md
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-adjust.test.ts test/commands.test.ts test/server/epic-adjust.test.ts test/adjusted-tests.test.ts && grep -q 'pending-tasks-only' docs/formats.md && grep -q 'pending-tasks-only' docs/ARCHITECTURE.md && grep -q 'tareas pendientes' docs/ui.md && pnpm typecheck && pnpm lint

## Riesgos

- R1: El agente podría usar el ajuste para cambiar una `verify` que falla con razón, en lugar de corregir el código. Mitigación: la tarjeta lo limita a una `verify` que no carga ni ejecuta sus tests, y el ajuste lo aprueba la persona viendo solo el delta.
- R2: Con el trabajo de la tarea activa sin commit, el ajuste podría mezclarlo con la spec. Mitigación: en `adjusting` el código está bloqueado, y `approve` solo hace commit de la carpeta del cambio.
