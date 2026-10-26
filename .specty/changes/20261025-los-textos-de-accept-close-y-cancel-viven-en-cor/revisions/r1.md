---
kind: standard
follows:
  - 20261025-los-textos-de-approve-y-reject-viven-en-core
---

# Los textos de accept, close y cancel viven en core

## Objetivo

Quinto cambio de la serie que lleva a core los textos de la CLI, con las decisiones de la persona que faltaban. `accept` arma en la CLI el resumen que enseña antes de aceptar, lo que dice de la verificación completa, sus preguntas, lo que dice al aceptar y el cierre de un cambio quick. `close` y `cancel` hacen lo mismo con lo que hizo el agente al incorporar la rama principal, sus preguntas, lo que archivan y el asunto de sus commits. Pasan a `cards/accept.ts` y `cards/close.ts` de core, con tests. La salida y los commits no cambian ni una letra.

## Fuera de alcance

- Los textos de `withIntegration`, `landChange` y `absorbTarget` (`flow/land.ts` y `flow/integrate.ts`), que llegan con los de `integrate`.
- Los textos de la instalación y de los demás comandos, que llegan en los siguientes cambios de la serie.
- Cambiar cualquier texto: se mueven tal cual.

## Supuestos

- A1: `postponed` de `human.ts` sigue siendo el envoltorio de `decisionPostponedCard` que usan `accept.ts` y `finish.ts`, así que este cambio no toca `human.ts`.

## Criterios de aceptación

- AC1: CUANDO la persona acepta un cambio (con o sin verificación completa, repetida o no, que pasa o falla, en modo delegado o no) o lo pospone ENTONCES la terminal y la tarjeta muestran lo mismo que antes, y los textos salen de `cards/accept.ts` de core.
- AC2: CUANDO un cambio quick se acepta ENTONCES su cierre, el asunto de su commit y lo que dice la tarjeta son los mismos que antes y salen de core.
- AC3: CUANDO la persona cierra o cancela un cambio, o reintenta incorporar uno ya cerrado ENTONCES la terminal, la tarjeta y el asunto del commit son los mismos que antes y salen de `cards/close.ts` de core.
- AC4: CUANDO se ejecutan los tests de core ENTONCES cubren cada caso, en español y en inglés.

## Archivos

- crear packages/core/src/cards/accept.ts — los textos de accept y del cierre de un cambio quick
- crear packages/core/src/cards/close.ts — los textos de close y cancel, y los asuntos de sus commits
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/accept.test.ts — tests de accept.ts
- crear packages/core/test/cards/close.test.ts — tests de close.ts
- modificar packages/cli/src/commands/accept.ts — pedir sus textos a core
- modificar packages/cli/src/commands/finish.ts — pedir sus textos a core

## Tareas

- [ ] T1: Core tiene los textos de accept, close y cancel
  - files: packages/core/src/cards/accept.ts, packages/core/src/cards/close.ts, packages/core/src/cards/index.ts, packages/core/test/cards/accept.test.ts, packages/core/test/cards/close.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T2: accept, close y cancel piden sus textos a core
  - files: packages/cli/src/commands/accept.ts, packages/cli/src/commands/finish.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - type: refactor
