---
kind: standard
follows:
  - 20261025-los-textos-de-new-viven-en-core
---

# Los textos de propose, task done y scope add viven en core

## Objetivo

Segundo cambio de la serie que lleva a core los textos de la CLI. `propose`, `task done` y `scope add` arman en la CLI sus motivos para no hacer nada y lo que dicen al terminar. Pasan a core: `cards/refusals.ts` con lo que comparten varios comandos (que no hay un cambio activo, con el SIGUIENTE de quien lo ejecuta), `cards/task.ts` con los de `task done` y `scope add`, y `cards/flow.ts`, junto a las demás tarjetas de `propose`, con los suyos. La salida no cambia ni una letra.

## Fuera de alcance

- Los textos de los demás comandos, que llegan en los siguientes cambios de la serie.
- Mover las tarjetas que ya están en core (`outOfScopeCard`, `verifyFailedCard`, `scopeRequestedCard`…).
- Cambiar cualquier texto: se mueven tal cual.

## Supuestos

- A1: «No hay un cambio activo.» lleva un SIGUIENTE distinto según quién ejecuta el comando: el agente va a `next`, la persona a `status` y la UI se recarga. Una sola tarjeta con esos tres casos sirve también a `approve`, `reject`, `adjust` y al servidor, que la usarán en los siguientes cambios.

## Criterios de aceptación

- AC1: CUANDO `specty propose` no propone (sin cambio activo, en una fase que no lo admite o con una transición rechazada) ENTONCES muestra el mismo motivo y SIGUIENTE que antes, y la cabecera de una spec propuesta sigue diciendo su revisión; los textos salen de core.
- AC2: CUANDO `specty task done` no completa la tarea (ninguna en implementación, otra tarea, resumen o hallazgo largo o vacío, o una ampliación pendiente) o la completa con avisos ENTONCES su salida es la misma que antes y sale de `cards/task.ts` de core.
- AC3: CUANDO `specty scope add` no amplía nada (fuera de la implementación, tarea no activa, rutas no válidas o sin motivo), cuando las rutas ya estaban dentro o cuando la política aprueba la ampliación ENTONCES su salida es la misma que antes y sale de `cards/task.ts` de core.
- AC4: CUANDO se ejecutan los tests de core ENTONCES cubren cada caso, en español y en inglés.

## Archivos

- crear packages/core/src/cards/refusals.ts — no hay un cambio activo, con el SIGUIENTE de quien ejecuta el comando
- modificar packages/core/src/cards/text.ts — runNext, «ejecuta `specty next`»
- modificar packages/core/src/cards/flow.ts — los textos de propose que faltaban: la fase que no lo admite y la revisión de la cabecera
- crear packages/core/src/cards/task.ts — los textos de task done y scope add
- modificar packages/core/src/index.ts — exportarlos
- crear packages/core/test/cards/refusals.test.ts — tests de refusals.ts y de los textos de propose
- crear packages/core/test/cards/task.test.ts — tests de task.ts
- modificar packages/cli/src/commands/propose.ts — pedir sus textos a core
- modificar packages/cli/src/commands/task.ts — pedir sus textos a core
- modificar packages/cli/src/commands/scope.ts — pedir sus textos a core

## Tareas

- [x] T1: Core tiene los rechazos comunes y los textos de propose
  - files: packages/core/src/cards/refusals.ts, packages/core/src/cards/text.ts, packages/core/src/cards/flow.ts, packages/core/src/index.ts, packages/core/test/cards/refusals.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T2: Core tiene los textos de task done y scope add
  - files: packages/core/src/cards/task.ts, packages/core/src/index.ts, packages/core/test/cards/task.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T3: propose, task done y scope add piden sus textos a core
  - files: packages/cli/src/commands/propose.ts, packages/cli/src/commands/task.ts, packages/cli/src/commands/scope.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - type: refactor
