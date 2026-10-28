---
kind: standard
epic: 20261027-tests-como-contrato-y-vocabulario-del-dominio
slice: C4
follows:
  - 20261028-el-test-de-un-bug-se-ve-fallar-y-queda-bloqueado
  - 20261028-con-contract-un-refactor-no-quita-aserciones-de
---

# Los bugs, los refactors y los ajustes siguen su propio ciclo de tests

## Objetivo

Los dos cambios anteriores de C4 ya dan su ciclo a los bugs y a los refactors con `policy.tests: contract`. Falta el de los ajustes. Si un ajuste cambia un criterio, sus tests aprobados ya no dicen lo que hay que construir, pero siguen bloqueados y el ajuste no vuelve a pasar por la persona. Este corte cierra C4:
- al aprobar un ajuste que modifica un criterio, los tests que llevan su id se desbloquean y el cambio vuelve a `testing` con el gate 2, aunque sus tareas nuevas sean `fix`;
- un ajuste que solo añade un defecto, una tarea `fix`, sigue el ciclo de un bug;
- el ciclo se decide al aprobar y queda en `state.json`, para que el envío de los tests lo respete.

## Fuera de alcance

- La UI de la fase de tests, de los bloqueos y de la matriz (C6).
- Leer el rojo test a test (JUnit XML), fuera de la épica.

## Supuestos

- A1: Un criterio está modificado si cambió su texto o su `test` respecto a la revisión aprobada antes del ajuste; uno nuevo no desbloquea nada, porque aún no tiene tests.
  - impacto: alto
- A2: Un test lleva un criterio si una línea de su nombre o un comentario tiene su id (`criterionMarks`, como `criteria-tested`): se desbloquea el archivo entero (A3 de la épica).
- A3: El ciclo que queda en `state.json` (`testCycle`) solo vale mientras el cambio está en `testing`; se borra al salir.

## Criterios de aceptación

- AC1: CUANDO se aprueba un ajuste con `contract` que modifica un criterio y añade tareas ENTONCES los tests bloqueados que llevan el id de ese criterio salen de `lockedTests`, `spec.approved` lo anota y el cambio vuelve a `testing` con el ciclo de una feature.
- AC2: CUANDO el agente reescribe esos tests en `testing` y los envía en rojo ENTONCES esperan la aprobación de la persona, y al aprobarlos vuelven a quedar bloqueados con su versión nueva.
- AC3: CUANDO se aprueba un ajuste con `contract` que solo añade tareas `fix` y no modifica criterios ENTONCES sigue el ciclo de un bug: su test en rojo queda bloqueado sin esperar a la persona.
- AC4: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES dicen cómo un ajuste desbloquea los tests de sus criterios modificados, el campo `testCycle` y el dato `unlocked` de `spec.approved`.
  - test: manual

## Diseño

- `flow/adjusted-tests.ts` tiene dos funciones. `adjustedTests` compara la spec con la revisión aprobada antes, da el ciclo del ajuste (`feature` si modifica un criterio, si no, `testCycle`) y los `lockedTests` sin los tests de esos criterios. `cycleOf` da el ciclo de un cambio en `testing`: el de `state.json`, o el de `testCycle`.
- `approve.ts` usa `adjustedTests` al aprobar, guarda `testCycle` si el cambio entra en `testing` y anota `unlocked` en `spec.approved`.
- `tests.ts` usa `cycleOf` para elegir entre esperar a la persona y bloquear el rojo, y borra `testCycle` al salir de `testing`.

## Archivos

- modificar packages/core/src/schema/state.ts — `testCycle`
- crear packages/cli/src/flow/adjusted-tests.ts — el ciclo de un ajuste y los tests que desbloquea
- modificar packages/cli/src/commands/approve.ts — el ciclo y el desbloqueo al aprobar
- modificar packages/cli/src/commands/tests.ts — el ciclo de `state.json` al enviar los tests
- crear packages/cli/test/adjusted-tests.test.ts — un ajuste que refina un criterio y otro que añade un defecto
- modificar docs/formats.md — `testCycle` y `unlocked` de `spec.approved`
- modificar docs/ARCHITECTURE.md — §4 y §12: los ajustes con `contract`

## Tareas

- [x] T1: Un ajuste que modifica un criterio desbloquea sus tests y vuelve al gate 2
  - files: packages/core/src/schema/state.ts, packages/cli/src/flow/adjusted-tests.ts, packages/cli/src/commands/approve.ts, packages/cli/src/commands/tests.ts, packages/cli/test/adjusted-tests.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/schema && pnpm --filter @baquia-dev/specty exec vitest run test/adjusted-tests.test.ts test/bug-cycle.test.ts test/testing-phase.test.ts
- [x] T2: La documentación de los ajustes con contract
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - type: docs

## Riesgos

- R1: Un criterio reescrito con otras palabras pero el mismo sentido desbloquea sus tests sin necesidad. Mitigación: el agente los vuelve a enviar tal cual si siguen valiendo, y la persona los aprueba en el gate 2.

## Cierre

### Resumen

Con este corte, y los dos cambios anteriores, C4 queda completo:
- **Bugs:** un bug pasa por el rojo y queda bloqueado sin la persona.
- **Refactors:** un `refactor` o un `perf` no puede quitar aserciones con `contract`.
- **Refinamientos:** el ajuste que modifica un criterio desbloquea los tests que llevan su id (`spec.approved` anota `unlocked`) y vuelve a la fase de tests con el ciclo de una feature y el gate 2, aunque sus tareas sean `fix`.
- **Defectos:** un ajuste que solo añade un `fix` sigue el ciclo de un bug.

`flow/adjusted-tests.ts` decide el ciclo al aprobar, y `state.json` lo guarda en `testCycle` mientras el cambio está en `testing`. formats y ARCHITECTURE §4 y §12 lo documentan.

### Desviaciones

- La construcción del estado aprobado pasó a `approvalState` en `approve.ts`: con el ciclo y el desbloqueo, `approved` llegaba a 51 líneas y a complejidad 11.
- La prueba del defecto añade su test nuevo a «Archivos», porque un ajuste no puede usar en una tarea un archivo que no está ahí.

### Decisiones

- El ciclo se decide al aprobar y se guarda, y no al enviar los tests: al enviarlos ya no queda la revisión aprobada antes del ajuste para comparar qué criterios cambiaron.
- Un criterio nuevo no desbloquea nada: aún no tiene tests bloqueados.

### Pendientes

- La UI de la fase de tests, de los bloqueos y de la matriz de criterios (C6).
