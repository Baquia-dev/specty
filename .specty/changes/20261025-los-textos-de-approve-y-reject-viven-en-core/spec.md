---
kind: standard
follows:
  - 20261025-los-textos-de-adjust-y-retro-viven-en-core
---

# Los textos de approve y reject viven en core

## Objetivo

Cuarto cambio de la serie que lleva a core los textos de la CLI, con las primeras decisiones de la persona. `approve` arma en la CLI el resumen de la spec que enseña en la terminal, sus preguntas, sus rechazos y lo que dice al aprobar o al posponer. `reject` y `approve --scope` hacen lo mismo con una ampliación de alcance, y `human.ts` con los textos de elegir el cambio al que se aplica una decisión. Pasan a core: `cards/approve.ts` con los de la spec y del alcance, `cards/decide.ts` con los de elegir el cambio, y `cards/refusals.ts` con lo que comparten («revisa `specty status`» y «Nada cambió.»). La salida no cambia ni una letra.

## Fuera de alcance

- Los textos de `accept`, `close` y `cancel`, que llegan en el siguiente cambio de la serie.
- Cambiar cualquier texto: se mueven tal cual.

## Supuestos

- A1: `postponed`, de `human.ts`, también lo usan `accept.ts` y `finish.ts`: se queda en la CLI como envoltorio sin textos de `decisionPostponedCard` hasta el siguiente cambio, para no tocar esos archivos ahora.

## Criterios de aceptación

- AC1: CUANDO la persona aprueba una spec, rechaza un supuesto o la pospone, o la aprobación se rechaza (sin cambio activo, spec cambiada o transición rechazada) ENTONCES la terminal y la tarjeta muestran lo mismo que antes, y los textos salen de `cards/approve.ts` de core.
- AC2: CUANDO la persona aprueba o rechaza una ampliación de alcance, o no existe la que nombra ENTONCES la terminal y la tarjeta muestran lo mismo que antes, y los textos salen de core.
- AC3: CUANDO la decisión se aplica a un cambio de otra carpeta, o ninguno la espera, o el que se nombra no existe ENTONCES la salida es la misma que antes y sale de `cards/decide.ts` de core.
- AC4: CUANDO se ejecutan los tests de core ENTONCES cubren cada caso, en español y en inglés.

## Archivos

- modificar packages/core/src/cards/refusals.ts — checkStatus y nothingChangedCard, que comparten las decisiones
- crear packages/core/src/cards/decide.ts — elegir el cambio al que se aplica una decisión
- crear packages/core/src/cards/approve.ts — los textos de approve y reject, de la spec y del alcance
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/decide.test.ts — tests de decide.ts y de lo que comparten
- crear packages/core/test/cards/approve.test.ts — tests de approve.ts
- modificar packages/cli/src/commands/approve.ts — pedir sus textos a core
- modificar packages/cli/src/commands/scope-decision.ts — pedir sus textos a core
- modificar packages/cli/src/commands/human.ts — pedir sus textos a core

## Tareas

- [x] T1: Core tiene los textos de elegir el cambio y de aprobar o rechazar
  - files: packages/core/src/cards/refusals.ts, packages/core/src/cards/decide.ts, packages/core/src/cards/approve.ts, packages/core/src/cards/index.ts, packages/core/test/cards/decide.test.ts, packages/core/test/cards/approve.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T2: approve, reject y la elección del cambio piden sus textos a core
  - files: packages/cli/src/commands/approve.ts, packages/cli/src/commands/scope-decision.ts, packages/cli/src/commands/human.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - type: refactor
