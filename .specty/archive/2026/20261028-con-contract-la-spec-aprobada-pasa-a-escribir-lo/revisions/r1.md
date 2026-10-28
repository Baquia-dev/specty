---
kind: standard
follows:
  - 20261028-la-fase-de-tests-en-el-modelo-y-en-cada-vista
---

# Con contract, la spec aprobada pasa a escribir los tests

## Objetivo

El cambio anterior dejó la fase `testing` en el modelo y en cada vista, pero sin entrada. Este abre la entrada. Con `policy.tests: contract`, aprobar la spec de un cambio `standard` con alguna tarea `feat` lo lleva a `testing` en vez de a `implementing`. En esa fase el guard solo deja escribir los tests de los archivos del cambio, y el fin de turno del agente revisa el diff con el plan aprobado, como al implementar. Sin `contract`, nada cambia.

## Fuera de alcance

- Enviar los tests con `specty propose`, el rojo y el gate 2 con `specty approve`: los cambios siguientes. Hasta entonces, un cambio con `contract` que entra en `testing` solo puede cancelarse.
- La fase de tests de los bugs, los refactors y los ajustes (C4), y bloquear los tests aprobados (C3).
- Hacer `contract` el valor por defecto (ADR 0014).

## Supuestos

- A1: Pasa por `testing` un cambio `standard` con alguna tarea `feat`, que es el tipo por defecto, y `policy.tests: contract`; uno `quick`, `spike`, `epic` o `retro`, o sin tareas pendientes, no pasa (A1 de la épica).
  - impacto: alto
- A2: Los tests que se pueden escribir en `testing` son los archivos de test que están en «Archivos» o en las tareas, y los tests implícitos de esos archivos, como el alcance de una tarea, pero de todo el cambio.
- A3: `contract` es más estricto que `required`, así que una tarea `feat` o `fix` sin tests en sus archivos también es un error al proponer.

## Criterios de aceptación

- AC1: CUANDO `config.yaml` tiene `policy.tests: contract` ENTONCES Specty lo acepta, y al proponer una tarea `feat` o `fix` sin tests en sus archivos es un error, como con `required`.
- AC2: CUANDO se aprueba la spec de un cambio que pasa por la fase de tests (A1) ENTONCES el cambio entra en `testing` y la tarjeta que sigue es la de la fase de tests.
- AC3: CUANDO `policy.tests` no es `contract`, o el cambio no pasa por la fase de tests (A1) ENTONCES aprobar la spec lo lleva a `implementing`, como hasta ahora.
- AC4: CUANDO un cambio está en `testing` ENTONCES el guard deja escribir los tests de sus archivos y rechaza el resto del código gobernado con un SIGUIENTE que lleva a `specty propose`.
- AC5: CUANDO el agente termina un turno con un cambio en `testing` ENTONCES el fin de turno revisa el diff con el plan aprobado, como en `implementing`.
- AC6: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES dicen qué es `contract`, cuándo se entra en `testing` y qué deja escribir.
  - test: manual

## Diseño

- `TestsPolicy` gana `contract`. `testsFirst(spec, policy)` en `validate/quality.ts`, junto a `testRules`, dice si un cambio pasa por la fase de tests (A1).
- El evento `approve` de la máquina lleva `testsFirst`: con él y tareas pendientes, `review` va a `testing`. `approve.ts` lo calcula con la spec que se aprueba.
- Los permisos de `testing` abren el código a los tests (`CodeAccess` `tests`). El guard recibe los archivos del cambio en `GuardChange.files`, y en `testing` solo deja un test de esos archivos (A2); lo demás se rechaza con la regla `phase`.
- `agent-stop` cuenta `testing` entre las fases con un plan aprobado.

## Archivos

- modificar packages/core/src/schema/config.ts — `contract` en `policy.tests`
- modificar packages/core/src/validate/quality.ts — `testsFirst`, y sin tests es un error con `contract`
- modificar packages/core/src/flow/machine.ts — `approve` con `testsFirst` lleva a `testing`
- modificar packages/core/src/flow/phases.ts — en `testing` el código se abre a los tests
- modificar packages/core/src/guard/decide.ts — en `testing`, solo los tests de los archivos del cambio
- modificar packages/core/src/index.ts — exporta `testsFirst`
- modificar packages/cli/src/commands/approve.ts — aprueba hacia `testing` cuando toca
- modificar packages/cli/src/enforce/guard.ts — los archivos del cambio para el guard en `testing`
- modificar packages/cli/src/enforce/agent-stop.ts — `testing` tiene un plan aprobado
- crear packages/cli/test/testing-phase.test.ts — aprobar hacia `testing`, el guard y el fin de turno en esa fase
- modificar docs/formats.md — `contract` y la fase `testing`
- modificar docs/ARCHITECTURE.md — §4: la entrada en `testing` y qué deja escribir

## Tareas

- [ ] T1: Con contract, aprobar la spec de una feature lleva a testing
  - files: packages/core/src/schema/config.ts, packages/core/src/validate/quality.ts, packages/core/src/flow/machine.ts, packages/core/src/index.ts, packages/cli/src/commands/approve.ts, packages/cli/test/testing-phase.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/validate test/flow && pnpm --filter @baquia-dev/specty exec vitest run test/testing-phase.test.ts
  - notes: el evento `approve` cambia de forma, así que `approve.ts` va en la misma tarea para que los tipos sigan en verde.
- [ ] T2: En testing, el guard solo deja escribir los tests del cambio
  - files: packages/core/src/flow/phases.ts, packages/core/src/guard/decide.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/testing-phase.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard test/flow && pnpm --filter @baquia-dev/specty exec vitest run test/testing-phase.test.ts
- [ ] T3: El fin de turno revisa el plan en testing; la documentación
  - files: packages/cli/src/enforce/agent-stop.ts, packages/cli/test/testing-phase.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/testing-phase.test.ts test/check-agent-stop.test.ts

## Riesgos

- R1: Hasta el cambio siguiente, un cambio con `contract` que entra en `testing` no puede enviar sus tests. Mitigación: `contract` es opcional y nadie lo usa todavía (A7 de la épica); el cambio siguiente añade el envío y el gate 2.
