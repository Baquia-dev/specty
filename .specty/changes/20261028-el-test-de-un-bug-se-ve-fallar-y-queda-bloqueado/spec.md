---
kind: standard
follows:
  - 20261028-los-tests-aprobados-no-se-pueden-cambiar-sin-per
---

# El test de un bug se ve fallar y queda bloqueado sin esperar a la persona

## Objetivo

Con `policy.tests: contract`, solo una feature pasa por la fase de tests, y lo decide si la spec tiene alguna tarea `feat`, esté hecha o no. Eso deja dos huecos. Un bug no reproduce su fallo con un test antes de arreglarlo. Y al aprobar un ajuste de una feature, el cambio vuelve a `testing` aunque el ajuste no tenga nada que probar primero. Este cambio, el primero del corte C4 de la épica «Tests como contrato», decide el ciclo de tests por las tareas que quedan por hacer:
- una tarea `feat` pendiente en un cambio `standard`: el de una feature, con el gate 2;
- solo tareas `fix` pendientes, también en un `quick`: el de un bug. El test que reproduce el fallo pasa por el rojo y, en cuanto falla, queda bloqueado sin esperar a la persona;
- ninguna de las dos: sin fase de tests, como siempre.

## Fuera de alcance

- Que un `refactor` o un `perf` no pueda quitar aserciones con `contract` (AC12 de la épica) y que un ajuste desbloquee los tests de sus criterios modificados (AC13): los cambios siguientes del corte C4.
- La UI de la fase de tests (C6).

## Supuestos

- A1: Un cambio `quick` no tiene criterios ni gate 2: con una tarea `fix` y `contract`, sigue el ciclo de un bug; con una `feat`, no pasa por la fase de tests (A1 de la épica).
  - impacto: alto
- A2: En el ciclo de un bug, el rojo es el mismo que en una feature: la verificación de las tareas `fix` falla y su salida nombra cada test nuevo, y cada criterio de esas tareas tiene un test nuevo con su id. Lo que cambia es que no se espera a la persona.
- A3: Los tests en rojo de un bug quedan en `lockedTests` igual que los aprobados por la persona, y la auditoría lo anota con `tests.locked`, de Specty.

## Criterios de aceptación

- AC1: CUANDO se aprueba la spec de un cambio con `contract` cuyas tareas pendientes son solo `fix`, `standard` o `quick` ENTONCES el cambio entra en `testing`.
- AC2: CUANDO el agente envía en ese cambio un test que falla y la verificación lo nombra ENTONCES Specty hace el commit del test, lo bloquea, anota `tests.proposed` y `tests.locked`, y el cambio pasa a `implementing` sin esperar a la persona, con la tarjeta de su primera tarea.
- AC3: CUANDO se aprueba la spec de un cambio con `contract` sin tareas `feat` ni `fix` pendientes, o un `quick` con una `feat` ENTONCES el cambio no entra en `testing`.
- AC4: CUANDO se aprueba un ajuste de una feature con `contract` que solo añade tareas que no son `feat` ni `fix` ENTONCES el cambio pasa a `implementing`, sin volver a la fase de tests.
- AC5: CUANDO `specty audit` muestra `tests.locked` ENTONCES lo dice con palabras, en español y en inglés.
- AC6: CUANDO el test de fricción recorre un bug con `contract` siguiendo cada SIGUIENTE ENTONCES llega al final sin bloqueos y sus cifras quedan fijadas.
- AC7: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES dicen qué ciclo sigue cada cambio y el evento `tests.locked`.
  - test: manual

## Diseño

- `testCycle(spec, policy, done)` en `validate/quality.ts` sustituye a `testsFirst`. Mira solo las tareas que no están en `done`: `feature`, `bug` o nada.
- La máquina gana `confirmRed`, solo de Specty, que lleva de `testing` a `implementing`.
- `proposeTests`: en el ciclo de un bug, tras el rojo, bloquea los tests, anota los dos eventos, hace el commit y devuelve la tarjeta de la tarea con una línea delante (`testsLockedLead`).

## Archivos

- modificar packages/core/src/validate/quality.ts — `testCycle`
- modificar packages/core/src/flow/machine.ts — el evento `confirmRed`
- modificar packages/core/src/index.ts — exporta `testCycle`
- modificar packages/core/src/cards/audit.ts — `tests.locked` en palabras
- modificar packages/core/src/cards/testing.ts — `testsLockedLead`
- modificar packages/core/src/cards/index.ts — exporta `testsLockedLead`
- modificar packages/cli/src/commands/approve.ts — el ciclo por las tareas pendientes
- modificar packages/cli/src/commands/tests.ts — el bloqueo de los tests en rojo de un bug
- crear packages/cli/test/bug-cycle.test.ts — un bug con `contract`, en `standard` y en `quick`
- modificar packages/cli/test/friction.test.ts — el recorrido de un bug con `contract`
- modificar docs/formats.md — `tests.locked` y el ciclo de un bug
- modificar docs/ARCHITECTURE.md — §4: qué ciclo sigue cada cambio

## Tareas

- [ ] T1: El ciclo de tests por las tareas pendientes y el evento confirmRed
  - files: packages/core/src/validate/quality.ts, packages/core/src/flow/machine.ts, packages/core/src/index.ts, packages/cli/src/commands/approve.ts, packages/cli/test/bug-cycle.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/validate test/flow && pnpm --filter @baquia-dev/specty exec vitest run test/bug-cycle.test.ts test/testing-phase.test.ts
- [ ] T2: Los tests en rojo de un bug quedan bloqueados solos
  - files: packages/core/src/cards/audit.ts, packages/core/src/cards/testing.ts, packages/core/src/cards/index.ts, packages/cli/src/commands/tests.ts, packages/cli/test/bug-cycle.test.ts
  - ac: AC2, AC5
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards && pnpm --filter @baquia-dev/specty exec vitest run test/bug-cycle.test.ts
- [ ] T3: La fricción de un bug y la documentación
  - files: packages/cli/test/friction.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/friction.test.ts

## Riesgos

- R1: Sin la persona, un test de bug mal escrito queda bloqueado. Mitigación: tiene que fallar nombrado por la verificación, la persona lo ve en la aceptación y puede desbloquearlo con `scope add` (C3).
