---
kind: standard
epic: 20261027-tests-como-contrato-y-vocabulario-del-dominio
slice: C3
follows:
  - 20261028-los-tests-aprobados-quedan-bloqueados
---

# Los tests aprobados no se pueden cambiar sin permiso de la persona

## Objetivo

Los tests que aprueba la persona con `policy.tests: contract` ya quedan bloqueados: el guard no deja tocarlos y `tests-locked` falla si cambian. Pero si uno está mal, no hay forma de corregirlo. Este corte cierra C3 con el desbloqueo:
- el agente lo pide con `specty scope add` sobre el test, aunque el archivo ya esté en el alcance de su tarea;
- la solicitud nunca se aprueba sola y la decide solo la persona, también en modo delegado;
- aprobada, el test queda abierto para esa tarea, en el guard y en `tests-locked`;
- al completar la tarea, la versión nueva queda bloqueada con su hash;
- la aceptación muestra qué tests se desbloquearon.

## Fuera de alcance

- Desbloquear un test fuera de una tarea en curso, en la fase de tests o en la aceptación: el ciclo de los ajustes es de C4.
- Mostrar los bloqueos y las solicitudes en la UI (C6).

## Supuestos

- A1: El desbloqueo aprobado es una ampliación más de la tarea (`scopeExtra`): vale mientras la tarea está activa, y al completarla se vuelve a bloquear con el contenido nuevo.
  - impacto: alto
- A2: El agente en modo delegado no decide un desbloqueo, ni para aprobarlo ni para rechazarlo, como no ejecuta `delegate` ni `uninstall` (A2 de la épica).
- A3: Si un test desbloqueado ya no existe al completar la tarea, deja de estar bloqueado.

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty scope add` sobre un test bloqueado, aunque esté en el alcance de su tarea ENTONCES Specty crea una solicitud que no se aprueba sola, y la tarjeta dice que la decide solo la persona.
- AC2: CUANDO el agente intenta aprobar o rechazar en modo delegado una solicitud que desbloquea un test ENTONCES Specty no la decide y le pide que se la pase a la persona.
- AC3: CUANDO la persona aprueba el desbloqueo ENTONCES el guard deja editar ese test mientras su tarea está activa, y `tests-locked` no lo señala.
- AC4: CUANDO se completa la tarea que desbloqueó un test ENTONCES `lockedTests` guarda el hash de su versión nueva, y el guard vuelve a bloquearlo para las tareas siguientes.
- AC5: CUANDO el cambio llega a la aceptación con tests desbloqueados ENTONCES la tarjeta de aceptación los muestra, con su solicitud y su tarea.
- AC6: CUANDO el guard rechaza tocar un test bloqueado ENTONCES su SIGUIENTE nombra la solicitud de desbloqueo con `specty scope add`.
- AC7: CUANDO se leen docs/formats.md, docs/ARCHITECTURE.md, docs/checks.md y docs/checks.en.md ENTONCES dicen cómo se pide, se decide y se vuelve a bloquear un test.
  - test: manual

## Diseño

- `scope add`: una ruta bloqueada que no está en `scopeExtra` de la tarea cuenta como pedida aunque esté en el alcance, y la solicitud va siempre a la persona. `scopeRequestedCard` gana la variante de desbloqueo.
- `approve --scope` y `reject --scope`: con una ruta bloqueada en la solicitud, el agente recibe `unlockRefusedCard`. Lo que aprueba la persona queda en `scope.decided` con `unlock` y la tarea.
- El guard y `tests-locked` dejan fuera las rutas bloqueadas que están en `scopeExtra` de la tarea activa de su cambio.
- `task done` vuelve a calcular el hash de cada test desbloqueado de la tarea. La vista de aceptación lee `unlockedTests` de la auditoría.

## Archivos

- modificar packages/core/src/guard/testing.ts — el SIGUIENTE del guard nombra el desbloqueo
- modificar packages/core/src/guard/decide.ts — la tarea del desbloqueo en el texto
- modificar packages/core/src/cards/flow.ts — la variante de desbloqueo de la solicitud
- modificar packages/core/src/cards/testing.ts — `unlockRefusedCard`
- modificar packages/core/src/cards/index.ts — exporta `unlockRefusedCard`
- modificar packages/core/src/cards/view.ts — `unlockedTests`
- modificar packages/core/src/cards/work.ts — los tests desbloqueados en la aceptación
- modificar packages/cli/src/commands/scope.ts — la solicitud de desbloqueo
- modificar packages/cli/src/commands/scope-decision.ts — solo la persona decide un desbloqueo
- modificar packages/cli/src/enforce/guard.ts — un test desbloqueado queda abierto para su tarea
- modificar packages/cli/src/check/locked.ts — `tests-locked` deja fuera lo desbloqueado
- modificar packages/cli/src/flow/task-done.ts — el hash nuevo al completar la tarea
- modificar packages/cli/src/flow/views.ts — los tests desbloqueados de la aceptación
- modificar packages/cli/test/test-locks.test.ts — pedir, decidir, editar y volver a bloquear
- modificar docs/formats.md — `scope.decided` con `unlock` y `lockedTests` al completar una tarea
- modificar docs/ARCHITECTURE.md — §4 y §8: el desbloqueo de un test
- modificar docs/checks.md — `tests-locked` y lo desbloqueado
- modificar docs/checks.en.md — `tests-locked` y lo desbloqueado

## Tareas

- [ ] T1: Los textos del desbloqueo
  - files: packages/core/src/guard/testing.ts, packages/core/src/guard/decide.ts, packages/core/src/cards/flow.ts, packages/core/src/cards/testing.ts, packages/core/src/cards/index.ts
  - ac: AC1, AC2, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard test/cards && pnpm --filter @baquia-dev/specty-core typecheck
- [ ] T2: Pedir y decidir el desbloqueo
  - files: packages/cli/src/commands/scope.ts, packages/cli/src/commands/scope-decision.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/check/locked.ts, packages/cli/test/test-locks.test.ts
  - ac: AC1, AC2, AC3, AC6
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/test-locks.test.ts
- [ ] T3: Volver a bloquear y mostrarlo en la aceptación
  - files: packages/cli/src/flow/task-done.ts, packages/cli/src/flow/views.ts, packages/core/src/cards/view.ts, packages/core/src/cards/work.ts, packages/cli/test/test-locks.test.ts, docs/formats.md, docs/ARCHITECTURE.md, docs/checks.md, docs/checks.en.md
  - ac: AC4, AC5, AC7
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/test-locks.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards

## Riesgos

- R1: Un desbloqueo deja la puerta abierta a debilitar el test para que pase. Mitigación: lo decide solo la persona, con la razón del agente delante, y la aceptación lo muestra.
- R2: `cards/index.ts` ya pasa de 300 líneas y crece con la exportación nueva. Mitigación: es la lista explícita de la API de textos de core; está anotado como pendiente.
