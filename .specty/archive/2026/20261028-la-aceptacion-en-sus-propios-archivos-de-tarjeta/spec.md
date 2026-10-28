---
kind: standard
follows:
  - 20261028-los-tests-aprobados-no-se-pueden-cambiar-sin-per
---

# La aceptación, en sus propios archivos de tarjetas y de vista

## Objetivo

`core/src/cards/work.ts` (302 líneas de código) y `cli/src/flow/views.ts` (306) pasan del aviso de 300, y los cortes C4 y C6 de la épica «Tests como contrato» van a añadirles más de la aceptación. Este cambio les saca lo de la aceptación, sin cambiar ninguna salida:
- `cards/acceptance.ts` tiene la tarjeta de aceptación, sus avisos y su SIGUIENTE, y las líneas que comparte con la tarjeta de tarea (las tareas hechas, las aserciones quitadas y los riesgos);
- `flow/acceptance.ts` tiene lo que la vista sabe solo en la aceptación (la revisión independiente recomendada, la matriz de criterios y los tests desbloqueados).

## Fuera de alcance

- `cards/index.ts` (303), que es la lista explícita de la API de textos de core.
- Cambiar ningún texto ni ningún test.

## Supuestos

- A1: `work.ts` importa de `acceptance.ts` y no al revés, para que no haya un ciclo entre los dos.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --changed` sobre este cambio ENTONCES `max-lines` no avisa de `cards/work.ts` ni de `flow/views.ts`.
  - test: manual
- AC2: CUANDO se ejecutan los tests de core y de la CLI ENTONCES pasan sin cambiar ninguno.
  - test: manual

## Archivos

- modificar packages/core/src/cards/work.ts — sin la tarjeta de aceptación
- crear packages/core/src/cards/acceptance.ts — la tarjeta de aceptación, sus avisos y las líneas compartidas
- modificar packages/core/src/cards/next.ts — la tarjeta de aceptación desde `acceptance.ts`
- modificar packages/core/src/cards/accept.ts — los avisos desde `acceptance.ts`
- modificar packages/core/src/cards/task.ts — los avisos desde `acceptance.ts`
- modificar packages/core/src/cards/index.ts — exporta los avisos desde `acceptance.ts`
- modificar packages/cli/src/flow/views.ts — sin los datos de la aceptación
- crear packages/cli/src/flow/acceptance.ts — los datos de la aceptación de la vista

## Tareas

- [x] T1: La tarjeta de aceptación en cards/acceptance.ts
  - files: packages/core/src/cards/work.ts, packages/core/src/cards/acceptance.ts, packages/core/src/cards/next.ts, packages/core/src/cards/accept.ts, packages/core/src/cards/task.ts, packages/core/src/cards/index.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards && pnpm typecheck
  - type: refactor
- [x] T2: Los datos de la aceptación en flow/acceptance.ts
  - files: packages/cli/src/flow/views.ts, packages/cli/src/flow/acceptance.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/flow.test.ts test/test-locks.test.ts test/criteria-tests.test.ts
  - type: refactor

## Cierre

### Resumen

`cards/acceptance.ts` tiene la tarjeta de aceptación, sus avisos y su SIGUIENTE, y `doneLine`, `assertionWarnings` y `riskWarnings`, que comparte con las tarjetas de tarea. `work.ts`, `next.ts`, `accept.ts`, `task.ts` e `index.ts` importan de ahí, y `acceptance.ts` no importa de `work.ts`. `flow/acceptance.ts` tiene `acceptanceFacts`: la revisión recomendada, la matriz de criterios y los tests desbloqueados. `views.ts` la usa en la aceptación. Ni `cards/work.ts` ni `flow/views.ts` pasan ya del aviso de 300 líneas, y ningún texto ni ningún test cambió.

### Desviaciones

- Ninguna.

### Decisiones

- `doneLine` va con la aceptación, que la usa en «TAREAS HECHAS», y la tarjeta de tarea la importa de allí: así no hay un ciclo entre los dos archivos.

### Pendientes

- `cards/index.ts` está en 304 líneas: es la lista explícita de la API de textos de core.
